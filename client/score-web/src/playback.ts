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

function buildTimelines(osmd: OpenSheetMusicDisplay): {
  noteEvents: NoteEvent[];
  scoreBpm: number;
} {
  const noteEvents: NoteEvent[] = [];
  const steps: CursorStep[] = [];

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
    let fermataMaxNormalDurQ = 0;

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
        if (note.halfTone <= 0 || note.halfTone > 127) continue;
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
        noteEvents.push({ time: `${baseTicks}i`, midi: note.halfTone, durQ });
        if (hasFermata) {
          const extra = Math.round(normalDurQ * (FERMATA_DURATION_MULTIPLIER - 1) * TONE_PPQ);
          if (extra > fermataExtraTicks) {
            fermataExtraTicks = extra;
            fermataMaxNormalDurQ = normalDurQ;
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
              fermataMaxNormalDurQ = normalDurQ;
            }
          }
        });
      }
    } catch {
      // skip position if note extraction fails
    }

    if (fermataExtraTicks > 0) {
      // Insert a hold step so the cursor stays at the fermata note's pxLeft
      // during the extended hold. The hold ends when the next real note begins
      // (expandedQuarters + full fermata duration). This step shares osmdIdx
      // with the preceding regular step so advanceCursorTo makes no extra calls.
      const holdEndQ = expandedQuarters + fermataMaxNormalDurQ * FERMATA_DURATION_MULTIPLIER;
      steps.push({ quarters: holdEndQ - 1 / TONE_PPQ, pxLeft, osmdIdx });
      tickShift += fermataExtraTicks;
    }

    osmdIdx++;
    osmd.cursor.next();
  }

  totalQuarters = lastExpandedQuarters + 1;
  cursorSteps = steps;
  osmd.cursor.reset();

  return { noteEvents, scoreBpm };
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
    return;
  }

  // cursorSteps may contain extra hold steps (same osmdIdx as preceding step).
  // Use osmdIdx — not the step array index — to decide how many cursor.next()
  // calls to make, so hold steps don't accidentally advance the OSMD cursor.
  const targetIdx = cursorSteps[targetStep]?.osmdIdx ?? 0;
  const currentIdx = currentCursorStep < 0 ? -1 : (cursorSteps[currentCursorStep]?.osmdIdx ?? -1);

  if (currentIdx < 0) {
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    for (let i = 0; i < targetIdx; i++) osmdRef.cursor.next();
  } else if (targetIdx > currentIdx) {
    for (let i = 0; i < targetIdx - currentIdx; i++) osmdRef.cursor.next();
  } else if (targetIdx < currentIdx) {
    // Backward seek (loop wrap or stop → replay).
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    hideCursorEl();
    for (let i = 0; i < targetIdx; i++) osmdRef.cursor.next();
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

function pxToTicks(px: number): number {
  return Math.round((cursorSteps[nearestStepToPx(px)]?.quarters ?? 0) * TONE_PPQ);
}

// ─── RAF animation loop ───────────────────────────────────────────────────────

function animateCursorLoop(): void {
  if (Tone.Transport.state !== 'started') {
    animFrameId = null;
    return;
  }

  const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;

  // Binary search for the last cursor step whose beat position ≤ current transport ticks.
  let lo = 0, hi = cursorSteps.length - 1, targetStep = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.quarters <= quartersElapsed) { targetStep = mid; lo = mid + 1; }
    else hi = mid - 1;
  }

  // Advance OSMD iterator when step changes (keeps it in sync for note highlighting).
  if (targetStep !== currentCursorStep) {
    advanceCursorTo(targetStep);
  }

  // Interpolate position between current step and the next for smooth scrolling.
  // The interpolated px is used for BOTH the score translation AND the cursor element's
  // left position so they always align on the center line.
  const currPx = cursorSteps[targetStep]?.pxLeft ?? 0;
  const nextPx = cursorSteps[targetStep + 1]?.pxLeft ?? currPx;
  const currQ = cursorSteps[targetStep]?.quarters ?? 0;
  const nextQ = cursorSteps[targetStep + 1]?.quarters ?? (currQ + 1);
  const fraction = nextQ > currQ ? Math.min(1, (quartersElapsed - currQ) / (nextQ - currQ)) : 0;
  const interpolatedPx = currPx + fraction * (nextPx - currPx);

  // Move OSMD cursor element to interpolated position so it stays on the center line.
  const el = cursorEl();
  if (el) el.style.left = `${interpolatedPx}px`;

  applyTranslate(viewportWidth / 2 - interpolatedPx);

  if (quartersElapsed >= totalQuarters && totalQuarters > 0) {
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

  wrapper.addEventListener('touchstart', (e) => {
    if ((e.target as Element).closest('.loop-handle')) return;
    if (momentumFrameId !== null) {
      cancelAnimationFrame(momentumFrameId);
      momentumFrameId = null;
    }
    dragging = true;
    const clientX = e.touches[0]?.clientX ?? 0;
    startX = clientX;
    startOffset = scrollOffsetPx;
    velocityPx = 0;
    lastMoveTime = 0;
    lastMoveX = clientX;
    if (Tone.Transport.state === 'started') pausePlayback();
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const clientX = e.touches[0]?.clientX ?? 0;
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
    if (Math.abs(velocityPx) > 0.05) {
      startMomentum(velocityPx);
    } else {
      syncCursorToCenter();
    }
  }, { passive: true });
}

