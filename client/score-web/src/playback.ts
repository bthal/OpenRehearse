import * as Tone from 'tone';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { OutboundMessage } from './types';

// Matches Tone.js default PPQ; must stay in sync with Tone.Transport.PPQ.
const TONE_PPQ = 192;

// Minimal Salamander Grand Piano sample set. Tone.Sampler pitch-shifts between
// adjacent samples so the full piano range sounds convincing. Files live at the
// Tone.js team's CDN; on first load the browser fetches and caches them — all
// subsequent offline plays use the WebView HTTP cache.
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

interface NoteEvent {
  time: string; // e.g. "384i" — tick-based, tempo-relative
  midi: number;
  durQ: number; // duration in quarter notes; converted to seconds at fire time
}

interface CursorStep {
  quarters: number; // beat position from start (quarter notes)
}

function postToNative(msg: OutboundMessage): void {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

let sampler: Tone.Sampler | null = null;
let part: Tone.Part<NoteEvent> | null = null;
let cursorSteps: CursorStep[] = [];
let currentCursorStep = -1;
let totalQuarters = 0;
let animFrameId: number | null = null;
let osmdRef: OpenSheetMusicDisplay | null = null;

function buildTimelines(osmd: OpenSheetMusicDisplay): {
  noteEvents: NoteEvent[];
  steps: CursorStep[];
  scoreBpm: number;
} {
  const noteEvents: NoteEvent[] = [];
  const steps: CursorStep[] = [];

  osmd.cursor.reset();

  // Read the score's indicated tempo before iterating (iterator is at the start).
  const rawBpm = osmd.cursor.Iterator.CurrentBpm;
  const scoreBpm = rawBpm > 0 && rawBpm < 400 ? rawBpm : 120;

  // OSMD Fraction.RealValue uses whole notes as its base unit (1.0 = one whole note).
  // Tone.js PPQ uses quarter notes. Multiply by 4 to convert.
  const WHOLE_TO_QUARTER = 4;

  let lastQuarters = 0;

  while (!osmd.cursor.Iterator.EndReached) {
    const quarters = osmd.cursor.Iterator.currentTimeStamp.RealValue * WHOLE_TO_QUARTER;
    lastQuarters = quarters;
    steps.push({ quarters });

    try {
      const notes = osmd.cursor.NotesUnderCursor();
      for (const note of notes) {
        if (note.isRest() || note.IsGraceNote) continue;
        const midi = note.halfTone;
        if (midi <= 0 || midi > 127) continue;
        const durQ = note.Length.RealValue * WHOLE_TO_QUARTER;
        if (durQ <= 0) continue;
        noteEvents.push({
          time: `${Math.round(quarters * TONE_PPQ)}i`,
          midi,
          durQ,
        });
      }
    } catch {
      // skip position if note extraction fails
    }

    osmd.cursor.next();
  }

  // +1 quarter buffer so end-detection fires cleanly after the final note
  totalQuarters = lastQuarters + 1;
  osmd.cursor.reset(); // leave at position 0; initPlayback will show it

  return { noteEvents, steps, scoreBpm };
}

function cursorEl(): HTMLImageElement | undefined {
  return (osmdRef?.cursor as unknown as { cursorElement?: HTMLImageElement } | undefined)
    ?.cursorElement;
}

function setCursorStep(targetStep: number): void {
  if (!osmdRef || targetStep === currentCursorStep) return;

  const el = cursorEl();

  if (targetStep < 0) {
    osmdRef.cursor.reset();
    osmdRef.cursor.hide();
    currentCursorStep = -1;
    return;
  }

  if (currentCursorStep < 0) {
    // Starting from hidden state — reset and show instantly, then advance.
    if (el) el.style.transition = 'none';
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    for (let i = 0; i < targetStep; i++) osmdRef.cursor.next();
  } else if (targetStep > currentCursorStep) {
    const stepsToAdvance = targetStep - currentCursorStep;
    if (el) {
      if (stepsToAdvance === 1) {
        // Smooth horizontal slide to the next beat position.
        // Only 'left' transitions so vertical system-boundary jumps remain instant.
        const currQ = cursorSteps[currentCursorStep]?.quarters ?? 0;
        const nextQ = cursorSteps[targetStep]?.quarters ?? currQ;
        const durSec = Math.max(0.04, ((nextQ - currQ) * 60) / Tone.Transport.bpm.value);
        el.style.transition = `left ${durSec.toFixed(3)}s linear`;
      } else {
        el.style.transition = 'none'; // catch-up jump: skip animation
      }
    }
    for (let i = 0; i < stepsToAdvance; i++) osmdRef.cursor.next();
  } else {
    // Backward seek — instant reset (only happens on stop → replay).
    if (el) el.style.transition = 'none';
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
    for (let i = 0; i < targetStep; i++) osmdRef.cursor.next();
  }

  currentCursorStep = targetStep;
}

function animateCursorLoop(): void {
  if (Tone.Transport.state !== 'started') {
    animFrameId = null;
    return;
  }

  const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;

  // Binary search for the last cursor step whose beat position ≤ current transport position
  let lo = 0;
  let hi = cursorSteps.length - 1;
  let targetStep = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = cursorSteps[mid];
    if (step !== undefined && step.quarters <= quartersElapsed) {
      targetStep = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  setCursorStep(targetStep);

  if (quartersElapsed >= totalQuarters && totalQuarters > 0) {
    _stopInternal();
    postToNative({ type: 'PLAYBACK_END' });
    return;
  }

  animFrameId = requestAnimationFrame(animateCursorLoop);
}

function _stopInternal(): void {
  Tone.Transport.stop();
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  // Return cursor to position 0 (visible, no transition) so the score stays
  // navigable after stop without needing to press play first.
  if (osmdRef) {
    const el = cursorEl();
    if (el) el.style.transition = 'none';
    osmdRef.cursor.reset();
    osmdRef.cursor.show();
  }
  currentCursorStep = 0;
}

export function initPlayback(osmd: OpenSheetMusicDisplay): void {
  osmdRef = osmd;
  disposePlayback();

  const { noteEvents, steps, scoreBpm } = buildTimelines(osmd);
  cursorSteps = steps;

  // Show cursor at position 0 immediately after load (no animation yet).
  const el = cursorEl();
  if (el) el.style.transition = 'none';
  osmd.cursor.show();
  currentCursorStep = 0;

  // Set transport to the score's indicated tempo. The native side will receive
  // SCORE_BPM and may later adjust via SET_TEMPO_BPM (multiplier buttons).
  Tone.Transport.bpm.value = scoreBpm;
  postToNative({ type: 'SCORE_BPM', payload: scoreBpm });

  sampler = new Tone.Sampler({
    urls: PIANO_URLS,
    release: 1,
    baseUrl: SALAMANDER_BASE_URL,
    // onerror is intentionally omitted; missing samples play silence (no crash)
  }).toDestination();

  const samplerRef = sampler;
  part = new Tone.Part<NoteEvent>(
    (time, event) => {
      try {
        const noteName = Tone.Frequency(event.midi, 'midi').toNote();
        // Duration in seconds from quarter-note length + BPM at schedule time.
        const durSec = Math.max(0.05, (event.durQ * 60) / Tone.Transport.bpm.value);
        samplerRef.triggerAttackRelease(noteName, durSec, time);
      } catch {
        // ignore individual-note scheduling failures
      }
    },
    noteEvents,
  );
  part.start(0);
}

export async function startPlayback(): Promise<void> {
  if (!sampler || !part) return;
  try {
    await Tone.start(); // resume AudioContext (required by autoplay policy)
    // 8s timeout so a CDN failure doesn't block playback indefinitely
    await Promise.race([Tone.loaded(), new Promise<void>((r) => setTimeout(r, 8000))]);
  } catch {
    // non-fatal: play with whatever samples have loaded
  }
  // No offset: Transport.state becomes 'started' immediately, which is required
  // for animateCursorLoop's state check to pass on the first RAF frame.
  // Tone.js's built-in 100ms lookahead pre-schedules tick-0 events correctly.
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
  if (Tone.Transport.state !== 'stopped') Tone.Transport.stop();
  part?.dispose();
  part = null;
  sampler?.dispose();
  sampler = null;
  cursorSteps = [];
  currentCursorStep = -1;
  totalQuarters = 0;
}
