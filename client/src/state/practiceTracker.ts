import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { PracticeClock, type PracticeDelta } from '@domain/practiceTime';
import { usePlayViewStore } from './playViewStore';
import { usePracticeStore } from './practiceStore';
import { useWarmUpStore } from './warmupStore';

/**
 * Single subscriber that turns playback into practice history.
 *
 * It watches `isPlaying` on both playback stores — `playViewStore` drives the
 * piece play view *and* routines, `warmupStore` drives the warm-up exercises —
 * so no play surface needs tracking code of its own. Each screen already resets
 * its store on unmount, which lands here as a stop and banks the partial time.
 *
 * The clock measures the union of both stores' playing intervals, so the wall
 * clock is never counted twice if they ever overlap.
 */

/** How often an in-progress session is banked, so an app kill loses little. */
const FLUSH_INTERVAL_MS = 60_000;

const clock = new PracticeClock();

let subscriptions: (() => void)[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function bank(deltas: PracticeDelta[]): void {
  if (deltas.length > 0) void usePracticeStore.getState().recordPractice(deltas);
}

/**
 * Starts practice-time tracking. Idempotent; returns a stop function that banks
 * whatever is currently open (used by the root layout's cleanup).
 */
export function startPracticeTracking(): () => void {
  if (subscriptions.length > 0) return stopPracticeTracking;

  subscriptions.push(
    usePlayViewStore.subscribe((state, prev) => {
      if (state.isPlaying !== prev.isPlaying) {
        bank(clock.setPlaying('score', state.isPlaying, Date.now()));
      }
    }),
  );

  subscriptions.push(
    useWarmUpStore.subscribe((state, prev) => {
      if (state.isPlaying !== prev.isPlaying) {
        bank(clock.setPlaying('warmup', state.isPlaying, Date.now()));
      }
    }),
  );

  // Periodic flush covers two cases the transitions alone miss: a session that
  // crosses local midnight (so both days get their share) and an app killed
  // while playing.
  flushTimer = setInterval(() => bank(clock.flush(Date.now())), FLUSH_INTERVAL_MS);

  const appStateSub: NativeEventSubscription = AppState.addEventListener(
    'change',
    (status: AppStateStatus) => {
      // Leaving the foreground is the last reliable moment to persist.
      if (status !== 'active') bank(clock.flush(Date.now()));
    },
  );
  subscriptions.push(() => appStateSub.remove());

  return stopPracticeTracking;
}

/** Tears down the subscriptions and banks any open segment. */
export function stopPracticeTracking(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  bank(clock.flush(Date.now()));
  clock.reset();
}
