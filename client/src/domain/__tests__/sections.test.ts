import { assignSectionColorIndices, detectSections, type Section } from '../sections';

// ── Fixture builders ────────────────────────────────────────────────────────
// Inline XML throughout: testfiles/ is gitignored, so no test may read from disk.

/** A measure whose display `number` is deliberately independent of its array position. */
function measure(number: string | number, inner = ''): string {
  return `<measure number="${number}">${inner}</measure>`;
}

/** `count` empty measures numbered from `from`, matching the usual 1-based engraving. */
function plainMeasures(count: number, from = 1): string[] {
  return Array.from({ length: count }, (_, i) => measure(from + i));
}

function makeScore(measures: string[], extraParts: string[][] = []): string {
  const parts = [measures, ...extraParts]
    .map((ms, i) => `<part id="P${i + 1}">${ms.join('')}</part>`)
    .join('');
  const partList = [measures, ...extraParts]
    .map((_, i) => `<score-part id="P${i + 1}"><part-name>P${i + 1}</part-name></score-part>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list>${partList}</part-list>${parts}</score-partwise>`;
}

const rehearsal = (text: string): string =>
  `<direction><direction-type><rehearsal>${text}</rehearsal></direction-type></direction>`;
const words = (text: string): string =>
  `<direction><direction-type><words>${text}</words></direction-type></direction>`;
const segno = `<direction><direction-type><segno/></direction-type></direction>`;
const forwardRepeat = `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>`;
const backwardRepeat = `<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>`;
const doubleBar = `<barline location="right"><bar-style>light-light</bar-style></barline>`;
const key = (fifths: number): string =>
  `<attributes><key><fifths>${fifths}</fifths></key></attributes>`;
const time = (beats: number, beatType: number): string =>
  `<attributes><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>`;
const ending = (number: number, type: string): string =>
  `<barline location="right"><ending number="${number}" type="${type}"/></barline>`;

const indices = (sections: Section[]): number[] => sections.map((s) => s.startMeasureIndex);
const names = (sections: Section[]): (string | null)[] => sections.map((s) => s.name);

// ── Declining ───────────────────────────────────────────────────────────────

describe('detectSections — declining', () => {
  test('a score with no section notation yields no sections, not one', () => {
    expect(detectSections(makeScore(plainMeasures(40)))).toEqual([]);
  });

  test('a single boundary is not a section', () => {
    const measures = plainMeasures(20);
    measures[0] = measure(1, rehearsal('Intro'));
    expect(detectSections(makeScore(measures))).toEqual([]);
  });

  test('malformed XML declines instead of throwing', () => {
    expect(detectSections('<score-partwise><part>')).toEqual([]);
    expect(detectSections('')).toEqual([]);
  });

  test('score-timewise declines — OSMD does not render it either', () => {
    expect(
      detectSections('<score-timewise version="4.0"><measure number="1"/></score-timewise>'),
    ).toEqual([]);
  });

  test('system and page breaks are engraving, not form', () => {
    const measures = plainMeasures(40).map((m, i) =>
      i % 4 === 0 ? measure(i + 1, '<print new-system="yes"/>') : m,
    );
    expect(detectSections(makeScore(measures))).toEqual([]);
  });
});

// ── R1 rehearsal marks ──────────────────────────────────────────────────────

describe('detectSections — R1 rehearsal marks', () => {
  test('rehearsal marks open sections and name them', () => {
    const measures = plainMeasures(24);
    measures[0] = measure(1, rehearsal('Intro'));
    measures[8] = measure(9, rehearsal('Verse'));
    measures[16] = measure(17, rehearsal('Chorus'));

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 8, 16]);
    expect(names(sections)).toEqual(['Intro', 'Verse', 'Chorus']);
  });

  test('a rehearsal mark on a pickup measure names the opening section', () => {
    const measures = [
      `<measure number="0" implicit="yes">${rehearsal('Intro')}</measure>`,
      ...plainMeasures(20, 1),
    ];
    measures[9] = measure(9, rehearsal('Refrain'));

    const sections = detectSections(makeScore(measures));
    expect(sections[0]).toMatchObject({
      startMeasureIndex: 0,
      startMeasureNumber: '0',
      name: 'Intro',
    });
    // The opening boundary is implicit and carries no score.
    expect(sections[0]?.score).toBeUndefined();
  });

  test('measure numbers are display strings — indexing is by array position', () => {
    const measures = [
      measure('0', rehearsal('A')),
      ...plainMeasures(9, 1),
      measure('9a'),
      measure('9b'),
    ];
    measures[6] = measure('6', rehearsal('B'));

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 6]);
    expect(sections.map((s) => s.startMeasureNumber)).toEqual(['0', '6']);
  });

  test('a rehearsal mark attached to a second part still counts', () => {
    const first = plainMeasures(20);
    const second = plainMeasures(20);
    first[0] = measure(1, rehearsal('Intro'));
    second[10] = measure(11, rehearsal('Trio'));

    expect(indices(detectSections(makeScore(first, [second])))).toEqual([0, 10]);
  });
});

