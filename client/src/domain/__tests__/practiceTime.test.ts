import {
  applyPracticeDeltas,
  mergePracticeTotals,
  PracticeClock,
  practiceDayKey,
  splitIntervalByDay,
} from '../practiceTime';

/** Local-time timestamp helper — practice days are local, never UTC. */
function at(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): number {
  return new Date(year, month - 1, day, hours, minutes, seconds, ms).getTime();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('practiceDayKey', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(practiceDayKey(at(2026, 3, 7, 23, 59, 59))).toBe('2026-03-07');
    expect(practiceDayKey(at(2026, 12, 31, 0, 0, 0))).toBe('2026-12-31');
  });
});

describe('splitIntervalByDay', () => {
  it('keeps a same-day interval in one chunk', () => {
    const chunks = splitIntervalByDay(at(2026, 5, 4, 10), at(2026, 5, 4, 10, 30));
    expect(chunks).toEqual([{ day: '2026-05-04', ms: 30 * MINUTE }]);
  });

  it('cuts at local midnight when the interval rolls over', () => {
    const chunks = splitIntervalByDay(at(2026, 5, 4, 23, 50), at(2026, 5, 5, 0, 20));
    expect(chunks).toEqual([
      { day: '2026-05-04', ms: 10 * MINUTE },
      { day: '2026-05-05', ms: 20 * MINUTE },
    ]);
  });

  it('splits an interval spanning several days at each midnight', () => {
    const chunks = splitIntervalByDay(at(2026, 5, 4, 22), at(2026, 5, 6, 1));
    expect(chunks.map((c) => c.day)).toEqual(['2026-05-04', '2026-05-05', '2026-05-06']);
    expect(chunks[1]?.ms).toBe(24 * 60 * MINUTE);
  });

  it('returns nothing for empty or reversed intervals', () => {
    expect(splitIntervalByDay(at(2026, 5, 4, 10), at(2026, 5, 4, 10))).toEqual([]);
    expect(splitIntervalByDay(at(2026, 5, 4, 11), at(2026, 5, 4, 10))).toEqual([]);
  });
});

