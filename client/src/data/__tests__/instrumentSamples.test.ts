import { INSTRUMENT_IDS, INSTRUMENT_REGISTRY } from '@domain/instrumentRegistry';

import { bundledSampleNotes, missingSampleNotes } from '../instrumentSamples';

describe('bundled sample sets', () => {
  // The registry declares which notes an instrument has; instrumentSamples.ts declares
  // where their files are, and Metro forces that second list to be written out by hand.
  // This is what stops the two drifting apart into a silent missing note.
  it.each(INSTRUMENT_IDS)('bundles every note %s declares', (instrument) => {
    expect(missingSampleNotes(instrument)).toEqual([]);
  });

  it.each(INSTRUMENT_IDS)('bundles nothing %s does not declare', (instrument) => {
    const declared = new Set<string>(INSTRUMENT_REGISTRY[instrument].sampleNotes);
    expect(bundledSampleNotes(instrument).filter((n) => !declared.has(n))).toEqual([]);
  });

  it('spells piano sharps the way Tone.js does, not the way the files do', () => {
    // Salamander filenames use `Ds1.mp3`; the Sampler key must be `D#1`.
    expect(bundledSampleNotes('piano')).toContain('D#1');
    expect(bundledSampleNotes('piano')).not.toContain('Ds1');
  });

  it('keeps the clarinet in flats, as FluidR3 names them', () => {
    expect(bundledSampleNotes('clarinetBb')).toContain('Eb3');
  });
});
