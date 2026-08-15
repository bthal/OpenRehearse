import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import '../../src/i18n';
import { SectionsBlock } from '@components/sections/SectionsBlock';
import type { Piece } from '@domain/piece';
import type { Section } from '@domain/sections';

// The block reads the score through the repository; everything else about it is pure.
// `mock`-prefixed so jest allows the factory to close over it.
const mockReadXml = jest.fn<Promise<string>, [Piece]>();
jest.mock('@data/index', () => ({
  pieceRepository: { readXml: (piece: Piece) => mockReadXml(piece) },
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A 12-measure score numbered 1..12 — no pickup, so printed number is index + 1. */
function score(count = 12): string {
  const measures = Array.from(
    { length: count },
    (_, i) => `<measure number="${i + 1}"></measure>`,
  ).join('');
  return `<score-partwise version="4.0"><part id="P1">${measures}</part></score-partwise>`;
}

/** A pickup score: measure 0 is implicit, so printed number equals array index. */
function pickupScore(count = 12): string {
  const measures = [
    '<measure number="0" implicit="yes"></measure>',
    ...Array.from({ length: count - 1 }, (_, i) => `<measure number="${i + 1}"></measure>`),
  ].join('');
  return `<score-partwise version="4.0"><part id="P1">${measures}</part></score-partwise>`;
}

const piece: Piece = {
  id: 'p1',
  title: 'Prelude',
  composer: 'Bach',
  xmlFilename: 'p1.xml',
  importedAt: '2026-01-01T00:00:00.000Z',
};

function sections(...starts: [number, string | null][]): Section[] {
  return starts.map(([startMeasureIndex, name], i) => ({
    startMeasureIndex,
    startMeasureNumber: String(startMeasureIndex + 1),
    name,
    color: ['#0B65DA', '#D43811', '#0E8147'][i] ?? '#0B65DA',
    sources: [],
  }));
}

const THREE = sections([0, 'Intro'], [4, 'Verse'], [8, 'Chorus']);

function renderBlock(initial: Section[] = THREE) {
  const onValidityChange = jest.fn();
  let current = initial;
  const onChange = jest.fn((next: Section[]) => {
    current = next;
    rerender();
  });
  const view = render(
    <SectionsBlock
      piece={piece}
      sections={current}
      onChange={onChange}
      onValidityChange={onValidityChange}
    />,
  );
  function rerender() {
    view.rerender(
      <SectionsBlock
        piece={piece}
        sections={current}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
  }
  return { onChange, onValidityChange, latest: () => current };
}

/** The block reads the score on mount; let that resolve before touching anything. */
async function ready() {
  await act(async () => {});
}

/** Rows rest in display mode; almost everything needs the row opened first. */
function editRow(name: string) {
  fireEvent.press(screen.getByLabelText(`Edit ${name}`));
}

beforeEach(() => {
  mockReadXml.mockReset();
  mockReadXml.mockResolvedValue(score());
});

// ── Collapsed state ─────────────────────────────────────────────────────────

describe('the header', () => {
  it('summarises the section count', async () => {
    renderBlock();
    await ready();
    expect(screen.getByText('• 3 sections')).toBeTruthy();
  });

  it('uses the singular for one section', async () => {
    renderBlock(sections([0, null]));
    await ready();
    expect(screen.getByText('• 1 section')).toBeTruthy();
  });

  it('reads the score once, on mount', async () => {
    // The block is not collapsible, so there is no later moment to defer this to.
    renderBlock();
    await ready();
    expect(mockReadXml).toHaveBeenCalledTimes(1);
  });
});

// ── Repair on load ──────────────────────────────────────────────────────────

describe('repairs made once the score is read', () => {
  it('drops a stored boundary that sits past the end of the score', async () => {
    // A piece whose XML was replaced by a shorter one leaves a ghost section behind.
    // Nothing before this point knows the measure count, so it cannot be caught until
    // the map loads — and left alone it produces a backwards span and a nonsense range.
    const { latest } = renderBlock(sections([0, 'Intro'], [4, 'Verse'], [99, 'Ghost']));
    await ready();
    await waitFor(() => expect(latest()).toHaveLength(2));
    expect(latest().map((s) => s.name)).toEqual(['Intro', 'Verse']);
    expect(screen.getByText('Measures 5–12')).toBeTruthy();
  });

  it('fills in a printed number the stored section never had', async () => {
    const { latest } = renderBlock([
      { startMeasureIndex: 0, startMeasureNumber: '', name: 'All', color: '#0B65DA', sources: [] },
    ]);
    await ready();
    await waitFor(() => expect(latest()[0]!.startMeasureNumber).toBe('1'));
  });
});

// ── Printed numbers ─────────────────────────────────────────────────────────

describe('measure numbers', () => {
  it('shows printed numbers, not array indices', async () => {
    renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Verse')).toBeTruthy());
    editRow('Verse');
    expect(screen.getByLabelText('From Verse').props.value).toBe('5');
    expect(screen.getByLabelText('To Verse').props.value).toBe('8');
  });

  it('shows the printed numbers of a pickup score, where number equals index', async () => {
    // The anacrusis trap: Verse starts at array index 4, printed as "4".
    mockReadXml.mockResolvedValue(pickupScore());
    renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Verse')).toBeTruthy());
    editRow('Verse');
    expect(screen.getByLabelText('From Verse').props.value).toBe('4');
    expect(screen.getByLabelText('To Verse').props.value).toBe('7');
  });
});

// ── Linked bounds ───────────────────────────────────────────────────────────

describe('linked from/to', () => {
  it("moves the next section's start when this section's end is committed", async () => {
    // The single most load-bearing behaviour: they are two views of one junction.
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');

    const end = screen.getByLabelText('To Intro');
    fireEvent.changeText(end, '6');
    fireEvent(end, 'blur');

    await waitFor(() => expect(latest()[1]!.startMeasureIndex).toBe(6));
    // Verse is still in display mode, and its range moved with the junction.
    expect(screen.getByText('Measures 7–8')).toBeTruthy();
  });

  it('moves the same junction from the other side', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Verse')).toBeTruthy());
    editRow('Verse');

    const start = screen.getByLabelText('From Verse');
    fireEvent.changeText(start, '3');
    fireEvent(start, 'blur');

    await waitFor(() => expect(latest()[1]!.startMeasureIndex).toBe(2));
    expect(screen.getByText('Measures 1–2')).toBeTruthy();
  });

  it('pins the first start and the last end, since they are the ends of the piece', async () => {
    renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');
    // Pinned fields render as text, so they carry no editable value prop.
    expect(screen.getByLabelText('From Intro').props.value).toBeUndefined();
    expect(screen.getByLabelText('To Intro').props.value).toBe('4');
  });
});

// ── Cancel ──────────────────────────────────────────────────────────────────

describe('cancelling a row', () => {
  it('restores the whole list, because a junction move changed two sections', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');

    const end = screen.getByLabelText('To Intro');
    fireEvent.changeText(end, '6');
    fireEvent(end, 'blur');
    await waitFor(() => expect(latest()[1]!.startMeasureIndex).toBe(6));

    fireEvent.press(screen.getByLabelText('Cancel'));

    await waitFor(() => expect(latest()[1]!.startMeasureIndex).toBe(4));
    expect(screen.getByLabelText('Edit Intro')).toBeTruthy(); // back to display mode
  });

  it('keeps the edits when saved', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');
    fireEvent.changeText(screen.getByLabelText('Name'), 'Opening');
    fireEvent.press(screen.getByLabelText('Done'));

    await waitFor(() => expect(latest()[0]!.name).toBe('Opening'));
    expect(screen.getByLabelText('Edit Opening')).toBeTruthy();
  });
});

// ── Colors ──────────────────────────────────────────────────────────────────

describe('colors', () => {
  it('applies a preset to that section only when the name is unique', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Verse')).toBeTruthy());
    editRow('Verse');
    fireEvent.press(screen.getByLabelText('#8925D0'));

    await waitFor(() => expect(latest()[1]!.color).toBe('#8925D0'));
    expect(latest()[0]!.color).toBe('#0B65DA');
    expect(latest()[2]!.color).toBe('#0E8147');
  });

  it('mirrors a recolor onto every section sharing the name', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Chorus')).toBeTruthy());

    // Name Chorus "Intro" and commit, so the two are the same music…
    editRow('Chorus');
    fireEvent.changeText(screen.getByLabelText('Name'), 'Intro');
    fireEvent(screen.getByLabelText('Name'), 'blur');
    // …then recolouring one has to move both.
    fireEvent.press(screen.getByLabelText('#A96404'));

    await waitFor(() => expect(latest()[2]!.color).toBe('#A96404'));
    expect(latest()[0]!.color).toBe('#A96404');
    expect(latest()[1]!.color).toBe('#D43811');
  });

  it('does not adopt a matching color mid-word, only on commit', async () => {
    // Typing "Intro" passes through "I", "In", "Int"… none of which should repaint.
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Chorus')).toBeTruthy());
    editRow('Chorus');

    const field = screen.getByLabelText('Name');
    fireEvent.changeText(field, 'Intr');
    expect(latest()[2]!.color).toBe('#0E8147');
    fireEvent.changeText(field, 'Intro');
    expect(latest()[2]!.color).toBe('#0E8147');

    fireEvent(field, 'blur');
    await waitFor(() => expect(latest()[2]!.color).toBe('#0B65DA'));
  });
});

