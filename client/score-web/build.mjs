import esbuild from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The WebView's own chrome — cursor line, snap preview, loop shade and handles.
//
// These are the app's only colours that cannot come from the token layer: this
// template is a string handed to a WebView, with no access to Tailwind or to
// `src/theme/colors.ts`. They are written as hex/rgba literals of the navy ramp and
// have to be updated by hand when it moves. Values here, roles in `specs/brand.md`:
//
//   #2E2E9E  navy-600, hsl(240 55% 40%) — the interactive accent
//   #181881  navy-700, hsl(240 68% 30%) — the grip glyph, a step darker than its handle
//
// THIS FILE is the source. `src/score-web/html.ts` is generated from it and gitignored,
// so an edit there survives exactly until the next `npm ci` — `postinstall` rebuilds it.
// The navy migration was first written into the generated file and lost that way.
const HTML_TEMPLATE = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; background: white; user-select: none; -webkit-user-select: none; }
    #cursor-line {
      position: fixed; left: 50%; top: 0; height: 100%; width: 2px;
      background: #2E2E9E; pointer-events: none; z-index: 20;
      transform: translateX(-50%);
    }
    #osmd-wrapper {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;
    }
    #osmd { position: absolute; top: 0; left: 0; will-change: transform; }
    /* navy-600 at 12%, not the 20% the old cornflower wash used: a navy shade at 20%
       sitting between navy handles reads as one solid band rather than a region with
       ends. Alpha is hue-dependent — re-check it if the accent moves. */
    #loop-shade {
      position: absolute; top: 0;
      background: rgba(46,46,158,0.12); pointer-events: none; display: none;
    }
    /* Where the playhead or the handle being dragged will land once released.
       Paler and thinner than #cursor-line so it reads as a target, not a second
       playhead. translateX(-50%) mirrors #cursor-line's own centring, so the two
       coincide exactly when the score is settled instead of sitting a pixel apart. */
    #snap-preview {
      position: absolute; top: 0; width: 1px;
      background: #2E2E9E; opacity: 0.5;
      transform: translateX(-50%);
      pointer-events: none; display: none; z-index: 9;
    }
    /* Section junction marks. Declared before #loop-shade so an armed loop's shade
       paints over them, and before the OSMD svg so both stay under the notation. */
    #section-marks { position: absolute; top: 0; left: 0; pointer-events: none; }
    #section-marks > div { position: absolute; top: 0; height: 100%; }
    .loop-handle {
      position: absolute; top: 0; width: 28px;
      background: rgba(46,46,158,0.75); cursor: ew-resize;
      touch-action: none; display: none; z-index: 10;
      align-items: center; justify-content: center;
    }
    /* Only the corners facing away from the loop interior are rounded, so the two
       handles read as a bracket framing the shaded region. 8px matches the app's
       rounded-lg vocabulary. */
    #loop-handle-a { border-radius: 8px 0 0 8px; }
    #loop-handle-b { border-radius: 0 8px 8px 0; }
    .loop-handle svg { pointer-events: none; flex-shrink: 0; }
  </style>
</head><body>
  <div id="cursor-line"></div>
  <div id="osmd-wrapper">
    <div id="osmd">
      <div id="section-marks"></div>
      <div id="loop-shade"></div>
      <div id="snap-preview"></div>
      <!-- Grip glyphs are navy-700 rather than the handle's own navy-600: the icon was
           once the same shade as the handle and barely read against it. Measured 2.65:1
           against the handle body as it composites over white (the old teal pair was
           2.38:1) — decorative, so the bar is legibility at a glance, not WCAG text. -->
      <div id="loop-handle-a" class="loop-handle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#181881" d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z"/></svg></div>
      <div id="loop-handle-b" class="loop-handle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#181881" d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z"/></svg></div>
    </div>
  </div>
  <script>
    window.onerror = function(msg, _src, line, col) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'DEBUG', payload: 'SCRIPT ERR: ' + msg + ' @' + line + ':' + col })
      );
    };
  </script>
  <script>/* BUNDLE_PLACEHOLDER */</script>
</body></html>`;

const result = await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  format: 'iife',
  target: ['chrome58'],
  minify: true,
  write: false,
  platform: 'browser',
  // Prefer the ESM 'module' field over the 'browser' field.
  // Tone.js sets browser=build/Tone.js (UMD, no named exports) but
  // module=build/esm/index.js (ESM, named exports). esbuild's default
  // platform:browser ordering picks the UMD bundle, breaking imports.
  mainFields: ['module', 'main'],
  treeShaking: true,
  logLevel: 'info',
});

const bundleText = result.outputFiles[0].text;
// Use a function so $& and other $ patterns in bundleText aren't treated as
// replacement specifiers by String.prototype.replace.
const html = HTML_TEMPLATE.replace('/* BUNDLE_PLACEHOLDER */', () => bundleText);

// Escape for embedding in a TypeScript template literal.
// Backslashes first — order matters to avoid double-escaping.
const escaped = html
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const outDir = resolve(__dirname, '../src/score-web');
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, 'html.ts');
writeFileSync(
  outPath,
  `// AUTO-GENERATED by score-web/build.mjs — do not edit by hand.\n` +
    `// Run: npm run build:score-web\n` +
    `export const SCORE_WEB_HTML = \`${escaped}\`;\n`,
  'utf8',
);

console.log('score-web build complete →', outPath);
