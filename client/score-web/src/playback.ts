import * as Tone from 'tone';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { ArpeggioType, ArticulationEnum } from 'opensheetmusicdisplay';
import type { OutboundMessage } from './types';
import { resolveSections } from '../../src/score-web/sectionResolve';
// Pure count-in and loop-geometry math live in the domain layer (screens/score-web → domain).
import { computeCountIn, loopLeadInBeats } from '../../src/domain/countIn';
import { LOOP_MIN_GAP_PX, placeLoopAtCursor } from '../../src/domain/loop';

// Matches Tone.js default PPQ; must stay in sync with Tone.Transport.PPQ.
const TONE_PPQ = 192;

const PIANO_URLS: Record<string, string> = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
};

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

const HANDLE_WIDTH = 28;
const EDGE_ZONE = 60;
// Loop-creation unfurl: how long the overlay takes to grow out of the cursor.
// Short ease-out, in the same register as the native toolbar panels' spring.
const LOOP_UNFURL_MS = 200;
const LOOP_UNFURL_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
// Momentum scroll: fraction of velocity retained per 16 ms frame (increase toward 1 for longer glide).
const MOMENTUM_DECELERATION = 0.95;
// Fermata notes are held 1.75× their written duration.
const FERMATA_DURATION_MULTIPLIER = 1.75;
// Ticks between successive notes in an arpeggio roll (~15 ms at 120 BPM with PPQ=192).
const ARPEGGIO_STEP_TICKS = 6;

// Section junction marks drawn into the score. Each junction gets the outgoing
// section's color fading away to its left and the incoming section's fading away to
// its right, meeting at a crisp two-pixel seam — one pixel of each — so the junction
// stays legible even where two neighbouring sections happen to draw the same hue.
const SECTION_FADE_ALPHA = 0.35;
const SECTION_SEAM_PX = 1;
// The fade reaches roughly half a measure to each side, but engraved measure widths
// vary wildly (a whole-note bar against a run of semiquavers), so it is clamped.
const SECTION_FADE_MEASURES = 0.5;
const SECTION_FADE_MIN_PX = 20;
const SECTION_FADE_MAX_PX = 130;

interface NoteEvent {
  time: string;
  midi: number;
  durQ: number;
}

interface CursorStep {
  quarters: number; // expanded time (fermata hold adds extra quarters)
  pxLeft: number; // exact value of cursorElement.style.left at this step
  osmdIdx: number; // how many cursor.next() calls from start to reach this OSMD position
}

interface LoopRegion {
  aPx: number;
  bPx: number;
  aTicks: number;
  bTicks: number;
}

function postToNative(msg: OutboundMessage): void {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

type ActiveHand = 'both' | 'right' | 'left';
let activeHand: ActiveHand = 'both';

const HAND_GREY = '#B0B0B0';
const NOTE_BLACK = '#000000';

let sampler: Tone.Sampler | null = null;
let part: Tone.Part<NoteEvent> | null = null;
let metronomeEventId: number | null = null;
let metronomeEnabled = false;
let downbeatTicks: Set<number> = new Set();
// Per-measure time signature + start tick, in *playback* order: the cursor follows
// repeats, so a repeated measure appears here once per pass. Lets the count-in read
// the meter at the piece start or at a loop's start measure, both of which are
// looked up by tick rather than by index.
interface MeasureMeta {
  startTicks: number;
  num: number; // time-signature numerator (beats per measure)
  den: number; // time-signature denominator (beat unit)
  implicit: boolean; // true for a pickup/anacrusis measure
}
let measureMeta: MeasureMeta[] = [];
// Tick each measure of the *printed* score first sounds at, indexed by its position
// in the score's measure list.
//
// Kept separate from measureMeta because the two orders diverge at the first repeat
// back-jump: measureMeta is the unrolled timeline, this is the page. Sections arrive
// from the domain as printed-score indices, so they must resolve through this one.
let firstTicksBySourceIndex: (number | undefined)[] = [];
// Section start positions in ticks, ascending. Always a measure downbeat.
let sectionStartTicks: number[] = [];
// Palette color of each section, index-for-index with sectionStartTicks. Supplied by
// native, which owns the theme; the web side only paints with it.
let sectionColors: string[] = [];
// Position in native's original SET_SECTIONS array for each entry above.
//
// setSections drops sections it cannot resolve and re-sorts what survives, so a
// web-side index is not a native-side index. Native looks SECTION_INDEX up in its own
// list, so translating back through this is what keeps the label naming the section the
// user actually chose. Detection alone never triggered it — its boundaries are already
// ascending and resolvable — but user-placed boundaries can land on a measure the OSMD
// cursor never visits, and one drop shifts every index after it.
let sectionInputIndices: number[] = [];
// Last web-side index reported, so SECTION_INDEX is emitted on change only. Web-side
// throughout; it is translated on the way out, never stored translated.
let currentSectionIndex: number | null = null;
// Count-in setting: measures of metronome pre-roll before a fresh start (0 = off).
let countInMeasures = 0;
// True while the count-in pre-roll is sounding, before the transport starts.
let countingIn = false;
// Oscillator nodes scheduled for the current count-in, so a pause/stop can
// silence any that have not yet played.
let countInNodes: OscillatorNode[] = [];
let cursorSteps: CursorStep[] = [];
let currentCursorStep = -1;
let totalQuarters = 0;
let animFrameId: number | null = null;
let osmdRef: OpenSheetMusicDisplay | null = null;

let osmdEl: HTMLElement | null = null;
let sectionMarksEl: HTMLElement | null = null;
let handleAEl: HTMLElement | null = null;
let handleBEl: HTMLElement | null = null;
let shadeEl: HTMLElement | null = null;
let scrollOffsetPx = 0;
let scoreWidth = 0;
let viewportWidth = 0;
let scrollMinPx = 0; // translateX that puts the last note at center
let scrollMaxPx = 0; // translateX that puts the first note at center
// Intrinsic geometry of the rendered staff system (independent of viewport size), cached at
// load so the layout can be re-centered on viewport changes without re-rendering OSMD.
let systemTopPx = 0;
let systemHeightPx = 0;
let resizeListenerAttached = false;
let momentumFrameId: number | null = null;
let touchHandlersAttached = false;
let loopRegion: LoopRegion | null = null;
// Pending removal of the create-time CSS transition on the loop overlay (see
// unfurlLoopFromCursor). Held so a drag or a clear can cut the animation short.
let loopUnfurlTimeoutId: number | null = null;
// Tempo change schedule — kept for BPM lookup at arbitrary seek positions.
let tempoScheduleEventIds: number[] = [];
let tempoChangeSchedule: TempoChange[] = [];
let initialBpmValue = 120;
// Explicit BPM set by the user (piece tempo multiplier or warmup BPM). When non-null,
// startPlayback uses this instead of the score BPM so the override survives replay.
let userBpmOverride: number | null = null;
// Set when a loop is created or its handles are moved; cleared on next startPlayback
// so that play always jumps to loop A after a create/edit.
let loopModified = false;
// Tracks the actual OSMD cursor position (in terms of osmdIdx). Separate from
// currentCursorStep so backward seeks can be deferred without losing visual sync.
// Tracks actual OSMD cursor position (osmdIdx). Updated only in advanceCursorTo
// (called from startPlayback/stop, never from the RAF hot path).
let osmdActualIdx = -1;

// ─── Hand coloring ────────────────────────────────────────────────────────────

function applyHandColors(osmd: OpenSheetMusicDisplay): void {
  const coloringOpts = {
    applyToNoteheads: true,
    applyToBeams: true,
    applyToFlag: true,
    applyToStem: true,
    applyToLedgerLines: true,
  };
  for (const measureRow of osmd.GraphicSheet.MeasureList) {
    for (let si = 0; si < measureRow.length; si++) {
      const measure = measureRow[si];
      if (!measure) continue;
      const greyed =
        (activeHand === 'right' && si === 1) || (activeHand === 'left' && si === 0);
      const color = greyed ? HAND_GREY : NOTE_BLACK;
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            note.setColor(color, coloringOpts);
          }
        }
      }
    }
  }
}