// ── The name field ──────────────────────────────────────────────────────────

describe('the name field', () => {
  it('accepts a space, which used to be deleted the instant it was typed', async () => {
    // Regression: renameSection trimmed on every keystroke, so the space in "Da Capo"
    // never survived long enough to type the second word.
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');

    const field = screen.getByLabelText('Name');
    fireEvent.changeText(field, 'Da ');
    expect(latest()[0]!.name).toBe('Da ');
    expect(screen.getByLabelText('Name').props.value).toBe('Da ');

    fireEvent.changeText(field, 'Da Capo');
    expect(latest()[0]!.name).toBe('Da Capo');
  });

  it('trims once the field is left', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');

    const field = screen.getByLabelText('Name');
    fireEvent.changeText(field, '  Coda  ');
    fireEvent(field, 'blur');

    await waitFor(() => expect(latest()[0]!.name).toBe('Coda'));
  });
});

// ── Invalid input ───────────────────────────────────────────────────────────

describe('invalid measure input', () => {
  it('refuses a boundary that would cross a neighbour, and blocks saving', async () => {
    const { latest, onValidityChange } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');

    const end = screen.getByLabelText('To Intro');
    fireEvent.changeText(end, '11'); // past Chorus's start
    fireEvent(end, 'blur');

    await waitFor(() => expect(screen.getByText(/Must be between/)).toBeTruthy());
    expect(latest()[1]!.startMeasureIndex).toBe(4); // unchanged
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it('reports a measure the score does not have', async () => {
    renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');

    const end = screen.getByLabelText('To Intro');
    fireEvent.changeText(end, '99');
    fireEvent(end, 'blur');

    await waitFor(() => expect(screen.getByText(/No measure 99/)).toBeTruthy());
  });

  it('reverts a cleared field instead of erroring', async () => {
    const { latest, onValidityChange } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Edit Intro')).toBeTruthy());
    editRow('Intro');

    const end = screen.getByLabelText('To Intro');
    fireEvent.changeText(end, '');
    fireEvent(end, 'blur');

    await waitFor(() => expect(screen.getByLabelText('To Intro').props.value).toBe('4'));
    expect(latest()[1]!.startMeasureIndex).toBe(4);
    expect(onValidityChange).not.toHaveBeenCalledWith(true);
  });
});

// ── Delete ──────────────────────────────────────────────────────────────────

describe('deleting a section', () => {
  it('asks which neighbour absorbs the measures when there are two', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Verse');

    fireEvent.press(screen.getByLabelText('Delete section'));
    expect(screen.getByText('Intro (before)')).toBeTruthy();
    expect(screen.getByText('Chorus (after)')).toBeTruthy();

    fireEvent.press(screen.getByText('Intro (before)'));
    await waitFor(() => expect(latest()).toHaveLength(2));
    expect(latest()[0]!.name).toBe('Intro');
    expect(latest()[1]!.startMeasureIndex).toBe(8);
  });

  it('deletes the first section without asking, there being one place to put it', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');
    fireEvent.press(screen.getByLabelText('Delete section'));

    await waitFor(() => expect(latest()).toHaveLength(2));
    expect(screen.queryByText(/\(after\)/)).toBeNull();
    // Verse absorbed the measures and now starts the piece.
    expect(latest()[0]!.name).toBe('Verse');
    expect(latest()[0]!.startMeasureIndex).toBe(0);
  });

  it('deletes the last section without asking', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Chorus');
    fireEvent.press(screen.getByLabelText('Delete section'));

    await waitFor(() => expect(latest()).toHaveLength(2));
    expect(screen.queryByText(/\(before\)/)).toBeNull();
    expect(latest()[1]!.name).toBe('Verse');
  });

  it('cannot delete the only section', async () => {
    renderBlock(sections([0, 'All']));
    await ready();
    editRow('All');
    expect(screen.getByLabelText('Delete section').props.accessibilityState.disabled).toBe(true);
  });
});

