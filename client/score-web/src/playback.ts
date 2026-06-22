import * as Tone from 'tone';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { ArpeggioType, ArticulationEnum } from 'opensheetmusicdisplay';
import type { OutboundMessage } from './types';

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

const LOOP_MIN_GAP_PX = 40;
const LOOP_DEFAULT_PX = 200;
const HANDLE_WIDTH = 28;
const EDGE_ZONE = 60;
// Momentum scroll: fraction of velocity retained per 16 ms frame (increase toward 1 for longer glide).
const MOMENTUM_DECELERATION = 0.95;
// Fermata notes are held 1.75× their written duration.
const FERMATA_DURATION_MULTIPLIER = 1.75;
// Ticks between successive notes in an arpeggio roll (~15 ms at 120 BPM with PPQ=192).
const ARPEGGIO_STEP_TICKS = 6;

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
let cursorSteps: CursorStep[] = [];
let currentCursorStep = -1;
let totalQuarters = 0;
let animFrameId: number | null = null;
let osmdRef: OpenSheetMusicDisplay | null = null;

let osmdEl: HTMLElement | null = null;
let handleAEl: HTMLElement | null = null;
let handleBEl: HTMLElement | null = null;
let shadeEl: HTMLElement | null = null;
let scrollOffsetPx = 0;
let scoreWidth = 0;
let viewportWidth = 0;
let scrollMinPx = 0; // translateX that puts the last note at center
let scrollMaxPx = 0; // translateX that puts the first note at center
let momentumFrameId: number | null = null;
let touchHandlersAttached = false;
let loopRegion: LoopRegion | null = null;
// Tempo change schedule — kept for BPM lookup at arbitrary seek positions.
let tempoScheduleEventIds: number[] = [];
let tempoChangeSchedule: TempoChange[] = [];
let initialBpmValue = 120;
// Set when a loop is created or its handles are moved; cleared on next startPlayback
// so that play always jumps to loop A after a create/edit.
let loopModified = false;
// Tracks the actual OSMD cursor position (in terms of osmdIdx). Separate from
// currentCursorStep so backward seeks can be deferred without losing visual sync.
// Tracks actual OSMD cursor position (osmdIdx). Updated only in advanceCursorTo
// (called from startPlayback/stop, never from the RAF hot path).
let osmdActualIdx = -1;

// ─── Fingering state ──────────────────────────────────────────────────────────

let fingeringMap: Record<string, number> = {};
let rawXml = '';
let pendingNoteKey: string | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressDidFire = false;
let overlayJustOpened = false;
let fingeringOverlayEl: HTMLElement | null = null;
let osmdTopOffset = 0;
let debugDots: HTMLElement[] = [];

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

  while (!osmd.cursor.Iterator.EndReached) {
    const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
    const expandedQuarters = quarters + tickShift / TONE_PPQ;
    lastExpandedQuarters = expandedQuarters;

    const measure = osmd.cursor.Iterator.CurrentMeasure as unknown;
    if (measure !== lastMeasure) {
      lastMeasure = measure;
      downbeatTicks.add(Math.round(expandedQuarters * TONE_PPQ));
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
    animFrameId = null;
    return;
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
}

// ─── Touch: manual score pan ──────────────────────────────────────────────────

function syncCursorToCenter(): void {
  const centerInScore = viewportWidth / 2 - scrollOffsetPx;
  const step = nearestStepToPx(centerInScore);
  currentCursorStep = step;
  Tone.Transport.ticks = Math.round((cursorSteps[step]?.quarters ?? 0) * TONE_PPQ);
  const el = cursorEl();
  if (el) el.style.left = `${cursorSteps[step]?.pxLeft ?? 0}px`;
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
    if (clamped !== next) {
      momentumFrameId = null;
      syncCursorToCenter();
      return;
    }
    momentumFrameId = requestAnimationFrame(step);
  }

  momentumFrameId = requestAnimationFrame(step);
}

// ─── Fingering editing ────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function reduceFraction(ticks: number, wholeTicks: number): { num: number; den: number } {
  if (ticks === 0) return { num: 0, den: 1 };
  const g = gcd(ticks, wholeTicks);
  return { num: ticks / g, den: wholeTicks / g };
}