// ─── Cursor element access ────────────────────────────────────────────────────

function cursorEl(): HTMLImageElement | undefined {
  return (osmdRef?.cursor as unknown as { cursorElement?: HTMLImageElement } | undefined)
    ?.cursorElement;
}

function hideCursorEl(): void {
  const el = cursorEl();
  if (el) el.style.visibility = 'hidden';
}

// ─── Build timelines ──────────────────────────────────────────────────────────

interface TempoChange {
  ticks: number;
  bpm: number;
}

export interface ExternalTempoChange {
  quarterBeat: number;
  bpm: number;
}

function buildTimelines(osmd: OpenSheetMusicDisplay): {
  noteEvents: NoteEvent[];
  scoreBpm: number;
  tempoChanges: TempoChange[];
} {
  const noteEvents: NoteEvent[] = [];
  const steps: CursorStep[] = [];
  const tempoChanges: TempoChange[] = [];

  osmd.cursor.reset();
  osmd.cursor.show();
  hideCursorEl();
  const el = cursorEl();

  const rawBpm = osmd.cursor.Iterator.CurrentBpm;
  const scoreBpm = rawBpm > 0 && rawBpm < 400 ? rawBpm : 120;

  const WHOLE_TO_QUARTER = 4;
  let lastExpandedQuarters = 0;
  let lastMeasure: unknown = null;
  // Extra ticks accumulated from fermata hold expansions. All note events and
  // cursor steps after a fermata are shifted right by this amount so that the
  // next note only starts after the fermata has fully sounded.
  let tickShift = 0;
  let osmdIdx = 0; // cursor.next() call count — shared by hold steps at the same position
  let lastBpm = scoreBpm;
  downbeatTicks = new Set();
  measureMeta = [];
  firstTicksBySourceIndex = [];

  while (!osmd.cursor.Iterator.EndReached) {
    const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
    const expandedQuarters = quarters + tickShift / TONE_PPQ;
    lastExpandedQuarters = expandedQuarters;

    const measure = osmd.cursor.Iterator.CurrentMeasure as unknown;
    if (measure !== lastMeasure) {
      lastMeasure = measure;
      const startTicks = Math.round(expandedQuarters * TONE_PPQ);
      downbeatTicks.add(startTicks);
      // Capture the time signature (and pickup flag) so the count-in can count
      // the right number of beats for this measure's meter.
      const sm = measure as {
        ActiveTimeSignature?: { Numerator?: number; Denominator?: number };
        ImplicitMeasure?: boolean;
      };
      const num = sm.ActiveTimeSignature?.Numerator;
      const den = sm.ActiveTimeSignature?.Denominator;
      measureMeta.push({
        startTicks,
        num: num && num > 0 ? num : 4,
        den: den && den > 0 ? den : 4,
        implicit: sm.ImplicitMeasure === true,
      });
      // CurrentMeasureIndex indexes Sheet.SourceMeasures — the printed score — and is
      // rewound by the iterator on a repeat's back-jump. Keeping only the first visit
      // maps a printed measure to the tick it first sounds at, which is where a
      // section starting there begins.
      const sourceIndex = osmd.cursor.Iterator.CurrentMeasureIndex;
      if (sourceIndex >= 0 && firstTicksBySourceIndex[sourceIndex] === undefined) {
        firstTicksBySourceIndex[sourceIndex] = startTicks;
      }
    }
    // Use style.left (exact value OSMD sets) rather than offsetLeft (integer, may round).
    const pxLeft = parseFloat(el?.style.left ?? '0');
    steps.push({ quarters: expandedQuarters, pxLeft, osmdIdx });

    // Extra ticks to insert after this position due to a fermata at this step.
    let fermataExtraTicks = 0;

    try {
      const notes = osmd.cursor.NotesUnderCursor();
      const baseTicks = Math.round(expandedQuarters * TONE_PPQ);

      // Separate notes into plain vs. arpeggio groups (keyed by the shared Arpeggio object).
      type OsmdNote = (typeof notes)[number];
      const arpMap = new Map<object, OsmdNote[]>();
      const plainNotes: OsmdNote[] = [];

      for (const note of notes) {
        if (note.isRest() || note.IsGraceNote) continue;
        if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
        // OSMD halfTone is semitones from C0; standard MIDI is semitones from C-1,
        // so add 12 to align octaves. Valid piano range: A0 (9) to C8 (96).
        if (note.halfTone < 9 || note.halfTone > 115) continue;
        if (activeHand !== 'both') {
          const si = note.ParentStaff?.idInMusicSheet ?? 0;
          if (activeHand === 'right' && si !== 0) continue;
          if (activeHand === 'left' && si !== 1) continue;
        }
        const arp = note.ParentVoiceEntry.Arpeggio;
        if (arp) {
          const group = arpMap.get(arp);
          if (group) group.push(note);
          else arpMap.set(arp, [note]);
        } else {
          plainNotes.push(note);
        }
      }

      for (const note of plainNotes) {
        const hasFermata = note.ParentVoiceEntry.Articulations.some(
          (a) =>
            a.articulationEnum === ArticulationEnum.fermata ||
            a.articulationEnum === ArticulationEnum.invertedfermata,
        );
        const normalDurQ = note.Length.RealValue * WHOLE_TO_QUARTER;
        const durQ = normalDurQ * (hasFermata ? FERMATA_DURATION_MULTIPLIER : 1);
        if (durQ <= 0) continue;
        noteEvents.push({ time: `${baseTicks}i`, midi: note.halfTone + 12, durQ });
        if (hasFermata) {
          const extra = Math.round(normalDurQ * (FERMATA_DURATION_MULTIPLIER - 1) * TONE_PPQ);
          if (extra > fermataExtraTicks) {
            fermataExtraTicks = extra;
          }
        }
      }

      for (const [arpObj, arpNotes] of arpMap) {
        const arp = arpObj as { type?: number };
        const descending =
          arp.type === ArpeggioType.BRUSH_DOWN ||
          arp.type === ArpeggioType.ROLL_DOWN ||
          arp.type === ArpeggioType.RASQUEDO_DOWN;
        const sorted = [...arpNotes].sort((a, b) =>
          descending ? b.halfTone - a.halfTone : a.halfTone - b.halfTone,
        );
        sorted.forEach((note, i) => {
          const hasFermata = note.ParentVoiceEntry.Articulations.some(
            (a) =>
              a.articulationEnum === ArticulationEnum.fermata ||
              a.articulationEnum === ArticulationEnum.invertedfermata,
          );
          const normalDurQ = note.Length.RealValue * WHOLE_TO_QUARTER;
          const durQ = normalDurQ * (hasFermata ? FERMATA_DURATION_MULTIPLIER : 1);
          if (durQ <= 0) return;
          noteEvents.push({
            time: `${baseTicks + i * ARPEGGIO_STEP_TICKS}i`,
            midi: note.halfTone,
            durQ,
          });
          // Only the first note in the arpeggio governs hold duration.
          if (hasFermata && i === 0) {
            const extra = Math.round(normalDurQ * (FERMATA_DURATION_MULTIPLIER - 1) * TONE_PPQ);
            if (extra > fermataExtraTicks) {
              fermataExtraTicks = extra;
            }
          }
        });
      }
    } catch {
      // skip position if note extraction fails
    }

    if (fermataExtraTicks > 0) {
      // Shift all subsequent steps right by the fermata's extra duration so the
      // next note only begins after the hold has fully sounded. No hold step is
      // inserted here — the interpolation between this step and the next will
      // naturally drift the cursor slowly toward the next note over the expanded
      // duration, matching the audio instead of freezing on the fermata symbol.
      tickShift += fermataExtraTicks;
    }

    // Track tempo changes so multi-tempo scores (routines) schedule BPM correctly.
    const stepBpm = osmd.cursor.Iterator.CurrentBpm;
    if (stepBpm > 0 && stepBpm < 400 && Math.abs(stepBpm - lastBpm) > 0.5) {
      tempoChanges.push({ ticks: Math.round(expandedQuarters * TONE_PPQ), bpm: stepBpm });
      lastBpm = stepBpm;
    }

    osmdIdx++;
    osmd.cursor.next();
  }

  // Some OSMD builds set EndReached while the cursor is still AT the final note,
  // not past it, so the while-loop exits before that position is pushed. Capture
  // it here when pxLeft is strictly beyond the last captured step.
  const finalPxLeft = parseFloat(el?.style.left ?? '0');
  const lastCapturedPx = steps[steps.length - 1]?.pxLeft ?? -1;
  if (finalPxLeft > lastCapturedPx) {
    const q = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
    const expandedQ = q + tickShift / TONE_PPQ;
    lastExpandedQuarters = expandedQ;
    steps.push({ quarters: expandedQ, pxLeft: finalPxLeft, osmdIdx });
  }

  totalQuarters = lastExpandedQuarters + 1;
  cursorSteps = steps;
  osmd.cursor.reset();

  return { noteEvents, scoreBpm, tempoChanges };
}

