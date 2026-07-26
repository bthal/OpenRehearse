import type { PracticeDelta } from '@domain/practiceTime';
import { usePlayViewStore } from '../playViewStore';
import { usePracticeStore } from '../practiceStore';
import { startPracticeTracking, stopPracticeTracking } from '../practiceTracker';
import { useWarmUpStore } from '../warmupStore';

// The tracker's job is wiring: watch both playback stores, hand real elapsed
// time to the store, and persist it. SQLite is stubbed so this stays a unit test.
jest.mock('@data/practiceRepository', () => ({
  addPracticeSeconds: jest.fn().mockResolvedValue(undefined),
  loadPracticeDailySeconds: jest.fn().mockResolvedValue({}),
}));

const { addPracticeSeconds } = jest.requireMock('@data/practiceRepository') as {
  addPracticeSeconds: jest.Mock<Promise<void>, [readonly PracticeDelta[]]>;
};

const START = new Date(2026, 4, 4, 10, 0, 0).getTime();
const DAY = '2026-05-04';
const SECOND = 1000;

/** Total seconds handed to the repository so far, across all flushes. */
function persistedSeconds(): number {
  return addPracticeSeconds.mock.calls
    .flatMap(([deltas]) => [...deltas])
    .reduce((sum, d) => sum + d.seconds, 0);
}

/** Lets the tracker's fire-and-forget persistence settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('practiceTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    addPracticeSeconds.mockClear();
    usePracticeStore.setState({ dailySeconds: {} });
    startPracticeTracking();
  });

  afterEach(() => {
    stopPracticeTracking();
    usePlayViewStore.getState().reset();
    useWarmUpStore.getState().resetPlayback();
    jest.useRealTimers();
  });

  it('records play-view time on the day it was played', async () => {
    usePlayViewStore.getState().setPlaying(true);
    jest.setSystemTime(START + 90 * SECOND);
    usePlayViewStore.getState().setPlaying(false);
    await settle();

    expect(addPracticeSeconds).toHaveBeenCalledWith([{ day: DAY, seconds: 90 }]);
    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(90);
  });

  it('sums warm-up time into the same daily total', async () => {
    usePlayViewStore.getState().setPlaying(true);
    jest.setSystemTime(START + 60 * SECOND);
    usePlayViewStore.getState().setPlaying(false);

    jest.setSystemTime(START + 120 * SECOND);
    useWarmUpStore.getState().setPlaying(true);
    jest.setSystemTime(START + 150 * SECOND);
    useWarmUpStore.getState().setPlaying(false);
    await settle();

    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(90);
    expect(persistedSeconds()).toBe(90);
  });

  it('counts overlapping stores once', async () => {
    // Both report playing between +30s and +60s; wall clock is 90s, not 120s.
    usePlayViewStore.getState().setPlaying(true);
    jest.setSystemTime(START + 30 * SECOND);
    useWarmUpStore.getState().setPlaying(true);
    jest.setSystemTime(START + 60 * SECOND);
    usePlayViewStore.getState().setPlaying(false);
    jest.setSystemTime(START + 90 * SECOND);
    useWarmUpStore.getState().setPlaying(false);
    await settle();

    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(90);
    expect(persistedSeconds()).toBe(90);
  });

  it('persists partial time when a screen unmounts mid-play', async () => {
    usePlayViewStore.getState().setPlaying(true);
    jest.setSystemTime(START + 45 * SECOND);
    // Every play surface resets its store on unmount — that is the stop signal.
    usePlayViewStore.getState().reset();
    await settle();

    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(45);
  });

  it('banks an in-progress session on the periodic flush', async () => {
    usePlayViewStore.getState().setPlaying(true);
    // Advancing the fake timers moves Date.now along with them, so this is one
    // minute of playing time ending on the tracker's flush tick.
    jest.advanceTimersByTime(60 * SECOND);
    await settle();

    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(60);
    expect(usePlayViewStore.getState().isPlaying).toBe(true);

    // The later stop must add only the time since the flush, not repeat it.
    jest.setSystemTime(START + 100 * SECOND);
    usePlayViewStore.getState().setPlaying(false);
    await settle();
    expect(usePracticeStore.getState().dailySeconds[DAY]).toBe(100);
  });

  it('does not accumulate while nothing is playing', async () => {
    jest.setSystemTime(START + 10 * 60 * SECOND);
    jest.advanceTimersByTime(10 * 60 * SECOND);
    await settle();

    expect(addPracticeSeconds).not.toHaveBeenCalled();
    expect(usePracticeStore.getState().dailySeconds).toEqual({});
  });
});