function pitchToHalfTone(step: string, octave: number, alter: number): number {
  const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return octave * 12 + (BASE[step] ?? 0) + Math.round(alter);
}

// Extract all <fingering> elements from MusicXML into the same key format used by noteAtPoint.
// Used on first load (before any SQLite entry exists) so imported fingerings are tracked.
function extractFingeringsFromXml(xml: string): Record<string, number> {
  const map: Record<string, number> = {};
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const parts = Array.from(doc.querySelectorAll('part'));
  const partRanges: { el: Element; startIdx: number; numStaves: number }[] = [];
  let staffCursor = 0;
  for (const partEl of parts) {
    const stavesEl = partEl.querySelector('attributes staves');
    const numStaves = stavesEl ? parseInt(stavesEl.textContent ?? '1', 10) : 1;
    partRanges.push({ el: partEl, startIdx: staffCursor, numStaves });
    staffCursor += numStaves;
  }
  for (const { el: partEl, startIdx, numStaves } of partRanges) {
    for (const measureEl of Array.from(partEl.querySelectorAll('measure'))) {
      const measureNumber = parseInt(measureEl.getAttribute('number') ?? '0', 10);
      if (!measureNumber) continue;
      let divisions = 1;
      for (const divEl of Array.from(partEl.querySelectorAll('measure attributes divisions'))) {
        const mEl = divEl.closest('measure');
        const mNum = mEl ? parseInt(mEl.getAttribute('number') ?? '0', 10) : 0;
        if (mNum <= measureNumber) divisions = parseInt(divEl.textContent ?? '1', 10);
      }
      const wholeTicks = 4 * divisions;
      let cumPos = 0;
      let currentBeatPos = 0;
      for (const child of Array.from(measureEl.children)) {
        const tag = child.tagName.toLowerCase();
        // <backup> rewinds the time cursor (used between treble and bass voices)
        if (tag === 'backup') {
          const durEl = child.querySelector('duration');
          if (durEl) cumPos -= parseInt(durEl.textContent ?? '0', 10);
          continue;
        }
        if (tag === 'forward') {
          const durEl = child.querySelector('duration');
          if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
          continue;
        }
        if (tag !== 'note') continue;
        const noteEl = child;
        const isChord = !!noteEl.querySelector('chord');
        if (!isChord) currentBeatPos = cumPos;
        const fingerEl = noteEl.querySelector('notations > technical > fingering');
        if (fingerEl) {
          const finger = parseInt(fingerEl.textContent?.trim() ?? '0', 10);
          if (finger >= 1 && finger <= 5) {
            const stepEl = noteEl.querySelector('pitch > step');
            const octaveEl = noteEl.querySelector('pitch > octave');
            const alterEl = noteEl.querySelector('pitch > alter');
            if (stepEl && octaveEl) {
              const halfTone = pitchToHalfTone(
                stepEl.textContent?.trim() ?? 'C',
                parseInt(octaveEl.textContent ?? '0', 10),
                alterEl ? parseFloat(alterEl.textContent ?? '0') : 0,
              );
              let localStaff = 1;
              if (numStaves > 1) {
                const staffEl = noteEl.querySelector('staff');
                localStaff = staffEl ? parseInt(staffEl.textContent ?? '1', 10) : 1;
              }
              const globalStaffIdx = startIdx + localStaff - 1;
              const { num, den } = reduceFraction(currentBeatPos, wholeTicks);
              map[`${measureNumber}:${globalStaffIdx}:${halfTone}:${num}/${den}`] = finger;
            }
          }
        }
        if (!isChord) {
          const durEl = noteEl.querySelector('duration');
          if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
        }
      }
    }
  }
  return map;
}

// If a SQLite-stored map exists, use it (it's canonical — covers imported + user edits).
// Otherwise extract fingerings from the raw XML so imported fingerings appear in the overlay
// and are subject to the same strip-then-apply logic as user-added ones.
export function setFingeringData(xml: string, storedMap: Record<string, number>): Record<string, number> {
  rawXml = xml;
  fingeringMap = Object.keys(storedMap).length > 0
    ? { ...storedMap }
    : extractFingeringsFromXml(xml);
  return fingeringMap;
}

function isNoteGreyed(staffIdx: number): boolean {
  return (activeHand === 'right' && staffIdx === 1) || (activeHand === 'left' && staffIdx === 0);
}