// ─── Score translation ────────────────────────────────────────────────────────

function clampTranslate(px: number): number {
  return Math.max(scrollMinPx, Math.min(scrollMaxPx, px));
}

function applyTranslate(px: number): void {
  scrollOffsetPx = px;
  if (!osmdEl) return;
  osmdEl.style.transition = 'none';
  osmdEl.style.transform = `translateX(${px}px)`;
}

// Recomputes every viewport-dependent layout value: the vertical centering of the staff
// system and the horizontal scroll bounds. Intrinsic geometry (systemTopPx/systemHeightPx
// and the cursor-step positions) is cached at load and unaffected by resize, so this needs
// no OSMD re-render. Does not move the score — callers apply the translate they want.
function recomputeViewportMetrics(): void {
  if (!osmdEl) return;
  viewportWidth = window.innerWidth;

  const viewportHeight = window.innerHeight;
  const centeredTop = Math.round((viewportHeight - systemHeightPx) / 2);
  osmdEl.style.top = `${centeredTop - systemTopPx}px`;

  const px0 = cursorSteps[0]?.pxLeft ?? 0;
  const pxLast = cursorSteps[cursorSteps.length - 1]?.pxLeft ?? scoreWidth;
  scrollMaxPx = viewportWidth / 2 - px0;
  scrollMinPx = viewportWidth / 2 - pxLast;
}

// Orientation changes (e.g. leaving the landscape play view for the portrait routine editor
// and coming back) resize the WebView while OSMD's autoResize is off. Without recomputing,
// the score stays centered for the previous viewport height and slides off the bottom of the
// screen. Keeps whatever score position is currently centered still centered after a width
// change; during playback the RAF loop re-drives the translate on the next frame anyway.
function onViewportResize(): void {
  if (!osmdEl) return;
  const prevViewportWidth = viewportWidth;
  const centeredScoreX = prevViewportWidth > 0 ? prevViewportWidth / 2 - scrollOffsetPx : 0;
  recomputeViewportMetrics();
  const target = prevViewportWidth > 0 ? viewportWidth / 2 - centeredScoreX : scrollMaxPx;
  applyTranslate(clampTranslate(target));
}

// ─── OSMD cursor iterator advance (no translate — RAF handles that) ───────────

function advanceCursorTo(targetStep: number): void {
  if (!osmdRef || targetStep === currentCursorStep) return;

  if (targetStep < 0) {
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    currentCursorStep = -1;
    osmdActualIdx = 0;
    return;
  }

  // cursorSteps may contain extra hold steps (same osmdIdx as preceding step).
  // Use osmdIdx — not the step array index — to decide how many cursor.next()
  // calls to make, so hold steps don't accidentally advance the OSMD cursor.
  const targetIdx = cursorSteps[targetStep]?.osmdIdx ?? 0;

  if (osmdActualIdx < 0) {
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    for (let i = 0; i < targetIdx; i++) osmdRef.cursor.next();
    osmdActualIdx = targetIdx;
  } else if (targetIdx > osmdActualIdx) {
    for (let i = 0; i < targetIdx - osmdActualIdx; i++) osmdRef.cursor.next();
    osmdActualIdx = targetIdx;
  } else if (targetIdx < osmdActualIdx) {
    // Backward seek — only called from startPlayback (before Transport.start),
    // never from the RAF hot path, so synchronous cost is acceptable.
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    for (let i = 0; i < targetIdx; i++) osmdRef.cursor.next();
    osmdActualIdx = targetIdx;
  }
  currentCursorStep = targetStep;
}

// ─── Binary search helpers ────────────────────────────────────────────────────

function nearestStepToPx(px: number): number {
  let lo = 0, hi = cursorSteps.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.pxLeft <= px) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

function ticksToStep(ticks: number): number {
  const q = ticks / TONE_PPQ;
  let lo = 0, hi = cursorSteps.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.quarters <= q) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

/**
 * Moves the whole playhead — transport, OSMD iterator, cursor element and score
 * translation — to a tick position. The four have to move together or the audio and
 * the visible cursor disagree, so every seek goes through here.
 */
function seekToTicks(ticks: number): void {
  Tone.Transport.ticks = ticks;
  const targetStep = ticksToStep(ticks);
  advanceCursorTo(targetStep);
  const px = cursorSteps[targetStep]?.pxLeft ?? 0;
  const el = cursorEl();
  if (el) el.style.left = `${px}px`;
  applyTranslate(viewportWidth / 2 - px);
}

// First step whose pxLeft ≥ px (ceiling). Used to find the first note inside the loop start.
function ceilStepToPx(px: number): number {
  let lo = 0, hi = cursorSteps.length - 1, best = cursorSteps.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.pxLeft >= px) { best = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return best;
}

// Loop start snaps to the first note at or after aPx, so notes just before the
// handle are excluded.
function pxToLoopStartTicks(px: number): number {
  return Math.round((cursorSteps[ceilStepToPx(px)]?.quarters ?? 0) * TONE_PPQ);
}

// Loop end is set to the step AFTER the last included note so that note has time
// to play before the transport wraps. Falls back to totalQuarters when the last
// included note is the final note in the piece.
function pxToLoopEndTicks(px: number): number {
  const floorIdx = nearestStepToPx(px);
  const nextStep = cursorSteps[floorIdx + 1];
  if (nextStep !== undefined) return Math.round(nextStep.quarters * TONE_PPQ);
  return Math.round(totalQuarters * TONE_PPQ);
}

// ─── RAF animation loop ───────────────────────────────────────────────────────

