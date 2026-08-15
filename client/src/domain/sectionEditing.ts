import { assignSectionColorIndices, detectSectionsSafely, type Section } from './sections';

/**
 * User editing of sections — pure, no React, no repository, no theme import.
 *
 * The model is a **tiling**: sections cover the piece with no gaps and no overlaps, so
 * a section is fully described by where it starts. That is why `Section` has no `end`
 * field: the end of section k is the start of section k+1, minus one, and storing it
 * would create a second source of truth that can disagree with the neighbour.
 *
 * The consequence worth internalising is that there is no such thing as "editing one
 * section's bounds". The editable things are the n-1 *junctions* between sections;
 * moving one always changes exactly two sections. `setBoundary` is the single
 * primitive behind both the "from" field of section k and the "to" field of k-1.
 *
 * Every function returns a new array, and every function preserves the invariants:
 * at least one section, the first starting at index 0, starts strictly ascending, and
 * therefore every section at least one measure long. Operations that cannot preserve
 * them return the input unchanged rather than throwing — the caller is a text field,
 * and a half-typed measure number is a normal state, not an error.
 *
 * NOTE: `MIN_SECTION_MEASURES`, `MAX_SECTIONS` and `MIN_BOUNDARY_SCORE` in `sections.ts`
 * are *detector* tunables and deliberately do not apply here. They exist to stop the
 * rule engine emitting noise from a score it half-understands. A user who marks a
 * one-bar section or twenty sections has said what they want, and that is the end of it.
 * Do not "unify" them.
 */

/** Resolves an array index to the number printed on the page. Supplied by `measureMap`. */
export type PrintedNumberAt = (index: number) => string | null;

export interface SectionSpan {
  startIndex: number;
  /** Inclusive. Derived, never stored. */
  endIndex: number;
  measureCount: number;
}

/** Colors cross into CSS by string concatenation in the WebView; only this shape may. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function nameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * The color of an earlier section carrying the same name, if any.
 *
 * This is what gives an A-B-A form one hue for both A's. Matching is on the name the
 * user sees, so it is case- and whitespace-insensitive; unnamed sections never match
 * each other, because two blank names are not a claim that they are the same music.
 */
function colorOfMatchingName(
  sections: Section[],
  name: string | null,
  selfIndex: number,
): string | undefined {
  const key = nameKey(name);
  if (key === '') return undefined;
  for (let i = 0; i < sections.length; i++) {
    if (i === selfIndex) continue;
    const section = sections[i]!;
    if (nameKey(section.name) === key && isValidColor(section.color)) return section.color;
  }
  return undefined;
}

/** The first palette entry no section is using; falls back to walking the palette. */
function nextUnusedColor(sections: Section[], palette: readonly string[], skipIndex = -1): string {
  const used = new Set(
    sections
      .filter((_, i) => i !== skipIndex)
      .map((s) => s.color?.toUpperCase())
      .filter((c): c is string => c !== undefined),
  );
  const free = palette.find((c) => !used.has(c.toUpperCase()));
  return free ?? palette[sections.length % palette.length] ?? palette[0]!;
}

/**
 * Forces the invariants onto an arbitrary section list.
 *
 * This is the boundary between "whatever was in the database" and the rest of the app.
 * It runs on every read, so every consumer past the repository can assume a well-formed
 * tiling and a valid color, and none of them needs a defensive branch.
 *
 * `undefined` and `[]` both become a single whole-piece section. A piece whose form we
 * cannot read has one section, not zero — the PlayView simply does not label a piece
 * with a single section, which is how "no sections" continues to look unchanged.
 *
 * `measureCount` is optional because the repository normalises without having read the
 * XML. When supplied, boundaries past the end of the score are dropped.
 */
export function normaliseSections(
  sections: Section[] | undefined,
  palette: readonly string[],
  measureCount?: number,
): Section[] {
  const input = Array.isArray(sections) ? sections : [];

  const cleaned = input
    .filter((s): s is Section => s != null && Number.isInteger(s.startMeasureIndex))
    .filter((s) => s.startMeasureIndex >= 0)
    .filter((s) => measureCount === undefined || s.startMeasureIndex < measureCount)
    .sort((a, b) => a.startMeasureIndex - b.startMeasureIndex);

  // Distinct sections cannot share a start; the earlier one would have zero measures.
  const deduped: Section[] = [];
  for (const section of cleaned) {
    if (deduped[deduped.length - 1]?.startMeasureIndex === section.startMeasureIndex) continue;
    deduped.push(section);
  }

  if (deduped.length === 0) {
    return [
      {
        startMeasureIndex: 0,
        // Unknown without the score. The editor repairs it once the measure map loads.
        startMeasureNumber: '',
        name: null,
        color: palette[0]!,
        sources: [],
      },
    ];
  }

  // The tiling has to start at measure 0, whatever was stored.
  if (deduped[0]!.startMeasureIndex !== 0) {
    deduped[0] = { ...deduped[0]!, startMeasureIndex: 0, startMeasureNumber: '', sources: [] };
  }

  // Fill missing or malformed colors with the derivation sections used before colors
  // were stored, so a piece imported under the old code keeps exactly the hues it had.
  const derived = assignSectionColorIndices(deduped, palette.length);
  return deduped.map((section, i) => ({
    ...section,
    color: isValidColor(section.color) ? section.color : palette[derived[i]!]!,
  }));
}

