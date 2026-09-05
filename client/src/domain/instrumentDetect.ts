/**
 * Guessing which instrument an imported score is for.
 *
 * Deliberately returns `null` rather than a fallback when the signals disagree or say
 * nothing. The import flow treats `null` as "ask" — instrument is a required field in
 * the "Input needed" modal, exactly like composer — so a wrong confident guess is a
 * worse outcome here than an honest question. See `specs/features/import.md`.
 *
 * Lives apart from `musicxml.ts` because it is the one place that maps notation facts
 * onto the instrument registry; the scrapers stay ignorant of what instruments exist.
 */
import { defaultBaseTranspose, type InstrumentId } from './instrumentRegistry';
import { legalInstrumentsForPart } from './partCompatibility';
import { scrapeMidiProgram, scrapePartTranspose, type ScorePart } from './musicxml';

/** GM program numbers as MusicXML writes them (1-based): 1-8 are the pianos. */
const GM_PIANO_RANGE = { first: 1, last: 8 };
/** GM 72 is Clarinet. */
const GM_CLARINET = 72;

const CLARINET_NAME = /\bclarinet|klarinette|clarinette|clarinetto\b/i;
const PIANO_NAME = /\bpiano|klavier|pianoforte|keyboard\b/i;

/**
 * The instrument a part's *name* states, or `null`.
 *
 * Split out because the import picker re-runs it whenever the user changes which part
 * they practise: the name travels with the stored part list, so the pre-selection can
 * follow the choice without the modal reopening the score.
 */
export function instrumentFromPartName(name: string | null | undefined): InstrumentId | null {
  if (!name) return null;
  if (CLARINET_NAME.test(name)) return 'clarinetBb';
  if (PIANO_NAME.test(name)) return 'piano';
  return null;
}

/**
 * The instrument a part looks like, or `null` when nothing says.
 *
 * Signals in order of trust:
 *
 * 1. **The part's name.** What the engraver called it is the most direct statement of
 *    intent available, and the only one many exports carry.
 * 2. **The GM program.** Reliable when present, but plenty of exporters emit a piano
 *    program for everything regardless of the part name, which is why it loses to a
 *    name that says otherwise.
 *
 * `<transpose>` is deliberately *not* a signal. A chromatic of −2 is a Bb clarinet, a
 * Bb trumpet, a soprano sax and a tenor horn alike, so it identifies a transposition
 * and never an instrument. It matters for the reading transposition
 * (`defaultBaseTranspose`) and nothing else.
 */
export function detectInstrument(
  content: string,
  part?: { id?: string; name?: string | null },
): InstrumentId | null {
  const byName = instrumentFromPartName(part?.name ?? null);
  if (byName) return byName;

  const program = scrapeMidiProgram(content, part?.id);
  if (program === GM_CLARINET) return 'clarinetBb';
  if (program != null && program >= GM_PIANO_RANGE.first && program <= GM_PIANO_RANGE.last) {
    return 'piano';
  }

  return null;
}

/**
 * Everything the import flow needs to decide what to ask about a freshly picked file.
 *
 * `mustAskPart` is true whenever there is more than one part, regardless of how
 * confident detection is: the app cannot know which line the user intends to practise,
 * and guessing "the first one" would quietly hand a clarinettist the flute part.
 *
 * `mustAskInstrument` is true whenever more than one instrument is *legal* for the
 * selection — not when detection is unsure. The two come apart in both directions,
 * and each direction is deliberate:
 *
 * - A two-staff piano score has exactly one legal answer, so nothing is asked even
 *   though the file may never name an instrument. There is no choice to offer.
 * - A single-line score always asks, however confident detection was, because that is
 *   the case where a wrong answer is possible *and* irreversible. Detection
 *   pre-selects; it does not decide.
 */
export interface ImportInstrumentGuess {
  instrument: InstrumentId | null;
  partId?: string;
  mustAskPart: boolean;
  mustAskInstrument: boolean;
}

export function guessImportInstrument(content: string, parts: ScorePart[]): ImportInstrumentGuess {
  const mustAskPart = parts.length > 1;
  // With one part there is nothing to choose, so partId stays undefined — the piece
  // means "the whole score" and the filter has nothing to do.
  const only = parts.length === 1 ? parts[0] : undefined;
  // A multi-part score has no settled part yet, so no part constrains the answer:
  // every instrument is still on the table and the modal asks for both, part first.
  const legal = legalInstrumentsForPart(only);
  const detected = mustAskPart ? null : detectInstrument(content, only);
  const forced = legal.length === 1 ? (legal[0] ?? null) : null;
  return {
    // Detection only survives if it is legal: a single-line file named "Clarinet" but
    // engraved on two staves is a piano piece, whatever it is called.
    instrument: detected && legal.includes(detected) ? detected : forced,
    mustAskPart,
    mustAskInstrument: legal.length > 1,
  };
}

/**
 * Semitones that make this part readable, once its instrument is known.
 *
 * Pairs the notation fact (`scrapePartTranspose`) with the rule that interprets it
 * (`defaultBaseTranspose`), so callers do not have to remember that a missing
 * `<transpose>` and an explicit zero mean different things.
 */
export function readingTransposeFor(
  content: string,
  instrument: InstrumentId,
  partId?: string,
): number {
  return defaultBaseTranspose(instrument, scrapePartTranspose(content, partId));
}