function noteAtPoint(
  touchX: number,
  touchY: number,
): { key: string; staffIdx: number } | null {
  if (!osmdRef) return null;
  // unitInPixels=10 is the module-level constant in OSMD's SVG backend.
  // EngravingRules.SamplingUnit is 3*unit=3, used only for sky-bottom line
  // rasterisation — NOT for screen coordinate conversion.
  const UIP = 10;

  let bestKey: string | null = null;
  let bestStaffIdx = 0;
  let bestDist = Infinity;

  for (const [mIdx, measureRow] of osmdRef.GraphicSheet.MeasureList.entries()) {
    for (const [sIdx, measure] of measureRow.entries()) {
      if (!measure) continue;
      const measureNumber: number =
        (measure as unknown as { MeasureNumber?: number }).MeasureNumber ?? mIdx + 1;
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            const src = note.sourceNote;
            if (!src || src.isRest() || src.IsGraceNote) continue;
            const pos = note.PositionAndShape.AbsolutePosition;
            const screenX = pos.x * UIP + scrollOffsetPx;
            const screenY = pos.y * UIP + osmdTopOffset;
            const dist = Math.hypot(touchX - screenX, touchY - screenY);
            if (dist < bestDist) {
              bestDist = dist;
              bestStaffIdx = sIdx;
              const halfTone = src.halfTone;
              // Include beat position so repeated pitches in the same measure get distinct keys.
              // VoiceEntry.Timestamp is a Fraction (Numerator/Denominator) of a whole note
              // from the start of the measure.
              const ve = src.ParentVoiceEntry as unknown as {
                Timestamp: { Numerator: number; Denominator: number };
              };
              const ts = ve.Timestamp;
              bestKey = `${measureNumber}:${sIdx}:${halfTone}:${ts.Numerator}/${ts.Denominator}`;
            }
          }
        }
      }
    }
  }

  return bestDist < 80 && bestKey !== null ? { key: bestKey, staffIdx: bestStaffIdx } : null;
}

function showFingeringSelector(noteKey: string, screenX: number, screenY: number): void {
  if (!fingeringOverlayEl) return;
  pendingNoteKey = noteKey;

  // Highlight the currently-assigned finger (or ✕ if none).
  const currentFinger = fingeringMap[noteKey];
  for (const btn of Array.from(fingeringOverlayEl.querySelectorAll('.fing-btn'))) {
    const btnFinger = parseInt((btn as HTMLElement).dataset['finger'] ?? '-1', 10);
    const selected = currentFinger !== undefined ? btnFinger === currentFinger : btnFinger === 0;
    (btn as HTMLElement).style.background = selected ? '#b0b0b0' : '#f0f0f0';
  }

  overlayJustOpened = true;
  fingeringOverlayEl.style.display = 'flex';
  // Position: center the overlay horizontally on the tap, above it
  const overlayW = fingeringOverlayEl.offsetWidth || 320;
  const overlayH = fingeringOverlayEl.offsetHeight || 60;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = screenX - overlayW / 2;
  let top = screenY - overlayH - 12;
  left = Math.max(8, Math.min(left, vw - overlayW - 8));
  top = Math.max(8, Math.min(top, vh - overlayH - 8));
  fingeringOverlayEl.style.left = `${left}px`;
  fingeringOverlayEl.style.top = `${top}px`;
}

function hideFingeringSelector(): void {
  if (!fingeringOverlayEl) return;
  fingeringOverlayEl.style.display = 'none';
  pendingNoteKey = null;
}