describe('PracticeClock', () => {
  it('accumulates only while playing and banks on stop', () => {
    const clock = new PracticeClock();
    const start = at(2026, 5, 4, 10);

    expect(clock.setPlaying('score', true, start)).toEqual([]);
    expect(clock.isRunning).toBe(true);

    const deltas = clock.setPlaying('score', false, start + 5 * MINUTE);
    expect(deltas).toEqual([{ day: '2026-05-04', seconds: 300 }]);
    expect(clock.isRunning).toBe(false);
  });

  it('does not count time while paused between two playing stretches', () => {
    const clock = new PracticeClock();
    const t0 = at(2026, 5, 4, 10);

    clock.setPlaying('score', true, t0);
    const first = clock.setPlaying('score', false, t0 + 60 * SECOND);
    // 10 minutes of pause pass here — they must not be counted.
    clock.setPlaying('score', true, t0 + 11 * MINUTE);
    const second = clock.setPlaying('score', false, t0 + 11 * MINUTE + 30 * SECOND);

    expect(first).toEqual([{ day: '2026-05-04', seconds: 60 }]);
    expect(second).toEqual([{ day: '2026-05-04', seconds: 30 }]);
  });

  it('counts wall-clock time once when both stores play concurrently', () => {
    const clock = new PracticeClock();
    const t0 = at(2026, 5, 4, 10);

    // score plays 0–60s, warmup plays 30–90s: 90s of wall clock, not 120s.
    clock.setPlaying('score', true, t0);
    expect(clock.setPlaying('warmup', true, t0 + 30 * SECOND)).toEqual([]);
    // The score stopping does not close the segment — warmup is still playing.
    expect(clock.setPlaying('score', false, t0 + 60 * SECOND)).toEqual([]);
    expect(clock.isRunning).toBe(true);

    const deltas = clock.setPlaying('warmup', false, t0 + 90 * SECOND);
    expect(deltas).toEqual([{ day: '2026-05-04', seconds: 90 }]);
  });

  it('splits an open session across local midnight on flush', () => {
    const clock = new PracticeClock();
    const start = at(2026, 5, 4, 23, 40);

    clock.setPlaying('warmup', true, start);
    const deltas = clock.flush(at(2026, 5, 5, 0, 10));

    expect(deltas).toEqual([
      { day: '2026-05-04', seconds: 20 * 60 },
      { day: '2026-05-05', seconds: 10 * 60 },
    ]);
    // Still playing: the clock keeps running from the flush point.
    expect(clock.isRunning).toBe(true);
    expect(clock.setPlaying('warmup', false, at(2026, 5, 5, 0, 15))).toEqual([
      { day: '2026-05-05', seconds: 5 * 60 },
    ]);
  });

  it('flushes partial time without double-counting it at the later stop', () => {
    const clock = new PracticeClock();
    const t0 = at(2026, 5, 4, 10);

    clock.setPlaying('score', true, t0);
    expect(clock.flush(t0 + 90 * SECOND)).toEqual([{ day: '2026-05-04', seconds: 90 }]);
    // Leaving the screen mid-play stops the store 30s later: only those 30s.
    expect(clock.setPlaying('score', false, t0 + 120 * SECOND)).toEqual([
      { day: '2026-05-04', seconds: 30 },
    ]);
  });

  it('carries sub-second remainders across flushes instead of losing them', () => {
    const clock = new PracticeClock();
    const t0 = at(2026, 5, 4, 10);

    clock.setPlaying('score', true, t0);
    // Four flushes at 1.5s each: 6s total, so the halves must not be dropped.
    const banked = [1500, 3000, 4500, 6000]
      .flatMap((offset) => clock.flush(t0 + offset))
      .reduce((sum, d) => sum + d.seconds, 0);
    expect(banked).toBe(6);
  });

  it('is a no-op when flushing with nothing playing', () => {
    const clock = new PracticeClock();
    expect(clock.flush(at(2026, 5, 4, 10))).toEqual([]);
    expect(clock.isRunning).toBe(false);
  });

  it('ignores a stop that arrives without a start', () => {
    const clock = new PracticeClock();
    expect(clock.setPlaying('score', false, at(2026, 5, 4, 10))).toEqual([]);
  });

  it('treats a repeated start as one segment', () => {
    const clock = new PracticeClock();
    const t0 = at(2026, 5, 4, 10);
    clock.setPlaying('score', true, t0);
    clock.setPlaying('score', true, t0 + 30 * SECOND);
    expect(clock.setPlaying('score', false, t0 + 60 * SECOND)).toEqual([
      { day: '2026-05-04', seconds: 60 },
    ]);
  });

  describe('suspend/resume', () => {
    it('banks the open segment and counts nothing until it resumes', () => {
      const clock = new PracticeClock();
      const t0 = at(2026, 5, 4, 10);

      clock.setPlaying('score', true, t0);
      expect(clock.suspend(t0 + 60 * SECOND)).toEqual([{ day: '2026-05-04', seconds: 60 }]);
      expect(clock.isRunning).toBe(false);

      // Three hours out of the foreground, flush ticks included: not practice.
      expect(clock.flush(t0 + 60 * MINUTE)).toEqual([]);
      expect(clock.flush(t0 + 180 * MINUTE)).toEqual([]);
      expect(clock.isRunning).toBe(false);
    });

    it('resumes a still-playing source from the moment of return', () => {
      const clock = new PracticeClock();
      const t0 = at(2026, 5, 4, 10);
      const back = t0 + 180 * MINUTE;

      clock.setPlaying('score', true, t0);
      clock.suspend(t0 + 60 * SECOND);
      clock.resume(back);

      expect(clock.isRunning).toBe(true);
      expect(clock.setPlaying('score', false, back + 30 * SECOND)).toEqual([
        { day: '2026-05-04', seconds: 30 },
      ]);
    });

    it('does not restart for a source that stopped while suspended', () => {
      const clock = new PracticeClock();
      const t0 = at(2026, 5, 4, 10);

      clock.setPlaying('score', true, t0);
      clock.suspend(t0 + 60 * SECOND);
      // The screen unmounted in the background: a stop with no time to bank.
      expect(clock.setPlaying('score', false, t0 + 90 * SECOND)).toEqual([]);

      clock.resume(t0 + 30 * MINUTE);
      expect(clock.isRunning).toBe(false);
      expect(clock.flush(t0 + 60 * MINUTE)).toEqual([]);
    });

    it('keeps the union intact when only one of two sources stops while suspended', () => {
      const clock = new PracticeClock();
      const t0 = at(2026, 5, 4, 10);
      const back = t0 + 30 * MINUTE;

      clock.setPlaying('score', true, t0);
      clock.setPlaying('warmup', true, t0);
      clock.suspend(t0 + 60 * SECOND);
      expect(clock.setPlaying('warmup', false, t0 + 90 * SECOND)).toEqual([]);

      clock.resume(back);
      expect(clock.isRunning).toBe(true);
      expect(clock.setPlaying('score', false, back + 15 * SECOND)).toEqual([
        { day: '2026-05-04', seconds: 15 },
      ]);
    });

    it('stays stopped when it resumes with nothing playing', () => {
      const clock = new PracticeClock();
      expect(clock.suspend(at(2026, 5, 4, 10))).toEqual([]);
      clock.resume(at(2026, 5, 4, 10, 5));
      expect(clock.isRunning).toBe(false);
    });

    it('ignores a repeated suspend and a resume that was never suspended', () => {
      const clock = new PracticeClock();
      const t0 = at(2026, 5, 4, 10);

      clock.setPlaying('score', true, t0);
      expect(clock.suspend(t0 + 60 * SECOND)).toEqual([{ day: '2026-05-04', seconds: 60 }]);
      expect(clock.suspend(t0 + 120 * SECOND)).toEqual([]);

      clock.resume(t0 + 120 * SECOND);
      clock.resume(t0 + 180 * SECOND); // no-op: already running
      expect(clock.setPlaying('score', false, t0 + 240 * SECOND)).toEqual([
        { day: '2026-05-04', seconds: 120 },
      ]);
    });
  });
});

