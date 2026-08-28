/**
 * The bundled sample sets, as static `require()` maps.
 *
 * Metro only bundles an asset whose `require()` path is a literal, so this file is
 * necessarily a written-out table rather than anything derived from the registry.
 * `instrumentRegistry` declares *which* notes an instrument provides; this declares
 * where their files are, and `sampleNotes` is checked against these keys in tests so
 * the two cannot drift apart silently.
 *
 * Keys are note names as Tone.js spells them (`D#1`), while the Salamander filenames
 * spell sharps with `s` (`Ds1.mp3`) and the FluidR3 clarinet uses flats (`Eb3.mp3`) —
 * a per-set convention, which is exactly why the mapping is explicit here.
 *
 * These ship in the APK. Before this, piano samples were fetched from a CDN and
 * survived offline only by HTTP-cache accident, which contradicted
 * `specs/features/offline-storage.md`.
 */
import * as Asset from 'expo-asset';

import { INSTRUMENT_REGISTRY, type InstrumentId } from '@domain/instrumentRegistry';

const SALAMANDER_PIANO: Record<string, number> = {
  A0: require('../../assets/samples/salamander-piano/A0.mp3') as number,
  C1: require('../../assets/samples/salamander-piano/C1.mp3') as number,
  'D#1': require('../../assets/samples/salamander-piano/Ds1.mp3') as number,
  'F#1': require('../../assets/samples/salamander-piano/Fs1.mp3') as number,
  A1: require('../../assets/samples/salamander-piano/A1.mp3') as number,
  C2: require('../../assets/samples/salamander-piano/C2.mp3') as number,
  'D#2': require('../../assets/samples/salamander-piano/Ds2.mp3') as number,
  'F#2': require('../../assets/samples/salamander-piano/Fs2.mp3') as number,
  A2: require('../../assets/samples/salamander-piano/A2.mp3') as number,
  C3: require('../../assets/samples/salamander-piano/C3.mp3') as number,
  'D#3': require('../../assets/samples/salamander-piano/Ds3.mp3') as number,
  'F#3': require('../../assets/samples/salamander-piano/Fs3.mp3') as number,
  A3: require('../../assets/samples/salamander-piano/A3.mp3') as number,
  C4: require('../../assets/samples/salamander-piano/C4.mp3') as number,
  'D#4': require('../../assets/samples/salamander-piano/Ds4.mp3') as number,
  'F#4': require('../../assets/samples/salamander-piano/Fs4.mp3') as number,
  A4: require('../../assets/samples/salamander-piano/A4.mp3') as number,
  C5: require('../../assets/samples/salamander-piano/C5.mp3') as number,
  'D#5': require('../../assets/samples/salamander-piano/Ds5.mp3') as number,
  'F#5': require('../../assets/samples/salamander-piano/Fs5.mp3') as number,
  A5: require('../../assets/samples/salamander-piano/A5.mp3') as number,
  C6: require('../../assets/samples/salamander-piano/C6.mp3') as number,
  'D#6': require('../../assets/samples/salamander-piano/Ds6.mp3') as number,
  'F#6': require('../../assets/samples/salamander-piano/Fs6.mp3') as number,
  A6: require('../../assets/samples/salamander-piano/A6.mp3') as number,
  C7: require('../../assets/samples/salamander-piano/C7.mp3') as number,
  'D#7': require('../../assets/samples/salamander-piano/Ds7.mp3') as number,
  'F#7': require('../../assets/samples/salamander-piano/Fs7.mp3') as number,
  A7: require('../../assets/samples/salamander-piano/A7.mp3') as number,
  C8: require('../../assets/samples/salamander-piano/C8.mp3') as number,
};

const FLUIDR3_CLARINET: Record<string, number> = {
  C3: require('../../assets/samples/fluidr3-clarinet/C3.mp3') as number,
  Eb3: require('../../assets/samples/fluidr3-clarinet/Eb3.mp3') as number,
  Gb3: require('../../assets/samples/fluidr3-clarinet/Gb3.mp3') as number,
  A3: require('../../assets/samples/fluidr3-clarinet/A3.mp3') as number,
  C4: require('../../assets/samples/fluidr3-clarinet/C4.mp3') as number,
  Eb4: require('../../assets/samples/fluidr3-clarinet/Eb4.mp3') as number,
  Gb4: require('../../assets/samples/fluidr3-clarinet/Gb4.mp3') as number,
  A4: require('../../assets/samples/fluidr3-clarinet/A4.mp3') as number,
  C5: require('../../assets/samples/fluidr3-clarinet/C5.mp3') as number,
  Eb5: require('../../assets/samples/fluidr3-clarinet/Eb5.mp3') as number,
  Gb5: require('../../assets/samples/fluidr3-clarinet/Gb5.mp3') as number,
  A5: require('../../assets/samples/fluidr3-clarinet/A5.mp3') as number,
  C6: require('../../assets/samples/fluidr3-clarinet/C6.mp3') as number,
  Eb6: require('../../assets/samples/fluidr3-clarinet/Eb6.mp3') as number,
  Gb6: require('../../assets/samples/fluidr3-clarinet/Gb6.mp3') as number,
  A6: require('../../assets/samples/fluidr3-clarinet/A6.mp3') as number,
  C7: require('../../assets/samples/fluidr3-clarinet/C7.mp3') as number,
};

export const SAMPLE_MODULES: Record<InstrumentId, Record<string, number>> = {
  piano: SALAMANDER_PIANO,
  clarinetBb: FLUIDR3_CLARINET,
};

/**
 * Resolves an instrument's samples to URIs the WebView can fetch.
 *
 * `localUri` is the on-device path in a built app; in a Metro dev session the asset
 * is served over http and only `uri` is set, so both are tried. The WebView needs
 * `allowFileAccess` for the former — it defaults to `false` in react-native-webview.
 */
export async function resolveSampleUris(instrument: InstrumentId): Promise<Record<string, string>> {
  const modules = SAMPLE_MODULES[instrument];
  const notes = Object.keys(modules);
  const assets = await Asset.Asset.loadAsync(notes.map((n) => modules[n] as number));
  const urls: Record<string, string> = {};
  notes.forEach((note, i) => {
    const uri = assets[i]?.localUri ?? assets[i]?.uri;
    if (uri) urls[note] = uri;
  });
  return urls;
}

/** The notes an instrument's bundle actually provides, for tests and diagnostics. */
export function bundledSampleNotes(instrument: InstrumentId): string[] {
  return Object.keys(SAMPLE_MODULES[instrument]);
}

/** Declared-vs-bundled check, so a missing file is a test failure not a silent gap. */
export function missingSampleNotes(instrument: InstrumentId): string[] {
  const bundled = new Set(bundledSampleNotes(instrument));
  return INSTRUMENT_REGISTRY[instrument].sampleNotes.filter((n) => !bundled.has(n));
}
