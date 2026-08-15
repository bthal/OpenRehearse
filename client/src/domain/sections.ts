import { XMLParser } from 'fast-xml-parser';
import { isRecord, stripBom, textFrom } from './musicxml';

/**
 * Notation-derived section detection. See specs/features/section-detection.md for
 * the rule table (R1–R8), the ending-run rule (R3a), the revert-suppression rule
 * (R5/R6) and the assembly algorithm this file implements.
 *
 * The guiding constraint: this reads only what the engraver wrote. It never makes
 * a content claim (no A/B/A′ letters, no similarity measure), and it declines —
 * returns an empty list — rather than guessing at a form it cannot see.
 */

/** Which rule produced a boundary. Kept on the result for debugging and spec traceability. */
export type SectionSource = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

export interface Section {
  /**
   * 0-based array position of this section's first measure within part[0].
   *
   * Never the MusicXML `number` attribute: that is a display string, not an index.
   * Real scores open with `<measure number="0" implicit="yes">`, repeat numbers, and
   * carry suffixes like `12a`.
   */
  startMeasureIndex: number;
  /** The display `number` of that measure, carried through for the UI and for debugging. */
  startMeasureNumber: string;
  /** Score-given name: `<rehearsal>` text, else a matched section word, else null. */
  name: string | null;
  /** Every rule that contributed to this boundary. Empty for the implicit opening boundary. */
  sources: SectionSource[];
  /** Merged rule weight, capped at 15. Absent for the implicit opening boundary. */
  score?: number;
}

// ── Tunables (all from the spec) ──────────────────────────────────────────────

/** Interior boundaries scoring below this are dropped. */
const MIN_BOUNDARY_SCORE = 5;
/** Merged weights are capped so one very well-marked junction cannot dominate the cap pass. */
const MAX_BOUNDARY_SCORE = 15;
/** Interior sections shorter than this collapse into their neighbour. */
const MIN_SECTION_MEASURES = 4;
/** A key/meter change that returns to the previous value within this many measures is an excursion. */
const REVERT_WINDOW_MEASURES = 4;
/** Hard ceiling on sections; beyond this the display stops being useful. */
const MAX_SECTIONS = 12;
/** Candidates this far apart or closer describe the same junction. */
const MERGE_DISTANCE = 1;
/** A `<words>` label longer than this is prose, not a section name; fall back to the vocabulary term. */
const MAX_WORDS_NAME_LENGTH = 32;

const WEIGHTS: Record<SectionSource, number> = {
  R1: 10,
  R2: 8,
  R3: 8,
  R4: 6,
  R5: 5,
  R6: 5,
  R7: 7,
  R8: 7,
};

/**
 * Section vocabulary — a whitelist, never a blacklist.
 *
 * Tempo and expression terms (Andante, Senza tempo, a tempo, rit., dolce, dynamics)
 * are deliberately absent: they are not a boundary signal on their own. A tempo term
 * may sit on a junction another rule already found, but contributes nothing by itself.
 */