function animateCursorLoop(): void {
  if (Tone.Transport.state !== 'started') {
    // During the count-in the transport is scheduled to start at a future audio
    // time, so its state reads 'stopped' until then. Keep the frame loop alive
    // (cursor parked at the start position) and pick up once playback begins.
    if (countingIn) {
      animFrameId = requestAnimationFrame(animateCursorLoop);
      return;
    }
    animFrameId = null;
    return;
  }

  // Transport has started: the count-in (if any) is over. Drop the scheduled
  // click nodes so a later mid-piece pause isn't mistaken for a count-in abort.
  if (countingIn) {
    countingIn = false;
    countInNodes = [];
  }

  const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;

  // Tone.js may take a frame or two for Transport.ticks to wrap back to loopStart
  // after the audio loop fires. Snap effectiveQE to loopStart the moment elapsed
  // ticks pass loopEnd so the cursor jumps immediately rather than sitting at the end.
  const effectiveQE =
    loopRegion !== null && quartersElapsed >= loopRegion.bTicks / TONE_PPQ
      ? loopRegion.aTicks / TONE_PPQ
      : quartersElapsed;

  // Binary search for the last cursor step whose beat position ≤ current transport ticks.
  let lo = 0, hi = cursorSteps.length - 1, targetStep = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.quarters <= effectiveQE) { targetStep = mid; lo = mid + 1; }
    else hi = mid - 1;
  }

  // Visual position is driven entirely by cursorSteps — OSMD iterator is not
  // advanced here to avoid main-thread stalls on backward seeks (loop wraps).
  currentCursorStep = targetStep;

  // Cheap: a scan over at most a dozen section starts, and it posts nothing unless
  // the cursor actually crossed a junction.
  emitSectionIfChanged(effectiveQE * TONE_PPQ);

  // Interpolate position between current step and the next for smooth scrolling.
  // The interpolated px is used for BOTH the score translation AND the cursor element's
  // left position so they always align on the center line.
  const currPx = cursorSteps[targetStep]?.pxLeft ?? 0;
  const nextPx = cursorSteps[targetStep + 1]?.pxLeft ?? currPx;
  const currQ = cursorSteps[targetStep]?.quarters ?? 0;
  const nextQ = cursorSteps[targetStep + 1]?.quarters ?? (currQ + 1);
  const fraction = nextQ > currQ ? Math.min(1, (effectiveQE - currQ) / (nextQ - currQ)) : 0;
  const rawInterpolatedPx = currPx + fraction * (nextPx - currPx);
  // Clamp to the loop's right boundary so the cursor never wanders into handle B.
  const interpolatedPx = loopRegion !== null ? Math.min(rawInterpolatedPx, loopRegion.bPx) : rawInterpolatedPx;

  // Move OSMD cursor element to interpolated position so it stays on the center line.
  const el = cursorEl();
  if (el) el.style.left = `${interpolatedPx}px`;

  applyTranslate(viewportWidth / 2 - interpolatedPx);

  if (quartersElapsed >= totalQuarters && totalQuarters > 0 && !Tone.Transport.loop) {
    _stopInternal();
    postToNative({ type: 'PLAYBACK_END' });
    return;
  }

  animFrameId = requestAnimationFrame(animateCursorLoop);
}

// ─── Internal stop ────────────────────────────────────────────────────────────

function _stopInternal(): void {
  // Abort any pending count-in so its clicks and scheduled start don't outlive
  // the stop.
  cancelCountIn();
  Tone.Transport.stop();
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }
  // Reset OSMD cursor and score to position 0.
  if (osmdRef) {
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    osmdActualIdx = 0;
  } else {
    osmdActualIdx = -1;
  }
  currentCursorStep = 0;
  const px0 = cursorSteps[0]?.pxLeft ?? 0;
  const el = cursorEl();
  if (el) el.style.left = `${px0}px`;
  applyTranslate(viewportWidth / 2 - px0);
  // Transport.stop() rewinds to 0, so the label has to come back to the first
  // section — otherwise a piece that plays to the end leaves it on the last one.
  emitSectionIfChanged(0);
}

// ─── Touch: manual score pan ──────────────────────────────────────────────────

function syncCursorToCenter(): void {
  const centerInScore = viewportWidth / 2 - scrollOffsetPx;
  const step = nearestStepToPx(centerInScore);
  currentCursorStep = step;
  Tone.Transport.ticks = Math.round((cursorSteps[step]?.quarters ?? 0) * TONE_PPQ);
  const el = cursorEl();
  if (el) el.style.left = `${cursorSteps[step]?.pxLeft ?? 0}px`;
  // The frame loop is not running while paused, so a manual pan is the other way
  // the playhead can cross a section junction.
  emitSectionIfChanged(Tone.Transport.ticks);
}

function startMomentum(initialVelocity: number): void {
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }
  let velocity = initialVelocity;
  let lastTime = performance.now();

  function step(now: number): void {
    const dt = Math.min(now - lastTime, 64); // cap to avoid jump after tab-hide
    lastTime = now;
    velocity *= Math.pow(MOMENTUM_DECELERATION, dt / 16);
    if (Math.abs(velocity) < 0.05) {
      momentumFrameId = null;
      syncCursorToCenter();
      return;
    }
    const next = scrollOffsetPx + velocity * dt;
    const clamped = clampTranslate(next);
    applyTranslate(clamped);
    emitSectionAtScrollOffset();
    if (clamped !== next) {
      momentumFrameId = null;
      syncCursorToCenter();
      return;
    }
    momentumFrameId = requestAnimationFrame(step);
  }

  momentumFrameId = requestAnimationFrame(step);
}

// ─── Touch handling ───────────────────────────────────────────────────────────

function initTouchHandlers(): void {
  if (touchHandlersAttached) return;
  touchHandlersAttached = true;

  const wrapper = document.getElementById('osmd-wrapper');
  if (!wrapper) return;

  let startX = 0;
  let startOffset = 0;
  let dragging = false;
  let velocityPx = 0; // px/ms, exponential moving average
  let lastMoveTime = 0;
  let lastMoveX = 0;

  let wasPlayingOnTouch = false;
  let hasMoved = false;

  wrapper.addEventListener('touchstart', (e) => {
    if ((e.target as Element).closest('.loop-handle')) return;
    if (momentumFrameId !== null) {
      cancelAnimationFrame(momentumFrameId);
      momentumFrameId = null;
    }
    dragging = true;
    wasPlayingOnTouch = Tone.Transport.state === 'started';
    hasMoved = false;
    const clientX = e.touches[0]?.clientX ?? 0;
    startX = clientX;
    startOffset = scrollOffsetPx;
    velocityPx = 0;
    lastMoveTime = 0;
    lastMoveX = clientX;
    // Don't pause immediately — wait to see if this is a tap or a drag.
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const clientX = e.touches[0]?.clientX ?? 0;
    // First significant movement: mark as a drag rather than a tap.
    if (!hasMoved && Math.abs(clientX - startX) > 8) {
      hasMoved = true;
      if (wasPlayingOnTouch) pausePlayback();
    }
    if (lastMoveTime > 0 && now > lastMoveTime) {
      const dt = now - lastMoveTime;
      const inst = (clientX - lastMoveX) / dt;
      velocityPx = velocityPx * 0.7 + inst * 0.3; // exponential smoothing
    }
    lastMoveTime = now;
    lastMoveX = clientX;
    applyTranslate(clampTranslate(startOffset + (clientX - startX)));
    emitSectionAtScrollOffset();
  }, { passive: true });

  wrapper.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (!hasMoved) {
      // Tap: toggle play/pause.
      if (Tone.Transport.state === 'started') {
        pausePlayback();
      } else {
        void startPlayback();
      }
      return;
    }
    if (Math.abs(velocityPx) > 0.05) {
      startMomentum(velocityPx);
    } else {
      syncCursorToCenter();
    }
  }, { passive: true });
}

// ─── Loop handle dragging ─────────────────────────────────────────────────────


// The single mapping from a loop's score-pixel bounds to the three overlay
// elements' CSS geometry. Both the drag path (updateLoopOverlay) and the create
// path (unfurlLoopFromCursor) go through here so they cannot drift apart.
function loopOverlayGeometry(
  aPx: number,
  bPx: number,
): { handleA: number; handleB: number; shade: { left: number; width: number } } {
  return {
    // Handle A sits to the left of aPx (inner/right edge at aPx).
    handleA: aPx - HANDLE_WIDTH,
    handleB: bPx,
    shade: { left: aPx, width: bPx - aPx },
  };
}

function updateLoopOverlay(): void {
  if (!loopRegion) return;
  const geom = loopOverlayGeometry(loopRegion.aPx, loopRegion.bPx);
  if (handleAEl) handleAEl.style.left = `${geom.handleA}px`;
  if (handleBEl) handleBEl.style.left = `${geom.handleB}px`;
  if (shadeEl) {
    shadeEl.style.left = `${geom.shade.left}px`;
    shadeEl.style.width = `${geom.shade.width}px`;
  }
}

// Hides the loop overlay and tells the native toolbar no loop is active.
function hideLoopOverlay(): void {
  if (handleAEl) handleAEl.style.display = 'none';
  if (handleBEl) handleBEl.style.display = 'none';
  if (shadeEl) shadeEl.style.display = 'none';
  postToNative({ type: 'LOOP_STATE', payload: false });
}