// ── Split ───────────────────────────────────────────────────────────────────

describe('splitting a section', () => {
  it('splits off the last measure and puts the caret in the new from field', async () => {
    // Intro covers measures 1–4, so the new section takes measure 4 alone. The user
    // then types where it should really start, rather than answering that question
    // before anything is on screen to answer it about.
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');
    fireEvent.press(screen.getByLabelText('Split section'));

    await waitFor(() => expect(latest()).toHaveLength(4));
    expect(latest().map((s) => s.startMeasureIndex)).toEqual([0, 3, 4, 8]);

    const field = screen.getByLabelText('From Section 2');
    expect(field.props.value).toBe('');
    expect(field.props.autoFocus).toBe(true);
  });

  it('keeps the one-measure section when the cleared field is left alone', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');
    fireEvent.press(screen.getByLabelText('Split section'));
    await waitFor(() => expect(latest()).toHaveLength(4));

    fireEvent(screen.getByLabelText('From Section 2'), 'blur');
    expect(latest().map((s) => s.startMeasureIndex)).toEqual([0, 3, 4, 8]);
  });

  it('moves the new section back when a measure is typed', async () => {
    const { latest } = renderBlock();
    await ready();
    editRow('Intro');
    fireEvent.press(screen.getByLabelText('Split section'));
    await waitFor(() => expect(latest()).toHaveLength(4));

    const field = screen.getByLabelText('From Section 2');
    fireEvent.changeText(field, '2');
    fireEvent(field, 'blur');

    await waitFor(() => expect(latest()[1]!.startMeasureIndex).toBe(1));
  });

  it('cannot split a one-measure section', async () => {
    renderBlock(sections([0, 'A'], [1, 'B']));
    await ready();
    editRow('A');
    expect(screen.getByLabelText('Split section').props.accessibilityState.disabled).toBe(true);
  });
});

// ── Degraded mode ───────────────────────────────────────────────────────────

describe('a score whose measures cannot be read', () => {
  beforeEach(() => {
    mockReadXml.mockResolvedValue('<score-timewise></score-timewise>');
  });

  it('explains why, and keeps rename and delete working', async () => {
    renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByText(/can't be read/)).toBeTruthy());
    editRow('Verse');

    // Bounds are not editable without a measure map...
    expect(screen.getByLabelText('From Verse').props.value).toBeUndefined();
    expect(screen.getByLabelText('Split section').props.accessibilityState.disabled).toBe(true);
    // ...but neither renaming nor deleting needs one.
    expect(screen.getByLabelText('Delete section').props.accessibilityState.disabled).toBe(false);
  });

  it('still renames, which needs no measure map', async () => {
    const { latest } = renderBlock();
    await ready();
    await waitFor(() => expect(screen.getByText(/can't be read/)).toBeTruthy());
    editRow('Verse');

    fireEvent.changeText(screen.getByLabelText('Name'), 'Bridge');
    expect(latest()[1]!.name).toBe('Bridge');
    expect(latest()).toHaveLength(3);
  });
});