// ── R2/R3/R3a repeats and endings ───────────────────────────────────────────

describe('detectSections — repeats and endings', () => {
  test('a forward repeat opens a section', () => {
    const measures = plainMeasures(24);
    measures[8] = measure(9, forwardRepeat);
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 8]);
  });

  test('R3a — the boundary lands after the ending run, never on an ending measure', () => {
    // Mirrors heute-abend: repeat forward, then bracketed endings, then the next section.
    const measures = plainMeasures(24);
    measures[4] = measure(5, forwardRepeat);
    measures[11] = measure(12, `${ending(1, 'start')}${ending(1, 'stop')}${backwardRepeat}`);
    measures[12] = measure(13, `${ending(2, 'start')}${ending(2, 'discontinue')}`);

    const sections = detectSections(makeScore(measures));
    // 11 and 12 carry ending brackets; the run closes and the boundary is the measure after.
    expect(indices(sections)).toEqual([0, 4, 13]);
  });

  test('without endings a backward repeat closes the section at the next measure', () => {
    const measures = plainMeasures(24);
    measures[11] = measure(12, backwardRepeat);
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 12]);
  });

  test('a backward repeat in the final measure creates no boundary past the end', () => {
    const measures = plainMeasures(12);
    measures[11] = measure(12, backwardRepeat);
    expect(detectSections(makeScore(measures))).toEqual([]);
  });
});

// ── R4 barlines ─────────────────────────────────────────────────────────────

describe('detectSections — R4 barlines', () => {
  test('a bare double barline opens the following measure', () => {
    const measures = plainMeasures(24);
    measures[7] = measure(8, doubleBar);
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 8]);
  });

  test('a light-heavy that belongs to a repeat is not counted twice', () => {
    const measures = plainMeasures(24);
    measures[11] = measure(12, backwardRepeat);
    const sections = detectSections(makeScore(measures));
    // Only the R3 boundary at 12 — the light-heavy bar-style is part of that repeat.
    expect(sections).toHaveLength(2);
    expect(sections[1]?.sources).toEqual(['R3']);
  });
});

// ── R5/R6 key and meter ─────────────────────────────────────────────────────

describe('detectSections — key and meter changes', () => {
  test('a meter excursion that reverts is suppressed', () => {
    // The Chopin nocturne shape: 12/8 → 6/4 → 2/4 → 12/8 is a cadenza, not three sections.
    const measures = plainMeasures(40);
    measures[0] = measure(1, time(12, 8));
    measures[33] = measure(34, time(6, 4));
    measures[35] = measure(36, time(2, 4));
    measures[36] = measure(37, time(12, 8));

    expect(detectSections(makeScore(measures))).toEqual([]);
  });

  test('a key excursion that reverts is suppressed', () => {
    const measures = plainMeasures(40);
    measures[0] = measure(1, key(0));
    measures[20] = measure(21, key(3));
    measures[22] = measure(23, key(0));

    expect(detectSections(makeScore(measures))).toEqual([]);
  });

  test('key changes on a wide grid all survive', () => {
    // waltz-for-nala: six key changes on a 16-measure grid, none reverting quickly.
    const measures = plainMeasures(106);
    measures[0] = measure(1, key(0));
    [18, 34, 50, 66, 82, 98].forEach((i, n) => {
      measures[i] = measure(i + 1, key(n + 1));
    });

    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 18, 34, 50, 66, 82, 98]);
  });

  test('a lone key change scores exactly at the threshold and survives', () => {
    const measures = plainMeasures(40);
    measures[0] = measure(1, key(0));
    measures[20] = measure(21, key(4));

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 20]);
    expect(sections[1]?.score).toBe(5);
  });
});

