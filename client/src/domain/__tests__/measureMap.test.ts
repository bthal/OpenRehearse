import {
  indicesOfPrintedNumber,
  isImplicitAt,
  parseMeasureMap,
  printedNumberAt,
  resolveMeasureInput,
  type MeasureMap,
} from '../measureMap';
import { detectSections } from '../sections';

// ── Fixture builders ────────────────────────────────────────────────────────
// Inline XML throughout: testfiles/ is gitignored, so no test may read from disk.

function measure(number: string | number, attrs = ''): string {
  return `<measure number="${number}"${attrs}></measure>`;
}

function makeScore(measures: string[], extraParts: string[][] = []): string {
  const parts = [measures, ...extraParts]
    .map((ms, i) => `<part id="P${i + 1}">${ms.join('')}</part>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">${parts}</score-partwise>`;
}

/** Non-null assert with a readable failure, since almost every test needs a map. */
function mapOf(xml: string): MeasureMap {
  const map = parseMeasureMap(xml);
  if (map === null) throw new Error('expected a parseable score');
  return map;
}

const FULL_RANGE = { min: 0, max: Number.MAX_SAFE_INTEGER };

// ── Declining ───────────────────────────────────────────────────────────────

describe('parseMeasureMap declines', () => {
  it.each([
    ['score-timewise', '<score-timewise><measure number="1"/></score-timewise>'],
    ['opus', '<opus><score>a.xml</score></opus>'],
    ['empty string', ''],
    ['malformed xml', '<score-partwise><part>'],
    ['a part with no measures', '<score-partwise><part id="P1"></part></score-partwise>'],
    ['no parts at all', '<score-partwise><part-list/></score-partwise>'],
  ])('returns null for %s', (_label, xml) => {
    expect(parseMeasureMap(xml)).toBeNull();
  });
});

// ── Numbering ───────────────────────────────────────────────────────────────

describe('printed numbers', () => {
  it('reads a plain 1-based score, where number is index + 1', () => {
    const map = mapOf(makeScore([measure(1), measure(2), measure(3)]));
    expect(map.count).toBe(3);
    expect(printedNumberAt(map, 0)).toBe('1');
    expect(resolveMeasureInput(map, '1', FULL_RANGE)).toEqual({
      ok: true,
      index: 0,
      ambiguous: false,
    });
  });

  it('reads an anacrusis, where number equals index', () => {
    // The trap this whole module exists for: on a pickup score the printed number
    // and the array index coincide, so `index + 1` would be wrong for every measure.
    const map = mapOf(makeScore([measure(0, ' implicit="yes"'), measure(1), measure(2)]));
    expect(printedNumberAt(map, 0)).toBe('0');
    expect(isImplicitAt(map, 0)).toBe(true);
    expect(isImplicitAt(map, 1)).toBe(false);
    expect(resolveMeasureInput(map, '1', FULL_RANGE)).toMatchObject({ ok: true, index: 1 });
  });

  it('falls back to the array position when number is absent', () => {
    // Must match sections.ts#readPart, which uses String(index) — not index + 1.
    const map = mapOf(makeScore(['<measure></measure>', '<measure></measure>']));
    expect(printedNumberAt(map, 0)).toBe('0');
    expect(printedNumberAt(map, 1)).toBe('1');
  });

  it('counts measures from the first part only', () => {
    const map = mapOf(makeScore([measure(1), measure(2)], [[measure(1), measure(2), measure(3)]]));
    expect(map.count).toBe(2);
  });

  it('returns null past the end rather than throwing', () => {
    const map = mapOf(makeScore([measure(1)]));
    expect(printedNumberAt(map, 5)).toBeNull();
    expect(isImplicitAt(map, 5)).toBe(false);
  });
});

// ── Agreement with the detector ─────────────────────────────────────────────

describe('agreement with detectSections', () => {
  it('stores printed numbers the same way detection does', () => {
    // sections.ts#attr trims and lowercases. If this module kept them verbatim the two
    // would disagree about the same measure, and the editor would show a number the
    // stored section does not have.
    const map = mapOf(makeScore([measure('0'), measure('9A'), measure(' 12B ')]));
    expect(map.entries.map((e) => e.number)).toEqual(['0', '9a', '12b']);
  });

  it('agrees with the startMeasureNumber detection stores', () => {
    const rehearsal = (text: string) =>
      `<direction><direction-type><rehearsal>${text}</rehearsal></direction-type></direction>`;
    const measures = [
      `<measure number="1">${rehearsal('Intro')}</measure>`,
      ...Array.from({ length: 8 }, (_, i) => measure(i + 2)),
      `<measure number="10">${rehearsal('Coda')}</measure>`,
      ...Array.from({ length: 6 }, (_, i) => measure(i + 11)),
    ];
    const xml = makeScore(measures);
    const map = mapOf(xml);
    const sections = detectSections(xml);

    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      expect(printedNumberAt(map, section.startMeasureIndex)).toBe(section.startMeasureNumber);
    }
  });
});