describe('applyPracticeDeltas', () => {
  it('adds deltas onto existing day totals', () => {
    const totals = { '2026-05-04': 120 };
    const next = applyPracticeDeltas(totals, [
      { day: '2026-05-04', seconds: 60 },
      { day: '2026-05-05', seconds: 30 },
    ]);
    expect(next).toEqual({ '2026-05-04': 180, '2026-05-05': 30 });
    expect(totals).toEqual({ '2026-05-04': 120 }); // input untouched
  });

  it('returns a copy when there is nothing to add', () => {
    const totals = { '2026-05-04': 120 };
    expect(applyPracticeDeltas(totals, [])).toEqual(totals);
  });
});

describe('mergePracticeTotals', () => {
  it('keeps the larger total per day and the union of days', () => {
    const queried = { '2026-05-03': 600, '2026-05-04': 120 };
    const inMemory = { '2026-05-04': 420, '2026-05-05': 60 };

    expect(mergePracticeTotals(queried, inMemory)).toEqual({
      '2026-05-03': 600, // only the query knows about it
      '2026-05-04': 420, // memory is ahead of the rows the query read
      '2026-05-05': 60, // banked after the query ran
    });
  });

  it('does not mutate either input', () => {
    const queried = { '2026-05-04': 120 };
    const inMemory = { '2026-05-04': 420 };

    mergePracticeTotals(queried, inMemory);

    expect(queried).toEqual({ '2026-05-04': 120 });
    expect(inMemory).toEqual({ '2026-05-04': 420 });
  });

  it('returns the queried snapshot when memory is empty', () => {
    expect(mergePracticeTotals({ '2026-05-04': 120 }, {})).toEqual({ '2026-05-04': 120 });
  });
});
