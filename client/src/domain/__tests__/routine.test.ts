import { validateRoutine } from '../routine';
import type { RoutineBlock } from '../routine';

const hanon = (): RoutineBlock => ({
  type: 'hanon',
  pitchClass: 0,
  mode: 'major',
  hand: 'both',
  bpm: 60,
  octaves: 1,
});

const pause = (): RoutineBlock => ({ type: 'pause', measures: 1 });

describe('validateRoutine', () => {
  it('returns noBlocks for empty array', () => {
    expect(validateRoutine([])).toBe('noBlocks');
  });

  it('returns noBlocks for only pause blocks', () => {
    expect(validateRoutine([pause()])).toBe('noBlocks');
  });

  it('returns pauseAtEnd when last block is a pause', () => {
    expect(validateRoutine([hanon(), pause()])).toBe('pauseAtEnd');
  });

  it('returns null for a single exercise block', () => {
    expect(validateRoutine([hanon()])).toBeNull();
  });

  it('returns null for pause followed by exercise', () => {
    expect(validateRoutine([pause(), hanon()])).toBeNull();
  });

  it('returns null for exercise, pause, exercise', () => {
    expect(validateRoutine([hanon(), pause(), hanon()])).toBeNull();
  });

  it('returns pauseAtEnd for exercise, exercise, pause', () => {
    expect(validateRoutine([hanon(), hanon(), pause()])).toBe('pauseAtEnd');
  });
});
