import { XMLParser } from 'fast-xml-parser';
import { isRecord, stripBom } from './musicxml';

/**
 * Printed measure number ↔ array index, for the section editor.
 *
 * Sections are stored as 0-based array positions into `part[0]` (see `sections.ts`),
 * but a user editing a section types the number engraved on the page. There is no
 * arithmetic that relates the two:
 *
 *   - A score with a pickup opens `<measure number="0" implicit="yes">`, so printed
 *     number equals array index. Without a pickup, printed number is index + 1.
 *   - Numbers repeat, and carry suffixes like `12a` / `9b` around repeats and endings.
 *   - A multirest collapses many printed numbers into one `<measure>`, so numbering
 *     can jump while the index advances by one.
 *
 * So the mapping is read out of the file rather than computed. This module is also the
 * only source of a measure *count* in native code — nothing persists one, and OSMD's
 * count lives in the WebView, which is not loaded on the screen that owns the editor.
 *
 * Printed numbers are trimmed and lowercased exactly as `sections.ts#attr` does, so
 * `entries[i].number` always equals the `startMeasureNumber` detection stored for the
 * same measure. Diverging here would make the two modules disagree about one score.
 */

export interface MeasureEntry {
  /** 0-based array position within `part[0]` — the unit `Section.startMeasureIndex` uses. */
  index: number;
  /** Printed `number` attribute, trimmed and lowercased; `String(index)` when absent. */
  number: string;
  /** True for a pickup/anacrusis measure, so the UI can label it rather than confuse the user. */
  implicit: boolean;
}

export interface MeasureMap {
  entries: MeasureEntry[];
  /** `entries.length`. The measure count that exists nowhere else outside the WebView. */
  count: number;
  /** Printed number → every index carrying it, ascending. Repeated numbers are real. */
  byNumber: ReadonlyMap<string, readonly number[]>;
}

export type MeasureResolution =
  | { ok: true; index: number; ambiguous: boolean }
  | { ok: false; reason: 'empty' | 'unknown' | 'outOfRange' };

/** Same transform `sections.ts#attr` applies, so lookups match stored numbers. */
function normalisePrinted(s: string): string {
  return s.trim().toLowerCase();
}

// Only the two tags this module walks. Much cheaper than the detector's array set,
// which forces a dozen tags for rules we do not evaluate here.
const ARRAY_TAGS = new Set(['part', 'measure']);

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return v == null ? [] : [v];
}

function rawAttr(node: unknown, name: string): string | null {
  if (!isRecord(node)) return null;
  const raw = node[`@_${name}`];
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

/**
 * Builds the map from a MusicXML document.
 *
 * Returns null when there is nothing to map: `score-timewise` and `opus` (which pass
 * import validation but are not rendered by OSMD either), malformed XML, or a first
 * part with no measures. Callers surface that as the editor's degraded mode — a score
 * whose measures cannot be read can still have its one section renamed and recolored.
 */
export function parseMeasureMap(xml: string): MeasureMap | null {
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
    return null;
  }

  const root = parsed['score-partwise'];
  if (!isRecord(root)) return null;

  const parts = asArray(root['part']);
  if (parts.length === 0) return null;

  const primary = parts[0];
  if (!isRecord(primary)) return null;

  const entries: MeasureEntry[] = asArray(primary['measure']).map((measure, index) => ({
    index,
    number: rawAttr(measure, 'number') ?? String(index),
    implicit: rawAttr(measure, 'implicit') === 'yes',
  }));
  if (entries.length === 0) return null;

  const byNumber = new Map<string, number[]>();
  for (const entry of entries) {
    const bucket = byNumber.get(entry.number);
    if (bucket) bucket.push(entry.index);
    else byNumber.set(entry.number, [entry.index]);
  }

  return { entries, count: entries.length, byNumber };
}

/** The printed number at `index`, or null when out of range. */
export function printedNumberAt(map: MeasureMap, index: number): string | null {
  return map.entries[index]?.number ?? null;
}

/** True when `index` is a pickup measure. */
export function isImplicitAt(map: MeasureMap, index: number): boolean {
  return map.entries[index]?.implicit ?? false;
}

/** Every index carrying this printed number, ascending. Empty when none does. */
export function indicesOfPrintedNumber(map: MeasureMap, printed: string): readonly number[] {
  return map.byNumber.get(normalisePrinted(printed)) ?? [];
}

/**
 * Turns user-typed text into an array index. The single place that conversion happens.
 *
 * Resolution runs in two tiers:
 *   1. Exact match on the normalised printed number. `"9a"`, `"9A"` and `" 9a "` are one key.
 *   2. If that misses and the text is bare digits, the first measure printed as those
 *      digits plus a letter suffix — so typing `9` in a score that only engraves `9a`
 *      and `9b` lands on `9a` rather than failing.
 *
 * Where several measures carry the number, the earliest wins and `ambiguous` is set so
 * the caller can hint rather than silently choosing. `range` is inclusive and expresses
 * the caller's structural constraint (a boundary may not cross its neighbours).
 */
export function resolveMeasureInput(
  map: MeasureMap,
  text: string,
  range: { min: number; max: number },
): MeasureResolution {
  const query = normalisePrinted(text);
  if (query === '') return { ok: false, reason: 'empty' };

  let candidates = map.byNumber.get(query) ?? [];

  if (candidates.length === 0 && /^\d+$/.test(query)) {
    const suffixed = new RegExp(`^${query}[a-z]+$`);
    candidates = map.entries.filter((e) => suffixed.test(e.number)).map((e) => e.index);
  }

  if (candidates.length === 0) return { ok: false, reason: 'unknown' };

  // Prefer a match inside the allowed range: on a score with repeated numbering the
  // occurrence the user means is the one that could legally go here.
  const inRange = candidates.filter((i) => i >= range.min && i <= range.max);
  if (inRange.length === 0) return { ok: false, reason: 'outOfRange' };

  return { ok: true, index: inRange[0]!, ambiguous: candidates.length > 1 };
}