// Drops the create-time CSS transition. Dragging rewrites `left` every frame, so
// a lingering transition would make the handle lag behind the finger.
function endLoopUnfurl(): void {
  if (loopUnfurlTimeoutId !== null) {
    window.clearTimeout(loopUnfurlTimeoutId);
    loopUnfurlTimeoutId = null;
  }
  for (const el of [handleAEl, handleBEl, shadeEl]) {
    if (el) el.style.transition = 'none';
  }
}

// One overlay element's slide from its collapsed-at-cursor geometry to its final
// geometry. `fromW`/`toW` are only used by the shade, which grows in width too.
interface UnfurlStep {
  el: HTMLElement;
  fromLeft: number;
  toLeft: number;
  fromW?: number;
  toW?: number;
}

// Animates the freshly created loop out of the cursor: each overlay element
// starts collapsed at the cursor line and slides to its final geometry, so the
// region visually unfurls from the cursor instead of popping into existence.
// An element already at its final position — handle A whenever the loop starts
// at the cursor — is placed directly and does not animate.
function unfurlLoopFromCursor(cursorPx: number): void {
  if (!loopRegion) return;
  endLoopUnfurl();

  const steps: UnfurlStep[] = [];
  const add = (
    el: HTMLElement | null,
    fromLeft: number,
    toLeft: number,
    fromW?: number,
    toW?: number,
  ): void => {
    if (!el) return;
    const moves =
      Math.abs(toLeft - fromLeft) > 0.5 ||
      (fromW !== undefined && toW !== undefined && Math.abs(toW - fromW) > 0.5);
    if (!moves) {
      el.style.left = `${toLeft}px`;
      if (toW !== undefined) el.style.width = `${toW}px`;
      return;
    }
    el.style.left = `${fromLeft}px`;
    if (fromW !== undefined) el.style.width = `${fromW}px`;
    steps.push({ el, fromLeft, toLeft, fromW, toW });
  };

  // Collapsed start state is the same mapping evaluated at a zero-width loop
  // sitting on the cursor.
  const from = loopOverlayGeometry(cursorPx, cursorPx);
  const to = loopOverlayGeometry(loopRegion.aPx, loopRegion.bPx);
  add(handleAEl, from.handleA, to.handleA);
  add(handleBEl, from.handleB, to.handleB);
  add(shadeEl, from.shade.left, to.shade.left, from.shade.width, to.shade.width);

  if (steps.length === 0) return;

  // Force a style flush so the collapsed geometry becomes the transition's start
  // value; without it the browser coalesces both writes and nothing animates.
  void steps[0]!.el.offsetWidth;

  const transition = `left ${LOOP_UNFURL_MS}ms ${LOOP_UNFURL_EASING}, width ${LOOP_UNFURL_MS}ms ${LOOP_UNFURL_EASING}`;
  for (const s of steps) {
    s.el.style.transition = transition;
    s.el.style.left = `${s.toLeft}px`;
    if (s.toW !== undefined) s.el.style.width = `${s.toW}px`;
  }
  loopUnfurlTimeoutId = window.setTimeout(endLoopUnfurl, LOOP_UNFURL_MS + 50);
}

function initLoopHandles(): void {
  function makeDrag(which: 'a' | 'b'): void {
    const el = which === 'a' ? handleAEl : handleBEl;
    if (!el) return;
    let startTouchX = 0;
    let startPx = 0;
    let startScrollOffset = 0;
    let currentClientX = 0;
    let dragRafId: number | null = null;

    function dragFrame(): void {
      if (!loopRegion) return;

      // Proportional edge-scroll: faster the closer the finger is to the viewport edge.
      const edgeLeft = currentClientX < EDGE_ZONE ? (EDGE_ZONE - currentClientX) / EDGE_ZONE : 0;
      const edgeRight = currentClientX > viewportWidth - EDGE_ZONE
        ? (currentClientX - (viewportWidth - EDGE_ZONE)) / EDGE_ZONE : 0;
      if (edgeLeft > 0) {
        applyTranslate(Math.min(scrollMaxPx, scrollOffsetPx + Math.ceil(edgeLeft * 8)));
      } else if (edgeRight > 0) {
        applyTranslate(Math.max(scrollMinPx, scrollOffsetPx - Math.ceil(edgeRight * 8)));
      }

      // Project finger into score space, preserving the initial finger-to-handle offset.
      // Using current scrollOffsetPx (possibly just updated above) keeps the handle
      // locked to the finger even while the score scrolls under it.
      const initialOffset = startPx + startScrollOffset - startTouchX;
      let newPx = currentClientX + initialOffset - scrollOffsetPx;
      const scorePxMin = cursorSteps[0]?.pxLeft ?? 0;
      const scorePxMax = cursorSteps[cursorSteps.length - 1]?.pxLeft ?? scoreWidth;

      if (which === 'a') {
        newPx = Math.max(scorePxMin, Math.min(loopRegion.bPx - LOOP_MIN_GAP_PX, newPx));
        loopRegion.aPx = newPx;
        loopRegion.aTicks = pxToLoopStartTicks(newPx);
        Tone.Transport.loopStart = `${loopRegion.aTicks}i`;
      } else {
        newPx = Math.max(loopRegion.aPx + LOOP_MIN_GAP_PX, Math.min(scorePxMax, newPx));
        loopRegion.bPx = newPx;
        loopRegion.bTicks = pxToLoopEndTicks(newPx);
        Tone.Transport.loopEnd = `${loopRegion.bTicks}i`;
      }

      updateLoopOverlay();
      dragRafId = requestAnimationFrame(dragFrame);
    }

    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (Tone.Transport.state === 'started') pausePlayback();
      // Grabbing a handle mid-unfurl snaps the overlay out of its transition so
      // the drag tracks the finger exactly.
      endLoopUnfurl();
      currentClientX = e.touches[0]?.clientX ?? 0;
      startTouchX = currentClientX;
      startPx = which === 'a' ? (loopRegion?.aPx ?? 0) : (loopRegion?.bPx ?? 0);
      startScrollOffset = scrollOffsetPx;
      if (dragRafId !== null) cancelAnimationFrame(dragRafId);
      dragRafId = requestAnimationFrame(dragFrame);
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      currentClientX = e.touches[0]?.clientX ?? 0;
    }, { passive: false });

    el.addEventListener('touchend', () => {
      if (dragRafId !== null) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      loopModified = true;
    }, { passive: true });
  }

  makeDrag('a');
  makeDrag('b');
}

// ─── Loop create / clear ──────────────────────────────────────────────────────

function setOverlayBounds(top: number, height: number): void {
  for (const el of [handleAEl, handleBEl, shadeEl, sectionMarksEl]) {
    if (!el) continue;
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
  }
}

function createLoop(): void {
  // Stop momentum so the overlay is stationary from the moment it appears.
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }
  // currentCursorStep is only synced when momentum ends; compute the actual
  // current center from scrollOffsetPx, which is up-to-date every RAF frame.
  const centerInScore = viewportWidth / 2 - scrollOffsetPx;
  const stepIdx = nearestStepToPx(centerInScore);
  const step = cursorSteps[stepIdx < 0 ? 0 : stepIdx];
  if (!step) return;
  const scorePxMin = cursorSteps[0]?.pxLeft ?? 0;
  const scorePxMax = cursorSteps[cursorSteps.length - 1]?.pxLeft ?? scoreWidth;
  // The cursor's own note position, not the raw viewport centre: the loop must
  // include the note the cursor sits on, and pxToLoopStartTicks snaps A forward
  // to the first note at or after it.
  const cursorPx = step.pxLeft;
  // Start at the cursor and extend LOOP_DEFAULT_PX forward; near the end of the
  // piece the loop is shifted back so it still fits (A then lands before the
  // cursor). See domain/loop.ts.
  const { aPx, bPx } = placeLoopAtCursor({ cursorPx, scorePxMin, scorePxMax });
  const aTicks = pxToLoopStartTicks(aPx);
  const bTicks = pxToLoopEndTicks(bPx);
  loopRegion = { aPx, bPx, aTicks, bTicks };
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = `${aTicks}i`;
  Tone.Transport.loopEnd = `${bTicks}i`;
  if (handleAEl) handleAEl.style.display = 'flex';
  if (handleBEl) handleBEl.style.display = 'flex';
  if (shadeEl) shadeEl.style.display = 'block';
  unfurlLoopFromCursor(cursorPx);
  loopModified = true;
  postToNative({ type: 'LOOP_STATE', payload: true });
  if (Tone.Transport.state === 'started') pausePlayback();
}