// ── Suffixes, duplicates, gaps ──────────────────────────────────────────────

describe('resolveMeasureInput', () => {
  it('matches a suffixed number exactly, case- and space-insensitively', () => {
    const map = mapOf(makeScore([measure(8), measure('9a'), measure('9b'), measure(10)]));
    expect(resolveMeasureInput(map, '9b', FULL_RANGE)).toMatchObject({ ok: true, index: 2 });
    expect(resolveMeasureInput(map, ' 9B ', FULL_RANGE)).toMatchObject({ ok: true, index: 2 });
  });

  it('falls back from bare digits to the first suffixed measure', () => {
    // A reader looking at 9a/9b types "9". Failing would be technically correct and useless.
    const map = mapOf(makeScore([measure(8), measure('9a'), measure('9b'), measure(10)]));
    expect(resolveMeasureInput(map, '9', FULL_RANGE)).toEqual({
      ok: true,
      index: 1,
      ambiguous: true,
    });
  });

  it('picks the earliest of a repeated number and flags it ambiguous', () => {
    const map = mapOf(makeScore([measure(5), measure(6), measure(5), measure(7)]));
    expect(indicesOfPrintedNumber(map, '5')).toEqual([0, 2]);
    expect(resolveMeasureInput(map, '5', FULL_RANGE)).toEqual({
      ok: true,
      index: 0,
      ambiguous: true,
    });
  });

  it('picks the occurrence that fits the allowed range', () => {
    // With repeated numbering, the occurrence the user means is the one that could
    // legally sit here — the other would cross a neighbouring boundary.
    const map = mapOf(makeScore([measure(5), measure(6), measure(5), measure(7)]));
    expect(resolveMeasureInput(map, '5', { min: 1, max: 3 })).toMatchObject({
      ok: true,
      index: 2,
    });
  });

  it('handles non-contiguous numbering without inventing measures', () => {
    // A multirest collapses printed numbers 4..11 into nothing; count stays 5.
    const map = mapOf(makeScore([measure(1), measure(2), measure(3), measure(12), measure(13)]));
    expect(map.count).toBe(5);
    expect(resolveMeasureInput(map, '12', FULL_RANGE)).toMatchObject({ ok: true, index: 3 });
    expect(resolveMeasureInput(map, '7', FULL_RANGE)).toEqual({ ok: false, reason: 'unknown' });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['99', 'unknown'],
    ['nonsense', 'unknown'],
  ])('rejects %p as %s', (text, reason) => {
    const map = mapOf(makeScore([measure(1), measure(2), measure(3)]));
    expect(resolveMeasureInput(map, text, FULL_RANGE)).toEqual({ ok: false, reason });
  });

  it('reports a real measure outside the allowed range distinctly from an unknown one', () => {
    // The editor shows different messages: "no such measure" vs "that would cross
    // the next section", and the second is the one the user can act on.
    const map = mapOf(makeScore([measure(1), measure(2), measure(3), measure(4)]));
    expect(resolveMeasureInput(map, '4', { min: 0, max: 1 })).toEqual({
      ok: false,
      reason: 'outOfRange',
    });
  });
});