/** `normaliseSections(detectSectionsSafely(xml))` — what import, seeding and reset all want. */
export function sectionsFromXml(xml: string, palette: readonly string[]): Section[] {
  return normaliseSections(detectSectionsSafely(xml), palette);
}

/** Derived start/end pairs. The editor's only source for the "to" column. */
export function sectionSpans(sections: Section[], measureCount: number): SectionSpan[] {
  return sections.map((section, i) => {
    const startIndex = section.startMeasureIndex;
    const endIndex = (sections[i + 1]?.startMeasureIndex ?? measureCount) - 1;
    return { startIndex, endIndex, measureCount: endIndex - startIndex + 1 };
  });
}

/** True when `sections` covers exactly [0, measureCount) with no gap or overlap. */
export function isTiling(sections: Section[], measureCount: number): boolean {
  if (sections.length === 0) return false;
  if (sections[0]!.startMeasureIndex !== 0) return false;
  for (let i = 1; i < sections.length; i++) {
    if (sections[i]!.startMeasureIndex <= sections[i - 1]!.startMeasureIndex) return false;
  }
  return sections[sections.length - 1]!.startMeasureIndex < measureCount;
}

/**
 * The range a junction may be moved into, exclusive of both neighbours.
 *
 * Exclusivity is what guarantees every section keeps at least one measure — the only
 * structural limit on section size. Returns null for junction 0, which is pinned.
 */
export function boundaryRange(
  sections: Section[],
  index: number,
  measureCount: number,
): { min: number; max: number } | null {
  if (index <= 0 || index >= sections.length) return null;
  const min = sections[index - 1]!.startMeasureIndex + 1;
  const max = (sections[index + 1]?.startMeasureIndex ?? measureCount) - 1;
  return min > max ? null : { min, max };
}

/**
 * Renames section `index` to exactly what was typed. Name only.
 *
 * Deliberately does NOT trim, because this runs on every keystroke: trimming here means
 * the space in "Da Capo" is deleted the instant it is typed, and the name can never
 * contain one. Trimming belongs in `commitName`, which runs when the field is left.
 *
 * Colour matching is likewise not done here — typing "Chorus" passes through "C", "Ch",
 * "Cho"…, and a transient match on any of those would repaint the row mid-word.
 *
 * An empty name is legal and stores as null: the PlayView falls back to "Section N".
 */
export function renameSection(sections: Section[], index: number, name: string): Section[] {
  if (!sections[index]) return sections;
  return sections.map((section, i) =>
    i === index ? { ...section, name: name === '' ? null : name } : section,
  );
}

/**
 * Settles a name once the user leaves the field: trims it, then adopts the color of any
 * other section carrying it.
 */
export function commitName(sections: Section[], index: number): Section[] {
  const current = sections[index];
  if (!current) return sections;
  const raw = current.name ?? '';
  const trimmed = raw.trim();
  const settled =
    trimmed === raw
      ? sections
      : sections.map((section, i) =>
          i === index ? { ...section, name: trimmed === '' ? null : trimmed } : section,
        );
  return syncColorToName(settled, index);
}

/**
 * Adopts the color of another section sharing this section's name.
 *
 * Only ever pulls a color in — if nothing matches, the color is left alone, so
 * correcting a typo in a section you hand-colored cannot repaint it. UI should call
 * `commitName`, which also trims.
 */
export function syncColorToName(sections: Section[], index: number): Section[] {
  const current = sections[index];
  if (!current) return sections;
  const adopted = colorOfMatchingName(sections, current.name, index);
  if (adopted === undefined || adopted === current.color) return sections;
  return sections.map((section, i) => (i === index ? { ...section, color: adopted } : section));
}

/**
 * Sets an explicit color, and mirrors it onto every section sharing the same name.
 *
 * Two sections called "Refrain" are a claim that they are the same music, so they carry
 * one color — recoloring either has to move both, or the claim quietly stops being true
 * the moment the user picks a hue. Unnamed sections never mirror: two blank names are
 * not a claim about anything.
 */
