import {
  boundaryRange,
  commitName,
  deleteSection,
  isTiling,
  normaliseSections,
  recolorSection,
  refreshPrintedNumbers,
  renameSection,
  sectionsEqual,
  sectionSpans,
  setBoundary,
  splitSection,
  syncColorToName,
} from '../sectionEditing';
import type { Section } from '../sections';

const PALETTE = ['#111111', '#222222', '#333333', '#444444'] as const;

/** Printed numbers are 1-based here, i.e. a score with no pickup. */
const printed = (index: number) => String(index + 1);

function section(startMeasureIndex: number, name: string | null, color: string): Section {
  return {
    startMeasureIndex,
    startMeasureNumber: printed(startMeasureIndex),
    name,
    color,
    sources: [],
  };
}

/** Intro @0, Verse @4, Chorus @8 in a 12-measure piece. */
const BASE: Section[] = [
  section(0, 'Intro', '#111111'),
  section(4, 'Verse', '#222222'),
  section(8, 'Chorus', '#333333'),
];
const COUNT = 12;

// ── normalisation ───────────────────────────────────────────────────────────

describe('normaliseSections', () => {
  it.each([
    ['undefined', undefined],
    ['an empty list', [] as Section[]],
  ])('turns %s into one whole-piece section', (_label, input) => {
    const result = normaliseSections(input, PALETTE);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startMeasureIndex: 0, name: null, color: '#111111' });
  });

  it('forces the first section to start at measure 0', () => {
    const result = normaliseSections([section(3, 'Late', '#111111')], PALETTE);
    expect(result[0]!.startMeasureIndex).toBe(0);
  });

  it('sorts out-of-order input and drops duplicate starts', () => {
    const result = normaliseSections(
      [section(8, 'C', '#333333'), section(0, 'A', '#111111'), section(8, 'dup', '#444444')],
      PALETTE,
    );
    expect(result.map((s) => s.startMeasureIndex)).toEqual([0, 8]);
    expect(isTiling(result, COUNT)).toBe(true);
  });

  it('drops boundaries past the end of the score when the count is known', () => {
    const result = normaliseSections([...BASE, section(99, 'Ghost', '#444444')], PALETTE, COUNT);
    expect(result.map((s) => s.startMeasureIndex)).toEqual([0, 4, 8]);
  });

  it('fills a missing color using the pre-storage derivation, so old pieces keep their hues', () => {
    const stored = [
      { ...section(0, 'Refrain', ''), color: undefined },
      { ...section(4, 'Verse', ''), color: undefined },
      { ...section(8, 'Refrain', ''), color: undefined },
    ] as Section[];
    const result = normaliseSections(stored, PALETTE);
    // Two "Refrain" sections shared a hue before colors were stored; that must survive.
    expect(result[0]!.color).toBe(result[2]!.color);
    expect(result[1]!.color).not.toBe(result[0]!.color);
  });

  it.each([
    ['a bare word', 'red'],
    ['a 3-digit hex', '#fff'],
    ['a CSS injection attempt', '#fff; background: url(x)'],
  ])('replaces %s with a palette entry', (_label, color) => {
    // These strings are concatenated into a CSS gradient inside the WebView.
    const result = normaliseSections([{ ...section(0, 'A', ''), color } as Section], PALETTE);
    expect(result[0]!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('leaves an already-valid list alone', () => {
    expect(normaliseSections(BASE, PALETTE)).toEqual(BASE);
  });
});

// ── derived geometry ────────────────────────────────────────────────────────

describe('sectionSpans', () => {
  it('derives inclusive ends from the next section, and the last from the count', () => {
    expect(sectionSpans(BASE, COUNT)).toEqual([
      { startIndex: 0, endIndex: 3, measureCount: 4 },
      { startIndex: 4, endIndex: 7, measureCount: 4 },
      { startIndex: 8, endIndex: 11, measureCount: 4 },
    ]);
  });
});

describe('boundaryRange', () => {
  it('excludes both neighbours, so no section can be squeezed to zero measures', () => {
    expect(boundaryRange(BASE, 1, COUNT)).toEqual({ min: 1, max: 7 });
    expect(boundaryRange(BASE, 2, COUNT)).toEqual({ min: 5, max: 11 });
  });

  it('returns null for the pinned first boundary', () => {
    expect(boundaryRange(BASE, 0, COUNT)).toBeNull();
  });
});

// ── sticky color ────────────────────────────────────────────────────────────

describe('color follows name', () => {
  it('does not touch the color while the name is being typed', () => {
    // Typing "Intro" passes through "I", "In", "Int"… and a transient match on any of
    // those would repaint the row mid-word.
    expect(renameSection(BASE, 2, 'Intro')[2]!.color).toBe('#333333');
    expect(renameSection(BASE, 2, 'I')[2]!.color).toBe('#333333');
  });

  it("adopts a matching section's color when the name is committed", () => {
    const typed = renameSection(BASE, 2, 'Intro');
    expect(syncColorToName(typed, 2)[2]!.color).toBe('#111111');
  });

  it('matches names case- and whitespace-insensitively', () => {
    const typed = renameSection(BASE, 2, '  intro  ');
    expect(syncColorToName(typed, 2)[2]!.color).toBe('#111111');
  });

  it('leaves the color untouched when no other section carries the name', () => {
    // Fixing a typo in a hand-colored section must not repaint it.
    const recolored = recolorSection(BASE, 2, '#ABCDEF');
    const renamed = syncColorToName(renameSection(recolored, 2, 'Chorus 1'), 2);
    expect(renamed[2]!.color).toBe('#ABCDEF');
  });

  it('mirrors a recolor onto every section sharing the name', () => {
    // Two sections called "Intro" are a claim they are the same music; recoloring one
    // has to move both, or the claim stops being true the moment a hue is picked.
    const twoIntros = syncColorToName(renameSection(BASE, 2, 'Intro'), 2);
    const result = recolorSection(twoIntros, 2, '#ABCDEF');
    expect(result[0]!.color).toBe('#ABCDEF');
    expect(result[2]!.color).toBe('#ABCDEF');
    expect(result[1]!.color).toBe('#222222');
  });

  it('mirrors from either direction', () => {
    const twoIntros = syncColorToName(renameSection(BASE, 2, 'Intro'), 2);
    const result = recolorSection(twoIntros, 0, '#ABCDEF');
    expect(result[2]!.color).toBe('#ABCDEF');
  });

  it('never mirrors between unnamed sections', () => {
    // Two blank names are not a claim about anything.
    const unnamed = [section(0, null, '#111111'), section(4, null, '#222222')];
    expect(recolorSection(unnamed, 0, '#ABCDEF')[1]!.color).toBe('#222222');
  });

  it('never repaints a section that was not touched', () => {
    // The whole reason colors are stored rather than derived. Under the old live
    // derivation, deleting a section shifted the palette walk for everything after it.
    const before = BASE.map((s) => s.color);
    expect(deleteSection(BASE, 1, 'previous').map((s) => s.color)).toEqual([before[0], before[2]]);
    expect(setBoundary(BASE, 1, 6, COUNT, printed).map((s) => s.color)).toEqual(before);
    expect(renameSection(BASE, 1, 'Bridge').map((s) => s.color)).toEqual(before);
  });

  it('gives a new section the first unused palette entry', () => {
    const result = splitSection(BASE, 0, 2, COUNT, PALETTE, printed);
    expect(result[1]!.color).toBe('#444444');
  });

  it('gives a named new section the color of its namesake', () => {
    const result = splitSection(BASE, 0, 2, COUNT, PALETTE, printed, 'Chorus');
    expect(result[1]!.color).toBe('#333333');
  });

  it('falls back to walking the palette when every entry is taken', () => {
    const full = [
      section(0, 'a', PALETTE[0]),
      section(2, 'b', PALETTE[1]),
      section(4, 'c', PALETTE[2]),
      section(6, 'd', PALETTE[3]),
    ];
    const result = splitSection(full, 0, 1, COUNT, PALETTE, printed);
    expect(result[1]!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(isTiling(result, COUNT)).toBe(true);
  });
});

describe('renameSection', () => {
  it('keeps whitespace while typing, so a space can be typed at all', () => {
    // Trimming per keystroke deletes the space in "Da Capo" the instant it is typed.
    expect(renameSection(BASE, 1, 'Da ')[1]!.name).toBe('Da ');
    expect(renameSection(BASE, 1, 'Da Capo')[1]!.name).toBe('Da Capo');
  });

  it('trims on commit, and an all-whitespace name settles to null', () => {
    expect(commitName(renameSection(BASE, 1, '  Coda  '), 1)[1]!.name).toBe('Coda');
    expect(commitName(renameSection(BASE, 1, '   '), 1)[1]!.name).toBeNull();
    expect(renameSection(BASE, 1, '')[1]!.name).toBeNull();
  });

  it('trims before matching, so a trailing space still counts as the same name', () => {
    expect(commitName(renameSection(BASE, 2, 'Intro '), 2)[2]!.color).toBe('#111111');
  });

  it('ignores an out-of-range index', () => {
    expect(renameSection(BASE, 9, 'x')).toBe(BASE);
  });
});

describe('recolorSection', () => {
  it('refuses a color that is not a 6-digit hex', () => {
    expect(recolorSection(BASE, 1, 'red')).toBe(BASE);
    expect(recolorSection(BASE, 1, '#fff')).toBe(BASE);
  });
});

// ── boundaries ──────────────────────────────────────────────────────────────

describe('setBoundary', () => {
  it('moves exactly two spans and leaves the rest alone', () => {
    const result = setBoundary(BASE, 1, 6, COUNT, printed);
    expect(sectionSpans(result, COUNT)).toEqual([
      { startIndex: 0, endIndex: 5, measureCount: 6 },
      { startIndex: 6, endIndex: 7, measureCount: 2 },
      { startIndex: 8, endIndex: 11, measureCount: 4 },
    ]);
  });

  it('updates the cached printed number from the resolver', () => {
    expect(setBoundary(BASE, 1, 6, COUNT, printed)[1]!.startMeasureNumber).toBe('7');
  });

  it('clears detection provenance, because no rule vouches for a moved boundary', () => {
    const detected: Section[] = [BASE[0]!, { ...BASE[1]!, sources: ['R1'], score: 10 }, BASE[2]!];
    const moved = setBoundary(detected, 1, 6, COUNT, printed);
    expect(moved[1]!.sources).toEqual([]);
    expect(moved[1]!.score).toBeUndefined();
  });

  it.each([
    ['onto the previous start', 0],
    ['past the next start', 8],
    ['beyond the score', 99],
  ])('refuses a move %s', (_label, target) => {
    expect(setBoundary(BASE, 1, target, COUNT, printed)).toBe(BASE);
  });

  it('refuses to move the pinned first boundary', () => {
    expect(setBoundary(BASE, 0, 2, COUNT, printed)).toBe(BASE);
  });

  it('always leaves both neighbours at least one measure', () => {
    for (let target = 1; target <= 7; target++) {
      const spans = sectionSpans(setBoundary(BASE, 1, target, COUNT, printed), COUNT);
      expect(Math.min(...spans.map((s) => s.measureCount))).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── split ───────────────────────────────────────────────────────────────────

describe('splitSection', () => {
  it('inserts a section covering the second half and keeps the tiling', () => {
    const result = splitSection(BASE, 1, 6, COUNT, PALETTE, printed, 'Bridge');
    expect(result.map((s) => s.startMeasureIndex)).toEqual([0, 4, 6, 8]);
    expect(result[2]!.name).toBe('Bridge');
    expect(isTiling(result, COUNT)).toBe(true);
  });

  it('can split the last section against the measure count', () => {
    const result = splitSection(BASE, 2, 10, COUNT, PALETTE, printed);
    expect(sectionSpans(result, COUNT).at(-1)).toEqual({
      startIndex: 10,
      endIndex: 11,
      measureCount: 2,
    });
  });

  it('refuses a one-measure section, which has no interior position', () => {
    const tight = [section(0, 'A', '#111111'), section(1, 'B', '#222222')];
    expect(splitSection(tight, 0, 1, 2, PALETTE, printed)).toBe(tight);
  });

  it.each([
    ['at its own start', 4],
    ['past its end', 9],
  ])('refuses a split %s', (_label, at) => {
    expect(splitSection(BASE, 1, at, COUNT, PALETTE, printed)).toBe(BASE);
  });
});

// ── delete ──────────────────────────────────────────────────────────────────

describe('deleteSection', () => {
  it('gives the measures to the previous section', () => {
    const result = deleteSection(BASE, 1, 'previous');
    expect(sectionSpans(result, COUNT)).toEqual([
      { startIndex: 0, endIndex: 7, measureCount: 8 },
      { startIndex: 8, endIndex: 11, measureCount: 4 },
    ]);
    expect(result[0]!.name).toBe('Intro');
  });

  it('gives the measures to the next section, pulling its start back', () => {
    const result = deleteSection(BASE, 1, 'next');
    expect(sectionSpans(result, COUNT)).toEqual([
      { startIndex: 0, endIndex: 3, measureCount: 4 },
      { startIndex: 4, endIndex: 11, measureCount: 8 },
    ]);
    expect(result[1]!.name).toBe('Chorus');
    expect(result[1]!.startMeasureNumber).toBe('5');
  });

  it('forces the first section to donate forwards, keeping the tiling at 0', () => {
    // There is no previous section to absorb into, so the request is overridden.
    const result = deleteSection(BASE, 0, 'previous');
    expect(result[0]!.startMeasureIndex).toBe(0);
    expect(result[0]!.name).toBe('Verse');
    expect(isTiling(result, COUNT)).toBe(true);
  });

  it('forces the last section to donate backwards', () => {
    const result = deleteSection(BASE, 2, 'next');
    expect(result).toHaveLength(2);
    expect(sectionSpans(result, COUNT).at(-1)!.endIndex).toBe(11);
  });

  it('refuses to delete the only section', () => {
    const only = [section(0, 'All', '#111111')];
    expect(deleteSection(only, 0, 'previous')).toBe(only);
  });
});

// ── invariants ──────────────────────────────────────────────────────────────

describe('the tiling survives arbitrary editing', () => {
  it('holds after every step of a long mixed sequence', () => {
    let sections = normaliseSections(undefined, PALETTE);
    // The label rides along in the assertion so a failure names the step that broke it.
    const check = (label: string) => {
      const spans = sectionSpans(sections, COUNT);
      expect({ label, tiling: isTiling(sections, COUNT) }).toEqual({ label, tiling: true });
      expect({ label, shortest: Math.min(...spans.map((s) => s.measureCount)) >= 1 }).toEqual({
        label,
        shortest: true,
      });
      expect({ label, colors: sections.every((s) => /^#[0-9a-fA-F]{6}$/.test(s.color!)) }).toEqual({
        label,
        colors: true,
      });
    };
    check('start');

    sections = splitSection(sections, 0, 6, COUNT, PALETTE, printed, 'B');
    check('split');
    sections = splitSection(sections, 0, 3, COUNT, PALETTE, printed, 'A2');
    check('split again');
    sections = setBoundary(sections, 1, 2, COUNT, printed);
    check('move left');
    sections = setBoundary(sections, 2, 9, COUNT, printed);
    check('move right');
    sections = renameSection(sections, 2, 'B');
    check('rename onto a namesake');
    sections = recolorSection(sections, 0, '#ABCDEF');
    check('recolor');
    sections = deleteSection(sections, 1, 'next');
    check('delete donating next');
    sections = deleteSection(sections, 1, 'previous');
    check('delete donating previous');
    sections = deleteSection(sections, 0, 'previous');
    check('delete the first');

    expect(sections).toHaveLength(1);
    expect(deleteSection(sections, 0, 'previous')).toBe(sections);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

describe('refreshPrintedNumbers', () => {
  it('repairs numbers cached from a stale export or synthesized without a score', () => {
    const stale = [
      { ...section(0, 'A', '#111111'), startMeasureNumber: '' },
      section(4, 'B', '#222222'),
    ];
    const result = refreshPrintedNumbers(stale, printed);
    expect(result.map((s) => s.startMeasureNumber)).toEqual(['1', '5']);
  });

  it('returns the same objects when nothing changed', () => {
    expect(refreshPrintedNumbers(BASE, printed)).toEqual(BASE);
  });
});

describe('sectionsEqual', () => {
  it('compares fields rather than serialised form', () => {
    const reordered: Section[] = BASE.map((s) => ({
      sources: s.sources,
      color: s.color,
      name: s.name,
      startMeasureNumber: s.startMeasureNumber,
      startMeasureIndex: s.startMeasureIndex,
    }));
    expect(sectionsEqual(BASE, reordered)).toBe(true);
  });

  it.each([
    ['a name', renameSection(BASE, 1, 'Other')],
    ['a color', recolorSection(BASE, 1, '#ABCDEF')],
    ['a boundary', setBoundary(BASE, 1, 6, COUNT, printed)],
    ['the length', deleteSection(BASE, 1, 'previous')],
  ])('detects a change to %s', (_label, changed) => {
    expect(sectionsEqual(BASE, changed)).toBe(false);
  });
});
