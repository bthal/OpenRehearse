/**
 * Hands the WebView the practised instrument's bundled samples.
 *
 * Lives on the native side of the seam because resolving a bundled asset to a URI is
 * an expo-asset concern the web bundle has no access to, and because all three score
 * screens need the identical two-step: resolve, then inject *before* the load. The
 * note player is constructed during `__rn_load_xml` — and the loop bounds sent here
 * decide *which* player — so ordering is not optional; injectJavaScript delivers in
 * order, which is what makes back-to-back calls safe.
 */
import { resolveSampleUris } from '@data/instrumentSamples';
import {
  INSTRUMENT_REGISTRY,
  sustainLoopFor,
  type InstrumentId,
} from '@domain/instrumentRegistry';

/**
 * Shown when the WebView bundle predates the instrument-audio bridge.
 *
 * Deliberately developer-facing: a shipped APK cannot hit this, because
 * `eas-build-post-install` rebuilds the bundle on every EAS build. It is a local
 * dev-loop failure, so it names the command that fixes it.
 */
const STALE_BUNDLE_MESSAGE = 'score-web bundle is stale — run: npm run bundle:score-web';

export async function injectInstrumentAudio(
  inject: (js: string) => void,
  instrument: InstrumentId,
): Promise<void> {
  const urls = await resolveSampleUris(instrument);
  const offset = INSTRUMENT_REGISTRY[instrument].transposeSemitones;
  // Where this set's recordings may be looped, so a note can outlast its buffer.
  // Absent for a decaying set (the piano), which keeps `Tone.Sampler`; present for the
  // clarinet, whose flat 3.13 s one-shots otherwise cut every long note dead.
  const loop = sustainLoopFor(instrument);
  // The web entry point parses each JSON string, so the payloads are stringified twice:
  // once to JSON, once more to become a valid JS string literal in the injected source.
  const urlsArg = JSON.stringify(JSON.stringify(urls));
  const loopArg = loop === null ? 'null' : JSON.stringify(JSON.stringify(loop));
  // Guarded rather than called bare, because a WebView bundle older than this native
  // code has no such global, and `injectJavaScript` reports that only as an opaque
  // cross-origin `Script error. @0:0` console line. The score then loads anyway — the
  // stale bundle still has `__rn_load_xml` — and plays every piece on whatever samples
  // that build hardcoded, which reads as "the instrument setting does nothing" rather
  // than as a broken build. `html.ts` is generated and gitignored, so it does not
  // change when the branch does; see compound-docs/osmd-webview.md.
  inject(
    `(function(){` +
      `if (typeof window.__rn_set_instrument_audio !== 'function') {` +
        `window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({` +
          `type:'ERROR',` +
          `payload:${JSON.stringify(STALE_BUNDLE_MESSAGE)}` +
        `}));` +
        `return;` +
      `}` +
      `window.__rn_set_instrument_audio(${urlsArg}, ${offset}, ${loopArg});` +
    `})();void 0;`,
  );
}