// ─── Loop handle dragging ─────────────────────────────────────────────────────

function autoScrollForDrag(clientX: number): void {
  const min = viewportWidth - scoreWidth;
  if (clientX < EDGE_ZONE) applyTranslate(Math.min(0, scrollOffsetPx + 8));
  else if (clientX > viewportWidth - EDGE_ZONE) applyTranslate(Math.max(min, scrollOffsetPx - 8));
}

function updateLoopOverlay(): void {
  if (!loopRegion) return;
  if (handleAEl) handleAEl.style.left = `${loopRegion.aPx}px`;
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

    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      startTouchX = e.touches[0]?.clientX ?? 0;
      startPx = which === 'a' ? (loopRegion?.aPx ?? 0) : (loopRegion?.bPx ?? 0);
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!loopRegion) return;
      const dx = (e.touches[0]?.clientX ?? 0) - startTouchX;
      let newPx = startPx + dx;

      if (which === 'a') {
        newPx = Math.max(0, Math.min(loopRegion.bPx - LOOP_MIN_GAP_PX, newPx));
        loopRegion.aPx = newPx;
        loopRegion.aTicks = pxToTicks(newPx);
        Tone.Transport.loopStart = `${loopRegion.aTicks}i`;
      } else {
        newPx = Math.max(loopRegion.aPx + LOOP_MIN_GAP_PX, Math.min(scoreWidth, newPx));
        loopRegion.bPx = newPx;
        loopRegion.bTicks = pxToTicks(newPx);
        Tone.Transport.loopEnd = `${loopRegion.bTicks}i`;
      }

      updateLoopOverlay();
      autoScrollForDrag(e.touches[0]?.clientX ?? 0);
    }, { passive: false });
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
  const step = cursorSteps[currentCursorStep < 0 ? 0 : currentCursorStep];
  if (!step) return;
  const aPx = step.pxLeft;
  const bPx = Math.min(aPx + LOOP_DEFAULT_PX, scoreWidth);
  const aTicks = pxToTicks(aPx);
  const bTicks = pxToTicks(bPx);
  loopRegion = { aPx, bPx, aTicks, bTicks };
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = `${aTicks}i`;
  Tone.Transport.loopEnd = `${bTicks}i`;
  if (handleAEl) handleAEl.style.display = 'block';
  if (handleBEl) handleBEl.style.display = 'block';
  if (shadeEl) shadeEl.style.display = 'block';
  updateLoopOverlay();
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

export function initPlayback(osmd: OpenSheetMusicDisplay): void {
  osmdRef = osmd;
  disposePlayback();

  const { noteEvents, scoreBpm } = buildTimelines(osmd);

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

  Tone.Transport.bpm.value = scoreBpm;
  postToNative({ type: 'SCORE_BPM', payload: scoreBpm });

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
}

export async function startPlayback(): Promise<void> {
  if (!sampler || !part) return;
  if (momentumFrameId !== null) {
    cancelAnimationFrame(momentumFrameId);
    momentumFrameId = null;
  }

  // If a loop is active and transport is outside [aTicks, bTicks], seek to A.
  if (loopRegion) {
    const ticks = Tone.Transport.ticks;
    if (ticks < loopRegion.aTicks || ticks >= loopRegion.bTicks) {
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
  totalQuarters = 0;
  loopRegion = null;
  Tone.Transport.loop = false;
  scrollMinPx = 0;
  scrollMaxPx = 0;
}