const SECTION_VOCABULARY = [
  'intro',
  'introduction',
  'vorspiel',
  'verse',
  'strophe',
  'chorus',
  'refrain',
  'bridge',
  'interlude',
  'zwischenspiel',
  'outro',
  'coda',
  'trio',
  'menuetto',
  'minuet',
  'scherzo',
  'da capo',
  'd.c.',
  'dal segno',
  'd.s.',
  'fine',
  'variation',
  'var.',
  'theme',
  'thema',
  'exposition',
  'development',
  'recapitulation',
  'solo',
  'tag',
  'vamp',
  'turnaround',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-token matching: the term must not be glued to surrounding letters or digits,
// so "verse" does not fire inside "reverse" and "var." does not fire inside "variation".
const VOCABULARY_PATTERNS: { term: string; re: RegExp }[] = SECTION_VOCABULARY.map((term) => ({
  term,
  re: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:$|[^a-z0-9])`),
}));

/** Returns the canonical vocabulary term matched by `text`, or null. Case-insensitive. */
function matchSectionWord(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized === '') return null;
  for (const { term, re } of VOCABULARY_PATTERNS) {
    if (re.test(normalized)) return term;
  }
  return null;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

// Tags that must always be arrays so a single occurrence and several occurrences
// take the same code path.
const ARRAY_TAGS = new Set([
  'part',
  'measure',
  'direction',
  'direction-type',
  'barline',
  'words',
  'rehearsal',
  'ending',
  'attributes',
  'sound',
  'key',
  'time',
]);

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return v == null ? [] : [v];
}

function attr(node: unknown, name: string): string | null {
  if (!isRecord(node)) return null;
  const raw = node[`@_${name}`];
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

/** Everything a single measure contributes to boundary detection. */
interface MeasureFacts {
  number: string;
  rehearsals: string[];
  sectionWords: { term: string; text: string }[];
  hasForwardRepeat: boolean;
  hasBackwardRepeat: boolean;
  /** Right-barline style with no repeat attached — the R4 signal. */
  plainRightBarStyle: string | null;
  endingTypes: string[];
  keyFifths: number | null;
  timeSignature: string | null;
  hasNavigationMark: boolean;
}

function emptyFacts(number: string): MeasureFacts {
  return {
    number,
    rehearsals: [],
    sectionWords: [],
    hasForwardRepeat: false,
    hasBackwardRepeat: false,
    plainRightBarStyle: null,
    endingTypes: [],
    keyFifths: null,
    timeSignature: null,
    hasNavigationMark: false,
  };
}

function readDirections(measure: Record<string, unknown>, facts: MeasureFacts): void {
  for (const direction of asArray(measure['direction'])) {
    if (!isRecord(direction)) continue;

    for (const dt of asArray(direction['direction-type'])) {
      if (!isRecord(dt)) continue;

      for (const rehearsal of asArray(dt['rehearsal'])) {
        const text = textFrom(rehearsal);
        if (text) facts.rehearsals.push(text);
      }

      for (const words of asArray(dt['words'])) {
        const text = textFrom(words);
        if (!text) continue;
        const term = matchSectionWord(text);
        if (term) facts.sectionWords.push({ term, text });
      }

      if (dt['segno'] !== undefined || dt['coda'] !== undefined) facts.hasNavigationMark = true;
    }

    // <sound dacapo|dalsegno|fine|coda> can hang off the direction or the measure.
    for (const sound of asArray(direction['sound'])) {
      if (hasNavigationAttribute(sound)) facts.hasNavigationMark = true;
    }
  }

  for (const sound of asArray(measure['sound'])) {
    if (hasNavigationAttribute(sound)) facts.hasNavigationMark = true;
  }
}

function hasNavigationAttribute(sound: unknown): boolean {
  return (
    attr(sound, 'dacapo') !== null ||
    attr(sound, 'dalsegno') !== null ||
    attr(sound, 'fine') !== null ||
    attr(sound, 'coda') !== null
  );
}

function readBarlines(measure: Record<string, unknown>, facts: MeasureFacts): void {
  for (const barline of asArray(measure['barline'])) {
    if (!isRecord(barline)) continue;
    // MusicXML defaults <barline> to the right of the measure when location is absent.
    const location = attr(barline, 'location') ?? 'right';
    const barStyle = textFrom(barline['bar-style'])?.toLowerCase() ?? null;

    const repeat = barline['repeat'];
    const repeatDirection = repeat !== undefined ? attr(repeat, 'direction') : null;
    if (repeatDirection === 'forward') facts.hasForwardRepeat = true;
    if (repeatDirection === 'backward') facts.hasBackwardRepeat = true;

    for (const ending of asArray(barline['ending'])) {
      const type = attr(ending, 'type');
      if (type) facts.endingTypes.push(type);
    }

    // A light-heavy/heavy-light that belongs to a repeat is already counted by R2/R3;
    // only a bare section barline is an R4 signal.
    if (location === 'right' && barStyle !== null && repeatDirection === null) {
      facts.plainRightBarStyle = barStyle;
    }
  }
}

function readAttributes(measure: Record<string, unknown>, facts: MeasureFacts): void {
  for (const attributes of asArray(measure['attributes'])) {
    if (!isRecord(attributes)) continue;

    for (const key of asArray(attributes['key'])) {
      const fifths = isRecord(key) ? textFrom(key['fifths']) : undefined;
      const parsed = fifths !== undefined ? Number(fifths) : NaN;
      if (Number.isFinite(parsed)) facts.keyFifths = parsed;
    }

    for (const time of asArray(attributes['time'])) {
      if (!isRecord(time)) continue;
      const beats = textFrom(time['beats']);
      const beatType = textFrom(time['beat-type']);
      if (beats && beatType) facts.timeSignature = `${beats}/${beatType}`;
    }
  }
}

function readPart(part: unknown): MeasureFacts[] {
  if (!isRecord(part)) return [];
  return asArray(part['measure']).map((measure, index) => {
    const number = attr(measure, 'number') ?? String(index);
    const facts = emptyFacts(number);
    if (!isRecord(measure)) return facts;
    readDirections(measure, facts);
    readBarlines(measure, facts);
    readAttributes(measure, facts);
    return facts;
  });
}

// ── Candidate collection ──────────────────────────────────────────────────────

interface Candidate {
  index: number;
  source: SectionSource;
  /** Name this candidate can contribute, if any. */
  name?: string;
}

/**
 * R3a — endings belong to the section that precedes them.
 *
 * A backward repeat is not the end of a section when ending brackets follow it.
 * Walk forward from the repeat while measures carry `<ending>` markers or lie inside
 * an open bracket; the boundary is the first measure after that run. Without this the
 * bracketed measures each read as their own section.
 */
function endOfEndingRun(measures: MeasureFacts[], from: number): number {
  let index = from;
  let bracketOpen = false;

  while (index < measures.length) {
    const facts = measures[index];
    if (!facts) break;

    if (facts.endingTypes.length > 0) {
      if (facts.endingTypes.includes('start')) bracketOpen = true;
      if (facts.endingTypes.some((t) => t === 'stop' || t === 'discontinue')) bracketOpen = false;
      index++;
      continue;
    }
    if (bracketOpen) {
      index++;
      continue;
    }
    break;
  }

  return Math.max(index, from + 1);
}

/**
 * R5/R6 — a key or meter change that returns to the previous value within a few
 * measures is an excursion (a cadenza, a bar of 2/4 inside 12/8), not a section.
 *
 * Suppressed changes deliberately do not update the value in force, so a chain of
 * excursions is measured against the value the piece actually sits in. This is what
 * makes 12/8 → 6/4 → 2/4 → 12/8 collapse to nothing instead of leaving 2/4 stranded.
 */
function collectValueChanges(
  measures: MeasureFacts[],
  read: (facts: MeasureFacts) => string | number | null,
  source: SectionSource,
): Candidate[] {
  const declarations = measures.map(read);
  const candidates: Candidate[] = [];

  let inForce: string | number | null = null;
  for (let i = 0; i < declarations.length; i++) {
    const value = declarations[i] ?? null;
    if (value === null) continue;
    if (inForce === null) {
      inForce = value;
      continue;
    }
    if (value === inForce) continue;

    const limit = Math.min(declarations.length - 1, i + REVERT_WINDOW_MEASURES);
    let reverts = false;
    for (let j = i + 1; j <= limit; j++) {
      if (declarations[j] === inForce) {
        reverts = true;
        break;
      }
    }
    if (reverts) continue;

    candidates.push({ index: i, source });
    inForce = value;
  }

  return candidates;
}

function collectCandidates(primary: MeasureFacts[], others: MeasureFacts[][]): Candidate[] {
  const candidates: Candidate[] = [];

  const addMarks = (measures: MeasureFacts[]): void => {
    measures.forEach((facts, index) => {
      // R1 — rehearsal marks are the strongest signal an engraver can give.
      for (const text of facts.rehearsals) candidates.push({ index, source: 'R1', name: text });
      // R7 — section vocabulary.
      for (const { term, text } of facts.sectionWords) {
        const name = text.length <= MAX_WORDS_NAME_LENGTH ? text.replace(/\s+/g, ' ').trim() : term;
        candidates.push({ index, source: 'R7', name });
      }
      // R8 — navigation marks.
      if (facts.hasNavigationMark) candidates.push({ index, source: 'R8' });
    });
  };

  addMarks(primary);
  // Engravers sometimes attach a rehearsal mark to one staff only, so R1/R7/R8 are
  // merged across every part. Structural rules read part[0] alone.
  for (const other of others) addMarks(other);

  primary.forEach((facts, index) => {
    // R2 — a forward repeat opens a section.
    if (facts.hasForwardRepeat) candidates.push({ index, source: 'R2' });
    // R3 — a backward repeat closes one, but only after its endings (R3a).
    if (facts.hasBackwardRepeat) {
      const boundary = endOfEndingRun(primary, index);
      if (boundary < primary.length) candidates.push({ index: boundary, source: 'R3' });
    }
    // R4 — a bare section barline at the end of a measure opens the next one.
    if (facts.plainRightBarStyle === 'light-light' || facts.plainRightBarStyle === 'light-heavy') {
      if (index + 1 < primary.length) candidates.push({ index: index + 1, source: 'R4' });
    }
  });

  candidates.push(...collectValueChanges(primary, (f) => f.keyFifths, 'R5'));
  candidates.push(...collectValueChanges(primary, (f) => f.timeSignature, 'R6'));

  return candidates;
}

// ── Assembly ──────────────────────────────────────────────────────────────────

interface Boundary {
  index: number;
  score: number;
  sources: SectionSource[];
  name: string | null;
}

/**
 * Candidates within ±1 measure describe one junction, not several: a `light-light`
 * at the end of one measure and a key change plus forward repeat at the start of the
 * next are three engravings of the same event.
 *
 * The merged boundary sits at the index of its strongest candidate, which is what
 * moves an R3 boundary onto the rehearsal mark an engraver put one measure later.
 */
function mergeCandidates(candidates: Candidate[]): Boundary[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => a.index - b.index);
  const groups: Candidate[][] = [];
  let group: Candidate[] = [];
  let lastIndex = -Infinity;

  for (const candidate of sorted) {
    if (group.length > 0 && candidate.index - lastIndex > MERGE_DISTANCE) {
      groups.push(group);
      group = [];
    }
    group.push(candidate);
    lastIndex = candidate.index;
  }
  if (group.length > 0) groups.push(group);

  return groups.map((members) => {
    let best = members[0]!;
    for (const member of members) {
      if (WEIGHTS[member.source] > WEIGHTS[best.source]) best = member;
    }
    const score = Math.min(
      MAX_BOUNDARY_SCORE,
      members.reduce((sum, m) => sum + WEIGHTS[m.source], 0),
    );
    const sources = [...new Set(members.map((m) => m.source))].sort();
    // A rehearsal mark names a section; a vocabulary word only names one when no
    // rehearsal mark is present.
    const name =
      members.find((m) => m.source === 'R1' && m.name)?.name ??
      members.find((m) => m.source === 'R7' && m.name)?.name ??
      null;
    return { index: best.index, score, sources, name };
  });
}

/**
 * Interior sections must be at least MIN_SECTION_MEASURES long. The first and last
 * sections are exempt so pickups, short intros and codas survive — which is why this
 * only compares interior boundaries with each other.
 */
function enforceMinimumLength(interior: Boundary[]): Boundary[] {
  const kept: Boundary[] = [];
  for (const boundary of interior) {
    const previous = kept[kept.length - 1];
    if (previous && boundary.index - previous.index < MIN_SECTION_MEASURES) {
      // Ties go to the earlier boundary, so only a strictly better score displaces it.
      if (boundary.score > previous.score) kept[kept.length - 1] = boundary;
      continue;
    }
    kept.push(boundary);
  }
  return kept;
}

/**
 * Splits a score into formal sections using only notation the engraver wrote.
 *
 * Returns an empty list when the score yields fewer than two sections. That is a
 * deliberate decline, not a degenerate result: a piece whose form we cannot read has
 * no sections, rather than one section spanning the whole thing. Callers use the empty
 * list as the "show nothing" signal.
 *
 * Only `score-partwise` is analysed. `score-timewise` and `opus` pass import validation
 * but are not rendered by OSMD either, so there is nothing to align a section against.
 */
export function detectSections(xml: string): Section[] {
  let parsed: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      processEntities: false,
      trimValues: true,
      isArray: (name) => ARRAY_TAGS.has(name),
    });
    parsed = parser.parse(stripBom(xml)) as Record<string, unknown>;
  } catch {
    return [];
  }

  const root = parsed['score-partwise'];
  if (!isRecord(root)) return [];

  const parts = asArray(root['part']);
  if (parts.length === 0) return [];

  const primary = readPart(parts[0]);
  if (primary.length === 0) return [];
  const others = parts.slice(1).map(readPart);

  const merged = mergeCandidates(collectCandidates(primary, others));

  // The opening boundary is implicit and needs no score, but it does take any name
  // the engraver put on the first measure — scores really do mark "Intro" on a pickup.
  const opening = merged.find((b) => b.index === 0);
  const boundaries: Boundary[] = [
    { index: 0, score: 0, sources: opening?.sources ?? [], name: opening?.name ?? null },
    ...enforceMinimumLength(
      merged
        .filter((b) => b.index > 0 && b.score >= MIN_BOUNDARY_SCORE)
        .sort((a, b) => a.index - b.index),
    ),
  ];

  // Cap by keeping the best-marked junctions, then restore score order.
  let capped = boundaries;
  if (capped.length > MAX_SECTIONS) {
    const interior = capped
      .slice(1)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_SECTIONS - 1)
      .sort((a, b) => a.index - b.index);
    capped = [capped[0]!, ...interior];
  }

  if (capped.length < 2) return [];

  return capped.map((boundary) => ({
    startMeasureIndex: boundary.index,
    startMeasureNumber: primary[boundary.index]?.number ?? String(boundary.index),
    name: boundary.name,
    sources: boundary.sources,
    ...(boundary.index === 0 ? {} : { score: boundary.score }),
  }));
}

/**
 * `detectSections` with a hard guarantee that it never throws.
 *
 * Section detection is a nicety layered on top of import; a malformed edge case in
 * the rule engine must degrade to "no sections", never cost the user their import.
 * Import paths should call this rather than `detectSections` directly.
 */
export function detectSectionsSafely(xml: string): Section[] {
  try {
    return detectSections(xml);
  } catch {
    return [];
  }
}

/**
 * Maps each section to an index into a color palette of `paletteSize` entries.
 *
 * Colors walk the palette in order, except that a name already seen reuses the color
 * it was given: two `Refrain` sections share a hue, which is the whole point of
 * coloring them. Unnamed sections are not the same section as each other, so each
 * takes the next slot.
 */
export function assignSectionColorIndices(sections: Section[], paletteSize: number): number[] {
  if (paletteSize <= 0) return sections.map(() => 0);

  const byName = new Map<string, number>();
  let next = 0;

  return sections.map((section) => {
    const key = section.name?.trim().toLowerCase();
    if (key) {
      const existing = byName.get(key);
      if (existing !== undefined) return existing;
      const assigned = next++ % paletteSize;
      byName.set(key, assigned);
      return assigned;
    }
    return next++ % paletteSize;
  });
}
