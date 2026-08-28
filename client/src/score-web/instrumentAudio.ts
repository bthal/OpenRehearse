/**
 * Hands the WebView the practised instrument's bundled samples.
 *
 * Lives on the native side of the seam because resolving a bundled asset to a URI is
 * an expo-asset concern the web bundle has no access to, and because all three score
 * screens need the identical two-step: resolve, then inject *before* the load. The
 * Sampler is constructed during `__rn_load_xml`, so ordering is not optional —
 * injectJavaScript delivers in order, which is what makes back-to-back calls safe.
 */
import { resolveSampleUris } from '@data/instrumentSamples';
import { INSTRUMENT_REGISTRY, type InstrumentId } from '@domain/instrumentRegistry';

export async function injectInstrumentAudio(
  inject: (js: string) => void,
  instrument: InstrumentId,
): Promise<void> {
  const urls = await resolveSampleUris(instrument);
  const offset = INSTRUMENT_REGISTRY[instrument].transposeSemitones;
  // The web entry point parses a JSON string, so the payload is stringified twice:
  // once to JSON, once more to become a valid JS string literal in the injected source.
  inject(
    `window.__rn_set_instrument_audio(${JSON.stringify(JSON.stringify(urls))}, ${offset});void 0;`,
  );
}