function clearLoop(): void {
  loopRegion = null;
  endLoopUnfurl();
  Tone.Transport.loop = false;
  hideLoopOverlay();
  if (Tone.Transport.state === 'started') pausePlayback();
}

export function toggleLoop(): void {
  if (loopRegion) clearLoop();
  else createLoop();
}

// ─── Metronome ────────────────────────────────────────────────────────────────

// One metronome click. Accented beats (measure downbeats) are higher and louder.
// Returns the oscillator so the count-in can silence not-yet-played clicks.
function playClick(ctx: AudioContext, time: number, accented: boolean): OscillatorNode {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = accented ? 1500 : 1000;
  gainNode.gain.setValueAtTime(accented ? 0.45 : 0.2, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
  return osc;
}

function startMetronome(): void {
  if (metronomeEventId !== null) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  // If the piece has a pickup measure whose duration is not a quarter-note multiple
  // (e.g. a single eighth-note anacrusis), the first full measure starts at a
  // sub-quarter tick position. Offset the repeat so beats land on real measure
  // boundaries instead of being perpetually misaligned.
  const sortedDownbeats = [...downbeatTicks].sort((a, b) => a - b);
  const pickupOffsetTicks =
    sortedDownbeats.length >= 2 ? (sortedDownbeats[1]! % TONE_PPQ) : 0;

  metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
    const ctx = Tone.getContext().rawContext as AudioContext;

    // downbeatTicks was built from OSMD measure boundaries — correct for any
    // time signature and handles mid-score signature changes.
    // Round to nearest integer tick rather than nearest quarter so sub-quarter
    // downbeats (e.g. after an eighth-note pickup) are matched correctly.
    const ticks = Math.round(Tone.Transport.getTicksAtTime(time));
    playClick(ctx, time, downbeatTicks.has(ticks));
  }, '4n', pickupOffsetTicks > 0 ? `${pickupOffsetTicks}i` : 0);
}

export function toggleMetronome(): void {
  metronomeEnabled = !metronomeEnabled;
  if (metronomeEnabled) {
    startMetronome();
  } else {
    if (metronomeEventId !== null) {
      Tone.Transport.clear(metronomeEventId);
      metronomeEventId = null;
    }
  }
}

// ─── Count-in ─────────────────────────────────────────────────────────────────

export function setCountIn(measures: number): void {
  countInMeasures = Number.isFinite(measures) ? Math.max(0, Math.min(2, Math.round(measures))) : 0;
}

// Measure in effect at a given tick (the last measure that started at or before
// it). Falls back to a synthetic 4/4 measure when no metadata is available.
function measureAtTicks(ticks: number): MeasureMeta {
  let best: MeasureMeta | undefined = measureMeta[0];
  for (const m of measureMeta) {
    if (m.startTicks <= ticks) best = m;
    else break;
  }
  return best ?? { startTicks: 0, num: 4, den: 4, implicit: false };
}

// Silence any not-yet-played count-in clicks and clear the flag. Returns true if
// a count-in was in progress, so callers can treat the tap as an abort rather
// than a normal pause/stop.
function cancelCountIn(): boolean {
  const wasCountingIn = countingIn || countInNodes.length > 0;
  countingIn = false;
  for (const osc of countInNodes) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // already stopped/disconnected
    }
  }
  countInNodes = [];
  return wasCountingIn;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Sections ─────────────────────────────────────────────────────────────────

// Tick comparisons at a section seam need slack: tick positions are rounded to whole
// ticks, so a strict test would read the playhead sitting exactly on a junction as
// still belonging to the previous section.
const SEAM_EPSILON_TICKS = 1;

/**
 * Resolves a section's start measure — a printed-score index — to its tick.
 *
 * Sections always begin on a barline. Pickups are deliberately not compensated for:
 * an opening anacrusis is simply part of the first section, and where an interior
 * section is led into by an upbeat, that upbeat falls in the preceding section.
 *
 * The alternative was shifting junctions back off the barline by the anacrusis
 * length, but nothing in the notation says whether a piece's opening pickup implies
 * one at every later section, so that offset was as often wrong as right. Landing on
 * the barline is at least predictable, and it keeps the label, the swipe target and
 * the junction mark agreeing with the engraving the user is looking at.
 */
function sectionStartTickFor(measureIndex: number): number | null {
  return firstTicksBySourceIndex[measureIndex] ?? null;
}

/** The section containing `ticks`, or null when the piece has no sections. */
function sectionIndexAtTicks(ticks: number): number | null {
  if (sectionStartTicks.length === 0) return null;
  let index = 0;
  for (let i = 0; i < sectionStartTicks.length; i++) {
    if ((sectionStartTicks[i] ?? 0) <= ticks + SEAM_EPSILON_TICKS) index = i;
    else break;
  }
  return index;
}

/**
 * Translates a web-side section index into the position native sent it at.
 *
 * Everything inside this file indexes the resolved, re-sorted list; everything native
 * does with SECTION_INDEX indexes `piece.sections`. This is the one place the two meet.
 */
function nativeSectionIndex(webIndex: number | null): number | null {
  if (webIndex === null) return null;
  return sectionInputIndices[webIndex] ?? null;
}

/**
 * Reports the current section to native, but only when it actually changes —
 * roughly once per section rather than once per animation frame.
 */
function emitSectionIfChanged(ticks: number): void {
  const index = sectionIndexAtTicks(ticks);
  if (index === currentSectionIndex) return;
  currentSectionIndex = index;
  postToNative({ type: 'SECTION_INDEX', payload: nativeSectionIndex(index) });
}

/** Score-pixel position of a tick, via the cursor step that owns it. */
function pxAtTicks(ticks: number): number {
  return cursorSteps[ticksToStep(ticks)]?.pxLeft ?? 0;
}

/**
 * How far a junction's fade reaches to each side: half a measure of engraved score,
 * measured in pixels rather than assumed, because measure widths vary with how many
 * notes they hold.
 */
function fadeReachPx(ticks: number): number {
  const meta = measureAtTicks(ticks);
  const reachTicks = ((TONE_PPQ * 4) / meta.den) * meta.num * SECTION_FADE_MEASURES;
  const here = pxAtTicks(ticks);
  const span = Math.max(
    here - pxAtTicks(Math.max(0, ticks - reachTicks)),
    pxAtTicks(ticks + reachTicks) - here,
  );
  return Math.min(SECTION_FADE_MAX_PX, Math.max(SECTION_FADE_MIN_PX, span));
}

function markDiv(left: number, width: number, background: string, opacity: number): HTMLElement {
  const el = document.createElement('div');
  el.style.left = `${left}px`;
  el.style.width = `${width}px`;
  el.style.background = background;
  el.style.opacity = `${opacity}`;
  return el;
}

/**
 * Paints a colored mark into the score at every junction between two sections.
 *
 * Junctions only — a mark sits *between* two sections, so a piece with n sections
 * gets n-1 of them and the opening of the piece is left unmarked.
 *
 * The elements live inside #osmd, so they translate with the score for free and
 * need no per-frame work; they are rebuilt only when the section list changes.
 */