export function recolorSection(sections: Section[], index: number, color: string): Section[] {
  const target = sections[index];
  if (!target || !isValidColor(color)) return sections;
  const key = nameKey(target.name);
  return sections.map((section, i) =>
    i === index || (key !== '' && nameKey(section.name) === key) ? { ...section, color } : section,
  );
}

/**
 * Moves the junction at `index` — equivalently, sets where section `index` starts and
 * where section `index-1` ends. Returns the input unchanged if the move is not legal.
 *
 * `sources` is emptied and `score` dropped, because after a user moves a boundary no
 * detection rule vouches for it any more, and leaving `['R1']` on a measure with no
 * rehearsal mark would be a lie in the one field whose stated job is traceability.
 */
export function setBoundary(
  sections: Section[],
  index: number,
  startMeasureIndex: number,
  measureCount: number,
  printedNumberAt: PrintedNumberAt,
): Section[] {
  const range = boundaryRange(sections, index, measureCount);
  if (!range) return sections;
  if (startMeasureIndex < range.min || startMeasureIndex > range.max) return sections;
  if (startMeasureIndex === sections[index]!.startMeasureIndex) return sections;

  return sections.map((section, i) => {
    if (i !== index) return section;
    const { score: _dropped, ...rest } = section;
    return {
      ...rest,
      startMeasureIndex,
      startMeasureNumber: printedNumberAt(startMeasureIndex) ?? section.startMeasureNumber,
      sources: [],
    };
  });
}

/**
 * Splits section `index` in two at `startMeasureIndex`, which must lie strictly inside
 * it — so a one-measure section cannot be split, there being no interior position.
 *
 * This is how sections are added. Splitting rather than "creating a range" is what keeps
 * the tiling true at every intermediate step: there is no moment where the new section
 * overlaps its neighbour or leaves a gap that the user then has to clean up.
 */
export function splitSection(
  sections: Section[],
  index: number,
  startMeasureIndex: number,
  measureCount: number,
  palette: readonly string[],
  printedNumberAt: PrintedNumberAt,
  name: string | null = null,
): Section[] {
  const current = sections[index];
  if (!current) return sections;

  const end = (sections[index + 1]?.startMeasureIndex ?? measureCount) - 1;
  if (startMeasureIndex <= current.startMeasureIndex || startMeasureIndex > end) return sections;

  const trimmed = name?.trim() ?? '';
  const nextName = trimmed === '' ? null : trimmed;

  const created: Section = {
    startMeasureIndex,
    startMeasureNumber: printedNumberAt(startMeasureIndex) ?? '',
    name: nextName,
    color: colorOfMatchingName(sections, nextName, -1) ?? nextUnusedColor(sections, palette),
    sources: [],
  };

  return [...sections.slice(0, index + 1), created, ...sections.slice(index + 1)];
}

/**
 * Removes section `index`, giving its measures to a neighbour — the tiling admits no
 * other outcome, since the measures have to belong to something.
 *
 * `'previous'` simply drops the boundary. `'next'` drops it and pulls the successor's
 * start back over the vacated measures, which is a boundary move and so re-stamps the
 * survivor's provenance. Section 0 has no predecessor and must absorb `'next'`.
 * Refuses at length 1: a piece always has at least one section.
 */
export function deleteSection(
  sections: Section[],
  index: number,
  absorb: 'previous' | 'next',
): Section[] {
  if (sections.length <= 1) return sections;
  const removed = sections[index];
  if (!removed) return sections;

  const direction = index === 0 ? 'next' : index === sections.length - 1 ? 'previous' : absorb;
  const remaining = sections.filter((_, i) => i !== index);

  if (direction === 'previous') return remaining;

  // The successor now starts where the removed section did.
  const successorIndex = index;
  return remaining.map((section, i) => {
    if (i !== successorIndex) return section;
    const { score: _dropped, ...rest } = section;
    return {
      ...rest,
      startMeasureIndex: removed.startMeasureIndex,
      startMeasureNumber: removed.startMeasureNumber,
      sources: [],
    };
  });
}

/**
 * Repairs cached printed numbers against a freshly loaded measure map.
 *
 * `startMeasureNumber` caches a value only the score knows, so it can be stale from an
 * older export, and the section normalisation synthesizes has none at all.
 */
export function refreshPrintedNumbers(
  sections: Section[],
  printedNumberAt: PrintedNumberAt,
): Section[] {
  return sections.map((section) => {
    const printed = printedNumberAt(section.startMeasureIndex);
    return printed === null || printed === section.startMeasureNumber
      ? section
      : { ...section, startMeasureNumber: printed };
  });
}

/** Field-wise equality — not JSON.stringify, whose output depends on key insertion order. */
export function sectionsEqual(a: Section[], b: Section[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((section, i) => {
    const other = b[i]!;
    return (
      section.startMeasureIndex === other.startMeasureIndex &&
      section.name === other.name &&
      section.color === other.color
    );
  });
}