// ── R7 section vocabulary ───────────────────────────────────────────────────

describe('detectSections — R7 section vocabulary', () => {
  test('a vocabulary word opens a section and supplies the name', () => {
    const measures = plainMeasures(24);
    measures[0] = measure(1, words('Intro'));
    measures[12] = measure(13, words('Chorus'));

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 12]);
    expect(names(sections)).toEqual(['Intro', 'Chorus']);
  });

  test('tempo and expression terms are never a boundary on their own', () => {
    const measures = plainMeasures(40);
    ['Andante', 'Allegro', 'Senza tempo', 'a tempo', 'rit.', 'dolce'].forEach((term, i) => {
      measures[i * 6] = measure(i * 6 + 1, words(term));
    });
    expect(detectSections(makeScore(measures))).toEqual([]);
  });

  test('matching is whole-token, so a term glued inside another word does not fire', () => {
    const measures = plainMeasures(40);
    measures[0] = measure(1, words('reverse')); // must not match "verse"
    measures[12] = measure(13, words('variations')); // must not match "variation" or "var."
    measures[24] = measure(25, words('outrageous')); // must not match "outro"

    expect(detectSections(makeScore(measures))).toEqual([]);
  });

  test('a term standing on its own does fire', () => {
    const measures = plainMeasures(40);
    measures[12] = measure(13, words('Introduction'));
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 12]);
  });

  test('the engraved label is kept rather than the bare vocabulary term', () => {
    const measures = plainMeasures(24);
    measures[0] = measure(1, words('Verse 1'));
    measures[12] = measure(13, words('Verse 2'));

    expect(names(detectSections(makeScore(measures)))).toEqual(['Verse 1', 'Verse 2']);
  });

  test('a rehearsal mark outranks a vocabulary word at the same junction', () => {
    const measures = plainMeasures(24);
    measures[0] = measure(1, rehearsal('A'));
    measures[12] = measure(13, `${rehearsal('B')}${words('Chorus')}`);

    expect(names(detectSections(makeScore(measures)))).toEqual(['A', 'B']);
  });
});

// ── R8 navigation marks ─────────────────────────────────────────────────────

describe('detectSections — R8 navigation marks', () => {
  test('a segno opens a section', () => {
    const measures = plainMeasures(24);
    measures[12] = measure(13, segno);
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 12]);
  });

  test('a <sound dacapo> opens a section', () => {
    const measures = plainMeasures(24);
    measures[12] = measure(13, '<sound dacapo="yes"/>');
    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 12]);
  });
});

// ── Assembly ────────────────────────────────────────────────────────────────