function renderSectionMarks(): void {
  if (!sectionMarksEl) return;
  sectionMarksEl.textContent = '';
  if (sectionStartTicks.length < 2 || cursorSteps.length === 0) return;

  for (let i = 1; i < sectionStartTicks.length; i++) {
    const ticks = sectionStartTicks[i];
    if (ticks === undefined) continue;
    const px = pxAtTicks(ticks);
    const reach = fadeReachPx(ticks);
    const outgoing = sectionColors[i - 1];
    const incoming = sectionColors[i];
    if (outgoing === undefined || incoming === undefined) continue;

    sectionMarksEl.appendChild(
      markDiv(
        px - reach,
        reach,
        `linear-gradient(to right, transparent, ${outgoing})`,
        SECTION_FADE_ALPHA,
      ),
    );
    sectionMarksEl.appendChild(
      markDiv(px, reach, `linear-gradient(to right, ${incoming}, transparent)`, SECTION_FADE_ALPHA),
    );
    // The seam itself, at full strength: without it two adjacent sections drawing
    // the same hue would blur into one continuous wash with no junction visible.
    sectionMarksEl.appendChild(markDiv(px - SECTION_SEAM_PX, SECTION_SEAM_PX, outgoing, 1));
    sectionMarksEl.appendChild(markDiv(px, SECTION_SEAM_PX, incoming, 1));
  }
}

/**
 * Installs the piece's sections, given as 0-based start measure indices into the
 * printed score, with the palette color each one draws.
 *
 * Must be called after initPlayback: the measure-to-tick table only exists once the
 * score has been walked.
 */
export function setSections(startMeasureIndices: number[], colors: string[]): void {
  const resolved = resolveSections(startMeasureIndices, colors, sectionStartTickFor);
  sectionStartTicks = resolved.map((s) => s.ticks);
  sectionColors = resolved.map((s) => s.color);
  // Carried through the drop and the sort so SECTION_INDEX can be translated back.
  sectionInputIndices = resolved.map((s) => s.inputIndex);

  renderSectionMarks();

  // Always report, even when null: a previously loaded piece may have left the
  // native label showing a section this score does not have.
  currentSectionIndex = sectionIndexAtTicks(Tone.Transport.ticks);
  postToNative({ type: 'SECTION_INDEX', payload: nativeSectionIndex(currentSectionIndex) });
}

/**
 * Reports the section under the centre line from the current scroll offset.
 *
 * While the user pans, the transport has not moved — only the score has — so the
 * label has to be driven from the translation instead. Called on every pan and
 * momentum frame so the name flips the instant the centre line crosses a junction,
 * rather than snapping once the scroll settles.
 */
function emitSectionAtScrollOffset(): void {
  if (sectionStartTicks.length === 0) return;
  const step = nearestStepToPx(viewportWidth / 2 - scrollOffsetPx);
  emitSectionIfChanged(Math.round((cursorSteps[step]?.quarters ?? 0) * TONE_PPQ));
}

/** Jumps to the start of the previous (-1) or next (+1) section. */
export function seekSection(direction: number): void {
  const current = sectionIndexAtTicks(Tone.Transport.ticks);
  if (current === null) return;

  const targetTicks = sectionStartTicks[current + (direction < 0 ? -1 : 1)];
  if (targetTicks === undefined) return; // already at the first or last section

  seekToTicks(targetTicks);
  emitSectionIfChanged(targetTicks);
}

export function initPlayback(
  osmd: OpenSheetMusicDisplay,
  externalTempoSchedule?: ExternalTempoChange[],
): void {
  osmdRef = osmd;
  disposePlayback();

  const { noteEvents, scoreBpm, tempoChanges: detectedChanges } = buildTimelines(osmd);

  osmdEl = document.getElementById('osmd');
  handleAEl = document.getElementById('loop-handle-a');
  handleBEl = document.getElementById('loop-handle-b');
  shadeEl = document.getElementById('loop-shade');
  sectionMarksEl = document.getElementById('section-marks');
  scoreWidth = osmdEl?.scrollWidth ?? 0;
  viewportWidth = window.innerWidth;

  // Re-center on orientation/viewport changes (autoResize is off). Attached once.
  if (!resizeListenerAttached) {
    window.addEventListener('resize', onViewportResize);
    resizeListenerAttached = true;
  }

  // Size the overlay elements to the rendered system.
  osmd.cursor.show();
  hideCursorEl();
  const cEl = cursorEl();
  let systemTop = 0;
  let systemH = 0;
  if (cEl) {
    systemTop = parseFloat(cEl.style.top || '0');
    const attrH = parseInt(cEl.getAttribute('height') ?? '0', 10);
    const idlH = (cEl as HTMLImageElement).height;
    const bcrH = Math.round(cEl.getBoundingClientRect().height);
    systemH = attrH || idlH || bcrH;
  }
  setOverlayBounds(systemTop, systemH);

  // Cache intrinsic geometry, then compute all viewport-dependent layout (vertical centering
  // + horizontal scroll bounds). recomputeViewportMetrics is reused on every resize.
  systemTopPx = systemTop;
  systemHeightPx = systemH;
  recomputeViewportMetrics();

  // Cursor is already shown above; reset to step 0 for debugging.
  osmd.cursor.reset();
  currentCursorStep = 0;

  // Snap score to the first note, centered.
  const px0 = cursorSteps[0]?.pxLeft ?? 0;
  const el = cursorEl();
  if (el) el.style.left = `${px0}px`;
  hideCursorEl();
  applyTranslate(scrollMaxPx);

  let initialBpm = scoreBpm;
  const scheduledChanges: TempoChange[] = [];
  if (externalTempoSchedule && externalTempoSchedule.length > 0) {
    for (const { quarterBeat, bpm } of externalTempoSchedule) {
      const ticks = Math.round(quarterBeat * TONE_PPQ);
      if (ticks === 0) {
        initialBpm = bpm;
      } else {
        scheduledChanges.push({ ticks, bpm });
      }
    }
  } else {
    scheduledChanges.push(...detectedChanges);
  }

  // Clear any events from a previous initPlayback before registering new ones.
  for (const id of tempoScheduleEventIds) Tone.Transport.clear(id);
  tempoScheduleEventIds = [];
  initialBpmValue = initialBpm;
  tempoChangeSchedule = scheduledChanges;

  // Use Transport.schedule so BPM changes fire at the correct tick on every play/replay,
  // independent of the gap between initPlayback and Transport.start (which would corrupt
  // absolute audio-context times computed by setValueAtTime at init time).
  Tone.Transport.bpm.value = initialBpm;
  for (const { ticks, bpm } of scheduledChanges) {
    const id = Tone.Transport.schedule((time) => {
      Tone.Transport.bpm.setValueAtTime(bpm, time);
    }, `${ticks}i`);
    tempoScheduleEventIds.push(id);
  }
  postToNative({ type: 'SCORE_BPM', payload: initialBpm });

  sampler = new Tone.Sampler({
    urls: PIANO_URLS,
    release: 1,
    baseUrl: SALAMANDER_BASE_URL,
  }).toDestination();

  const samplerRef = sampler;
  part = new Tone.Part<NoteEvent>(
    (time, event) => {
      try {
        const noteName = Tone.Frequency(event.midi, 'midi').toNote();
        const durSec = Math.max(0.05, (event.durQ * 60) / Tone.Transport.bpm.value);
        samplerRef.triggerAttackRelease(noteName, durSec, time);
      } catch {
        // ignore individual-note scheduling failures
      }
    },
    noteEvents,
  );
  part.start(0);

  initTouchHandlers();
  initLoopHandles();
  if (metronomeEnabled) startMetronome();
  applyHandColors(osmd);
}