export function buildFingeringXml(baseXml: string, map: Record<string, number>): string {
  const doc = new DOMParser().parseFromString(baseXml, 'text/xml');

  // OSMD halfTone 0 = C0, 12 = C1 … 48 = C4.  MusicXML <octave> equals floor(ht/12).
  function halfToneToPitch(ht: number): { step: string; octave: number; alter: number } {
    const STEPS =  ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const ALTERS = [  0,   1,   0,   1,   0,   0,   1,   0,   1,   0,   1,   0];
    const mod = ((ht % 12) + 12) % 12;
    return { step: STEPS[mod]!, octave: Math.floor(ht / 12), alter: ALTERS[mod]! };
  }

  // Build a part→staff-range map so we can convert OSMD's global 0-based staffIdx
  // to the per-part 1-based <staff> value used in MusicXML.
  // Some scores use one <part> per instrument staff (2-part piano); others put both
  // piano staves in one <part> (1-part piano with staves=2). We handle both.
  const parts = Array.from(doc.querySelectorAll('part'));
  const partRanges: { el: Element; startIdx: number; numStaves: number }[] = [];
  let staffCursor = 0;
  for (const partEl of parts) {
    const stavesEl = partEl.querySelector('attributes staves');
    const numStaves = stavesEl ? parseInt(stavesEl.textContent ?? '1', 10) : 1;
    partRanges.push({ el: partEl, startIdx: staffCursor, numStaves });
    staffCursor += numStaves;
  }

  function applyFingeringToNote(noteEl: Element, finger: number): void {
    let notationsEl = noteEl.querySelector('notations');
    if (!notationsEl) {
      notationsEl = doc.createElement('notations');
      noteEl.appendChild(notationsEl);
    }
    let technicalEl = notationsEl.querySelector('technical');
    if (!technicalEl) {
      technicalEl = doc.createElement('technical');
      notationsEl.appendChild(technicalEl);
    }
    const fingerEl = doc.createElement('fingering');
    fingerEl.textContent = String(finger);
    technicalEl.appendChild(fingerEl);
  }

  // Strip all existing fingerings — fingeringMap is the sole source of truth.
  // This ensures "remove" (✕) actually removes imported fingerings, not just user-added ones.
  for (const el of Array.from(doc.querySelectorAll('fingering'))) {
    el.parentElement?.removeChild(el);
  }

  for (const [key, finger] of Object.entries(map)) {
    const [measureStr, staffStr, halfToneStr, timestampStr] = key.split(':');
    const measureNumber = parseInt(measureStr!, 10);
    const globalStaffIdx = parseInt(staffStr!, 10); // OSMD 0-based global index
    const halfTone = parseInt(halfToneStr!, 10);
    const { step, octave, alter } = halfToneToPitch(halfTone);

    // Find which part owns this global staff index and what the local staff number is.
    const partInfo = partRanges.find(
      (p) => globalStaffIdx >= p.startIdx && globalStaffIdx < p.startIdx + p.numStaves,
    );
    if (!partInfo) continue;
    const localStaff = globalStaffIdx - partInfo.startIdx + 1; // 1-based within the part

    const measureEl = partInfo.el.querySelector(`measure[number="${measureNumber}"]`);
    if (!measureEl) continue;

    // Resolve <divisions> (ticks per quarter note) at the time of this measure.
    // It can change mid-piece; take the last value at or before measureNumber.
    let divisions = 1;
    for (const divEl of Array.from(partInfo.el.querySelectorAll('measure attributes divisions'))) {
      const mEl = divEl.closest('measure');
      const mNum = mEl ? parseInt(mEl.getAttribute('number') ?? '0', 10) : 0;
      if (mNum <= measureNumber) divisions = parseInt(divEl.textContent ?? '1', 10);
    }

    // Convert OSMD VoiceEntry.Timestamp (fraction of a whole note) to MusicXML ticks.
    // Timestamp N/D means N/D whole notes into the measure; 1 whole note = 4*divisions ticks.
    let targetTicks: number | null = null;
    if (timestampStr) {
      const slashIdx = timestampStr.indexOf('/');
      const tsNum = parseInt(timestampStr.slice(0, slashIdx), 10);
      const tsDen = parseInt(timestampStr.slice(slashIdx + 1), 10);
      targetTicks = Math.round((tsNum / tsDen) * 4 * divisions);
    }

    // Iterate measure children in order, tracking cumulative tick position.
    // <backup> rewinds cumPos (between treble and bass voices); <forward> advances it.
    // Chord notes share the position of the preceding non-chord note.
    let cumPos = 0;
    let currentBeatPos = 0;
    let applied = false;
    for (const child of Array.from(measureEl.children)) {
      if (applied) break;
      const tag = child.tagName.toLowerCase();
      if (tag === 'backup') {
        const durEl = child.querySelector('duration');
        if (durEl) cumPos -= parseInt(durEl.textContent ?? '0', 10);
        continue;
      }
      if (tag === 'forward') {
        const durEl = child.querySelector('duration');
        if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
        continue;
      }
      if (tag !== 'note') continue;
      const noteEl = child;
      const isChord = !!noteEl.querySelector('chord');
      if (!isChord) currentBeatPos = cumPos;
      const notePos = currentBeatPos;

      const isTiedContinuation =
        !!noteEl.querySelector('tie[type="stop"]') && !noteEl.querySelector('tie[type="start"]');

      if (!isTiedContinuation && (targetTicks === null || notePos === targetTicks)) {
        const stepEl = noteEl.querySelector('pitch > step');
        const octaveEl = noteEl.querySelector('pitch > octave');
        const alterEl = noteEl.querySelector('pitch > alter');
        if (stepEl && octaveEl && stepEl.textContent?.trim() === step &&
            parseInt(octaveEl.textContent ?? '0', 10) === octave) {
          const noteAlter = alterEl ? parseFloat(alterEl.textContent ?? '0') : 0;
          if (noteAlter === alter) {
            // In multi-staff parts, verify the local staff number matches.
            let staffOk = true;
            if (partInfo.numStaves > 1) {
              const staffEl = noteEl.querySelector('staff');
              staffOk = (staffEl ? parseInt(staffEl.textContent ?? '1', 10) : 1) === localStaff;
            }
            if (staffOk) {
              applyFingeringToNote(noteEl, finger);
              applied = true;
            }
          }
        }
      }

      if (!isChord) {
        const durEl = noteEl.querySelector('duration');
        if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

async function applyFingering(noteKey: string, finger: number | null): Promise<void> {
  if (!osmdRef || !sampler) return;

  const savedTicks = Tone.Transport.ticks;
  const savedStep = currentCursorStep;
  const savedScroll = scrollOffsetPx;

  if (finger !== null) {
    fingeringMap[noteKey] = finger;
  } else {
    delete fingeringMap[noteKey];
  }

  const newXml = buildFingeringXml(rawXml, fingeringMap);

  await osmdRef.load(newXml);
  osmdRef.render();

  const svgEl = osmdEl?.querySelector('svg');
  if (osmdEl) osmdEl.style.width = `${svgEl?.scrollWidth ?? osmdEl.scrollWidth}px`;

  // Rebuild timelines + replace Part (mirrors setActiveHand pattern)
  const { noteEvents } = buildTimelines(osmdRef);
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

  const step = Math.max(0, Math.min(savedStep < 0 ? 0 : savedStep, cursorSteps.length - 1));
  Tone.Transport.ticks = savedTicks;
  advanceCursorTo(step);
  currentCursorStep = step;
  applyTranslate(savedScroll !== 0 ? savedScroll : scrollMaxPx);

  postToNative({ type: 'FINGERING_CHANGED', payload: { ...fingeringMap } });
}

export function debugFingeringAreas(show: boolean): void {
  for (const dot of debugDots) dot.remove();
  debugDots = [];
  if (!show || !osmdRef) return;
  const UIP = 10;
  let count = 0;
  for (const [, measureRow] of osmdRef.GraphicSheet.MeasureList.entries()) {
    for (const [sIdx, measure] of measureRow.entries()) {
      if (!measure) continue;
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            const src = note.sourceNote;
            if (!src || src.isRest() || src.IsGraceNote) continue;
            const pos = note.PositionAndShape.AbsolutePosition;
            const sx = pos.x * UIP + scrollOffsetPx;
            const sy = pos.y * UIP + osmdTopOffset;
            const greyed = isNoteGreyed(sIdx);
            const dot = document.createElement('div');
            dot.style.cssText =
              `position:fixed;z-index:200;width:18px;height:18px;border-radius:9px;` +
              `pointer-events:none;transform:translate(-50%,-50%);` +
              `background:${greyed ? 'rgba(0,0,255,0.55)' : 'rgba(255,0,0,0.55)'};` +
              `left:${sx}px;top:${sy}px;`;
            document.body.appendChild(dot);
            debugDots.push(dot);
            count++;
          }
        }
      }
    }
  }
  postToNative({ type: 'DEBUG', payload: `debug: ${count} hit areas drawn (red=active, blue=greyed)` });
}

function initFingeringOverlay(): void {
  fingeringOverlayEl = document.getElementById('fingering-overlay');
  if (!fingeringOverlayEl) return;
  fingeringOverlayEl.addEventListener(
    'touchstart',
    (e) => {
      e.stopPropagation();
      const btn = (e.target as Element).closest('[data-finger]') as HTMLElement | null;
      if (!btn || !pendingNoteKey) return;
      const finger = parseInt(btn.dataset['finger'] ?? '0', 10);
      const noteKey = pendingNoteKey;
      hideFingeringSelector();
      void applyFingering(noteKey, finger === 0 ? null : finger);
    },
    { passive: true },
  );
}

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
    const clientY = e.touches[0]?.clientY ?? 0;
    startX = clientX;
    startOffset = scrollOffsetPx;
    velocityPx = 0;
    lastMoveTime = 0;
    lastMoveX = clientX;
    // Long-press for fingering — only when paused and overlay is not already showing
    longPressDidFire = false;
    overlayJustOpened = false;
    if (Tone.Transport.state !== 'started' && fingeringOverlayEl?.style.display === 'none') {
      const lpX = clientX;
      const lpY = clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressDidFire = true; // fired regardless of whether a note was found
        if (hasMoved) return;
        const hit = noteAtPoint(lpX, lpY);
        if (hit && !isNoteGreyed(hit.staffIdx)) showFingeringSelector(hit.key, lpX, lpY);
      }, 500);
    }
    // Don't pause immediately — wait to see if this is a tap or a drag.
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    if (fingeringOverlayEl?.style.display !== 'none') return;
    const now = performance.now();
    const clientX = e.touches[0]?.clientX ?? 0;
    // First significant movement: mark as drag and cancel long-press timer.
    if (!hasMoved && Math.abs(clientX - startX) > 8) {
      hasMoved = true;
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
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
  }, { passive: true });

  wrapper.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!hasMoved) {
      // The finger-up that opened the overlay: keep it open, don't dismiss.
      if (overlayJustOpened) {
        overlayJustOpened = false;
        return;
      }
      // Dismiss fingering overlay on outside tap before toggling play/pause.
      if (fingeringOverlayEl && fingeringOverlayEl.style.display !== 'none') {
        hideFingeringSelector();
        return;
      }
      // If the long-press timer fired (even if no note was found), treat this
      // as an intentional hold rather than a tap — don't toggle play/pause.
      if (longPressDidFire) return;
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


function updateLoopOverlay(): void {
  if (!loopRegion) return;
  // Handle A sits to the left of aPx (inner/right edge at aPx).
  if (handleAEl) handleAEl.style.left = `${loopRegion.aPx - HANDLE_WIDTH}px`;
  if (handleBEl) handleBEl.style.left = `${loopRegion.bPx}px`;
  if (shadeEl) {
    shadeEl.style.left = `${loopRegion.aPx}px`;
    shadeEl.style.width = `${loopRegion.bPx - loopRegion.aPx}px`;
  }
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
  for (const el of [handleAEl, handleBEl, shadeEl]) {
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
  // Anchor B at cursor + default width, clamped to the last note. Then derive A
  // so the loop is always LOOP_DEFAULT_PX wide (unless the score itself is shorter).
  const bPx = Math.min(step.pxLeft + LOOP_DEFAULT_PX, scorePxMax);
  const aPx = Math.max(scorePxMin, bPx - LOOP_DEFAULT_PX);
  const aTicks = pxToLoopStartTicks(aPx);
  const bTicks = pxToLoopEndTicks(bPx);
  loopRegion = { aPx, bPx, aTicks, bTicks };
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = `${aTicks}i`;
  Tone.Transport.loopEnd = `${bTicks}i`;
  if (handleAEl) handleAEl.style.display = 'flex';
  if (handleBEl) handleBEl.style.display = 'flex';
  if (shadeEl) shadeEl.style.display = 'block';
  updateLoopOverlay();
  loopModified = true;
  postToNative({ type: 'LOOP_STATE', payload: true });
  if (Tone.Transport.state === 'started') pausePlayback();
}

function clearLoop(): void {
  loopRegion = null;
  Tone.Transport.loop = false;
  if (handleAEl) handleAEl.style.display = 'none';
  if (handleBEl) handleBEl.style.display = 'none';
  if (shadeEl) shadeEl.style.display = 'none';
  postToNative({ type: 'LOOP_STATE', payload: false });
  if (Tone.Transport.state === 'started') pausePlayback();
}

export function toggleLoop(): void {
  if (loopRegion) clearLoop();
  else createLoop();
}

// ─── Metronome ────────────────────────────────────────────────────────────────

function startMetronome(): void {
  if (metronomeEventId !== null) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
    const ctx = Tone.getContext().rawContext as AudioContext;

    // downbeatTicks was built from OSMD measure boundaries — correct for any
    // time signature and handles mid-score signature changes.
    const ticks = Tone.Transport.getTicksAtTime(time);
    const nearestBeat = Math.round(ticks / TONE_PPQ) * TONE_PPQ;
    const isDownbeat = downbeatTicks.has(nearestBeat);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isDownbeat ? 1500 : 1000;
    gainNode.gain.setValueAtTime(isDownbeat ? 0.45 : 0.2, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }, '4n', 0);
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

// ─── Public API ───────────────────────────────────────────────────────────────

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
  scoreWidth = osmdEl?.scrollWidth ?? 0;
  viewportWidth = window.innerWidth;

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

  // Center the staff system vertically in the viewport.
  const viewportHeight = window.innerHeight;
  const centeredTop = Math.round((viewportHeight - systemH) / 2);
  if (osmdEl) osmdEl.style.top = `${centeredTop - systemTop}px`;
  osmdTopOffset = centeredTop - systemTop;

  // Cursor is already shown above; reset to step 0 for debugging.
  osmd.cursor.reset();
  currentCursorStep = 0;

  // Clamp bounds: first note centered at max, last note centered at min.
  const px0 = cursorSteps[0]?.pxLeft ?? 0;
  const pxLast = cursorSteps[cursorSteps.length - 1]?.pxLeft ?? scoreWidth;
  scrollMaxPx = viewportWidth / 2 - px0;
  scrollMinPx = viewportWidth / 2 - pxLast;

  // Snap score to position 0 at center.
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
  initFingeringOverlay();
}

export async function startPlayback(): Promise<void> {
  if (!sampler || !part) return;
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }

  // Before each play, cancel any AudioParam BPM values left over from the previous
  // playthrough (they've already been applied and won't replay on Transport.start),
  // then set the BPM that matches the current transport position so the correct tempo
  // is audible from the first note. Transport.schedule events will fire the remaining
  // changes at the right ticks as playback progresses.
  Tone.Transport.bpm.cancelScheduledValues(0);
  const posTicks = Tone.Transport.ticks;
  let bpmForPos = initialBpmValue;
  for (const { ticks, bpm } of tempoChangeSchedule) {
    if (ticks <= posTicks) bpmForPos = bpm;
    else break;
  }
  Tone.Transport.bpm.value = bpmForPos;

  // If a loop is active and was just created/edited (loopModified), or transport is
  // outside [aTicks, bTicks], seek to A before starting.
  if (loopRegion) {
    const ticks = Tone.Transport.ticks;
    if (loopModified || ticks < loopRegion.aTicks || ticks >= loopRegion.bTicks) {
      loopModified = false;
      Tone.Transport.ticks = loopRegion.aTicks;
      const targetStep = ticksToStep(loopRegion.aTicks);
      advanceCursorTo(targetStep);
      const px = cursorSteps[targetStep]?.pxLeft ?? 0;
      const el = cursorEl();
      if (el) el.style.left = `${px}px`;
      applyTranslate(viewportWidth / 2 - px);
    }
  }

  try {
    await Tone.start();
    await Promise.race([Tone.loaded(), new Promise<void>((r) => setTimeout(r, 8000))]);
  } catch {
    // non-fatal
  }
  Tone.Transport.start();
  animFrameId = requestAnimationFrame(animateCursorLoop);
  postToNative({ type: 'PLAYBACK_STATE', payload: 'playing' });
}

export function pausePlayback(): void {
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
  Tone.Transport.bpm.value = Math.max(20, Math.min(240, bpm));
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
  part?.dispose();
  part = null;
  sampler?.dispose();
  sampler = null;
  if (metronomeEventId !== null) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  downbeatTicks = new Set();
  cursorSteps = [];
  currentCursorStep = -1;
  osmdActualIdx = -1;
  totalQuarters = 0;
  loopRegion = null;
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