describe('detectSections — assembly', () => {
  test('candidates within one measure merge into a single boundary', () => {
    // maple-leaf-rag: light-light ending one measure, key change + forward repeat opening
    // the next — three engravings of one junction.
    const measures = plainMeasures(40);
    measures[0] = measure(1, key(0));
    measures[19] = measure(20, doubleBar);
    measures[20] = measure(21, `${forwardRepeat}${key(3)}`);

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 20]);
    expect(sections[1]?.sources).toEqual(['R2', 'R4', 'R5']);
  });

  test('merged weights are capped', () => {
    const measures = plainMeasures(40);
    measures[0] = measure(1, key(0));
    measures[20] = measure(21, `${rehearsal('B')}${forwardRepeat}${key(3)}${segno}`);

    // 10 + 8 + 5 + 7 = 30, capped at 15.
    expect(detectSections(makeScore(measures))[1]?.score).toBe(15);
  });

  test('a merged boundary sits at its strongest candidate', () => {
    const measures = plainMeasures(40);
    measures[19] = measure(20, backwardRepeat); // R3 boundary at 20, weight 8
    measures[20] = measure(21, rehearsal('Strophe')); // R1 at 20 — same index
    measures[24] = measure(25, doubleBar); // R4 boundary at 25, weight 6
    measures[26] = measure(27, rehearsal('Coda')); // R1 at 26, weight 10 — one apart

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 20, 26]);
    expect(names(sections)).toEqual([null, 'Strophe', 'Coda']);
  });

  test('interior sections shorter than four measures collapse to the higher score', () => {
    const measures = plainMeasures(40);
    measures[10] = measure(11, key(2)); // score 5
    measures[12] = measure(13, rehearsal('B')); // score 10, two measures later
    measures[0] = measure(1, key(0));

    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 12]);
  });

  test('ties in the minimum-length pass go to the earlier boundary', () => {
    const measures = plainMeasures(40);
    measures[10] = measure(11, rehearsal('B'));
    measures[12] = measure(13, rehearsal('C'));

    const sections = detectSections(makeScore(measures));
    expect(indices(sections)).toEqual([0, 10]);
    expect(names(sections)).toEqual([null, 'B']);
  });

  test('the first section may be a single measure', () => {
    // A pickup measure followed immediately by a repeat, as in maple-leaf-rag.
    const measures = [`<measure number="0" implicit="yes"/>`, ...plainMeasures(30, 1)];
    measures[1] = measure(1, forwardRepeat);
    measures[17] = measure(17, forwardRepeat);

    expect(indices(detectSections(makeScore(measures)))).toEqual([0, 1, 17]);
  });

  test('the section count is capped, keeping the best-marked junctions', () => {
    const measures = plainMeasures(80);
    measures[0] = measure(1, key(0));
    // 15 interior boundaries, every 5 measures; every third is a rehearsal mark (score 10),
    // the rest are lone key changes (score 5).
    for (let n = 1; n <= 15; n++) {
      const index = n * 5;
      measures[index] =
        n % 3 === 0 ? measure(index + 1, rehearsal(`R${n}`)) : measure(index + 1, key(n));
    }

    const sections = detectSections(makeScore(measures));
    expect(sections).toHaveLength(12);
    // All five rehearsal marks outrank the key changes and must survive the cap.
    expect(indices(sections)).toEqual(expect.arrayContaining([0, 15, 30, 45, 60, 75]));
    // Order is restored after the cap.
    expect(indices(sections)).toEqual([...indices(sections)].sort((a, b) => a - b));
  });
});

// ── Colors ──────────────────────────────────────────────────────────────────

describe('assignSectionColorIndices', () => {
  const section = (name: string | null): Section => ({
    startMeasureIndex: 0,
    startMeasureNumber: '1',
    name,
    sources: [],
  });

  test('a repeated name reuses its color', () => {
    const sections = [
      section('Intro'),
      section('Refrain'),
      section('Strophe'),
      section('Refrain'),
      section('Outro'),
    ];
    expect(assignSectionColorIndices(sections, 8)).toEqual([0, 1, 2, 1, 3]);
  });

  test('name matching ignores case and surrounding space', () => {
    expect(assignSectionColorIndices([section('Refrain'), section(' refrain ')], 8)).toEqual([
      0, 0,
    ]);
  });

  test('unnamed sections are not the same section as each other', () => {
    expect(assignSectionColorIndices([section(null), section(null), section(null)], 8)).toEqual([
      0, 1, 2,
    ]);
  });

  test('colors wrap around a short palette', () => {
    const sections = [section('A'), section('B'), section('C'), section('D')];
    expect(assignSectionColorIndices(sections, 3)).toEqual([0, 1, 2, 0]);
  });
});