export async function startPlayback(): Promise<void> {
  if (!sampler || !part) return;
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }

  // Read position before any BPM manipulation — setting bpm.value can cause Tone.js to
  // recompute the paused tick position via the clock integral, producing a stale value
  // on the second read and falsely triggering the loop-seek below.
  const posTicks = Tone.Transport.ticks;

  // Cancel any AudioParam BPM values left over from the previous playthrough
  // (they've already been applied and won't replay on Transport.start), then set the
  // BPM that matches the current transport position. Transport.schedule events will
  // fire the remaining changes at the right ticks as playback progresses.
  Tone.Transport.bpm.cancelScheduledValues(0);
  let bpmForPos = initialBpmValue;
  for (const { ticks, bpm } of tempoChangeSchedule) {
    if (ticks <= posTicks) bpmForPos = bpm;
    else break;
  }
  Tone.Transport.bpm.value = userBpmOverride ?? bpmForPos;

  // If a loop is active and was just created/edited (loopModified), or transport is
  // outside [aTicks, bTicks], seek to A before starting.
  let didLoopSeek = false;
  if (loopRegion) {
    if (loopModified || posTicks < loopRegion.aTicks || posTicks >= loopRegion.bTicks) {
      loopModified = false;
      didLoopSeek = true;
      seekToTicks(loopRegion.aTicks);
    }
  }

  // ─── Count-in eligibility ─────────────────────────────────────────────────
  // Count in only at a fresh start: the top of a piece/routine, or when a loop
  // (re)starts from its A handle. Resuming a mid-piece/mid-loop pause does not.
  const countIn = resolveCountIn(posTicks, didLoopSeek, Tone.Transport.bpm.value);

  try {
    await Tone.start();
    await Promise.race([Tone.loaded(), new Promise<void>((r) => setTimeout(r, 8000))]);
  } catch {
    // non-fatal
  }

  if (countIn && countIn.clicks.length > 0 && countIn.delaySec > 0) {
    // Sound the pre-roll on the raw audio clock, then defer the transport start
    // to sample-accurate audio time so the first note lands exactly on the beat.
    const ctx = Tone.getContext().rawContext as AudioContext;
    const startAt = ctx.currentTime + 0.12; // small lead so the first click isn't clipped
    countInNodes = countIn.clicks.map((c) => playClick(ctx, startAt + c.offsetSec, c.accented));
    countingIn = true;
    Tone.Transport.start(startAt + countIn.delaySec);
  } else {
    Tone.Transport.start();
  }
  animFrameId = requestAnimationFrame(animateCursorLoop);
  postToNative({ type: 'PLAYBACK_STATE', payload: 'playing' });
}

// Build the count-in schedule for this start, or null when it should not fire.
// `bpm` is the effective transport tempo (score BPM × any user override).
function resolveCountIn(
  posTicks: number,
  didLoopSeek: boolean,
  bpm: number,
): ReturnType<typeof computeCountIn> | null {
  if (countInMeasures <= 0 || bpm <= 0) return null;

  if (loopRegion) {
    if (!didLoopSeek) return null;
    const measure = measureAtTicks(loopRegion.aTicks);
    const { num, den } = measure;
    const beatUnitTicks = (TONE_PPQ * 4) / den;
    // A loop can start partway through a measure. Fold the beats from the
    // measure's downbeat up to the loop start into the last counted measure (like
    // an anacrusis) so the loop enters on its natural beat instead of after a full
    // measure that ends out of phase with the loop's bar grid.
    const beatOffset =
      beatUnitTicks > 0 ? (loopRegion.aTicks - measure.startTicks) / beatUnitTicks : 0;
    return computeCountIn({
      measures: countInMeasures,
      beatsPerMeasure: num,
      secPerBeat: (60 / bpm) * (4 / den),
      pickupBeats: loopLeadInBeats(beatOffset, num),
    });
  }

  // Piece/routine: only from the very top (not a resumed mid-piece pause).
  const firstStepTicks = Math.round((cursorSteps[0]?.quarters ?? 0) * TONE_PPQ);
  if (posTicks > firstStepTicks) return null;

  const first = measureMeta[0];
  const num = first?.num ?? 4;
  const den = first?.den ?? 4;
  const beatUnitTicks = (TONE_PPQ * 4) / den;

  // A pickup (implicit first measure) is part of the last counted measure, so the
  // audio starts early by the pickup's beat count.
  let pickupBeats = 0;
  if (first?.implicit && measureMeta.length > 1) {
    const pickupTicks = (measureMeta[1]?.startTicks ?? 0) - first.startTicks;
    if (pickupTicks > 0) pickupBeats = pickupTicks / beatUnitTicks;
  }

  return computeCountIn({
    measures: countInMeasures,
    beatsPerMeasure: num,
    secPerBeat: (60 / bpm) * (4 / den),
    pickupBeats,
  });
}

export function pausePlayback(): void {
  // A pause during the count-in aborts it before the piece begins; reset to the
  // start rather than freezing partway through the pre-roll.
  if (cancelCountIn()) {
    _stopInternal();
    postToNative({ type: 'PLAYBACK_STATE', payload: 'paused' });
    return;
  }
  Tone.Transport.pause();
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  postToNative({ type: 'PLAYBACK_STATE', payload: 'paused' });
}

export function stopPlayback(): void {
  _stopInternal();
  postToNative({ type: 'PLAYBACK_STATE', payload: 'stopped' });
}

export function setTempoBpm(bpm: number): void {
  const clamped = Math.max(20, Math.min(240, bpm));
  userBpmOverride = clamped;
  Tone.Transport.bpm.value = clamped;
}

export function disposePlayback(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }
  if (Tone.Transport.state !== 'stopped') Tone.Transport.stop();
  Tone.Transport.bpm.cancelScheduledValues(0);
  for (const id of tempoScheduleEventIds) Tone.Transport.clear(id);
  tempoScheduleEventIds = [];
  tempoChangeSchedule = [];
  initialBpmValue = 120;
  userBpmOverride = null;
  part?.dispose();
  part = null;
  sampler?.dispose();
  sampler = null;
  if (metronomeEventId !== null) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  // Count-in is a user setting, so countInMeasures is preserved across loads;
  // only the in-flight pre-roll and per-score meter data are cleared here.
  cancelCountIn();
  downbeatTicks = new Set();
  measureMeta = [];
  firstTicksBySourceIndex = [];
  sectionStartTicks = [];
  sectionColors = [];
  sectionInputIndices = [];
  currentSectionIndex = null;
  // Marks are score-pixel positioned: left in place they would sit at stale
  // coordinates over the next score, exactly like the loop handles below.
  if (sectionMarksEl) sectionMarksEl.textContent = '';
  cursorSteps = [];
  currentCursorStep = -1;
  osmdActualIdx = -1;
  totalQuarters = 0;
  loopRegion = null;
  endLoopUnfurl();
  // Without this a second __rn_load_xml would leave the handles painted at stale
  // score-pixel positions over the new score, with the toolbar still showing ×.
  hideLoopOverlay();
  loopModified = false;
  Tone.Transport.loop = false;
  scrollMinPx = 0;
  scrollMaxPx = 0;
  activeHand = 'both';
}

export function setActiveHand(hand: ActiveHand): void {
  activeHand = hand;
  if (!osmdRef || !sampler) return;

  // Capture position before stopPlayback resets it to 0.
  const savedTicks = Tone.Transport.ticks;
  const savedStep = currentCursorStep; // -1 if never played
  const savedScrollPx = scrollOffsetPx;

  if (Tone.Transport.state !== 'stopped') stopPlayback();

  // Rebuild note events with new hand filter.
  // buildTimelines resets the OSMD cursor to 0 and sets cursorSteps (same positions as before).
  const { noteEvents } = buildTimelines(osmdRef);

  // Replace Part only — keep sampler and tempo schedule intact.
  part?.dispose();
  const samplerRef = sampler;
  part = new Tone.Part<NoteEvent>(
    (time, event) => {
      try {
        const noteName = Tone.Frequency(event.midi, 'midi').toNote();
        const durSec = Math.max(0.05, (event.durQ * 60) / Tone.Transport.bpm.value);
        samplerRef.triggerAttackRelease(noteName, durSec, time);
      } catch {
        // ignore individual-note scheduling failures
      }
    },
    noteEvents,
  );
  part.start(0);

  applyHandColors(osmdRef);

  // Restore cursor to saved position instead of jumping to start.
  // buildTimelines leaves the OSMD cursor at 0 (reset) and osmdActualIdx is 0,
  // so advanceCursorTo can correctly advance forward to the saved step.
  const step = Math.max(0, Math.min(savedStep < 0 ? 0 : savedStep, cursorSteps.length - 1));
  Tone.Transport.ticks = savedTicks;
  advanceCursorTo(step);
  currentCursorStep = step;
  applyTranslate(savedScrollPx !== 0 ? savedScrollPx : scrollMaxPx);
}
