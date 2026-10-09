import { DEFAULT_PRACTICE_SETTINGS } from '../practiceSettings';

describe('DEFAULT_PRACTICE_SETTINGS', () => {
  // The default is what a piece or bit stored before a setting existed reads as, so each
  // setting must default to how such a piece already behaved: audible, no click.
  it('plays both hands at full speed, audible, without the metronome', () => {
    expect(DEFAULT_PRACTICE_SETTINGS).toEqual({
      hand: 'both',
      tempoMultiplier: 1.0,
      metronome: false,
      muted: false,
    });
  });
});
