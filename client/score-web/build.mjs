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
    /* An armed bit's handles frame the region but cannot be dragged — bits have no edit,
       only delete-and-redraw. The grip glyph is the thing that says "drag me", so it goes
       away rather than advertising an interaction that does nothing. */
    .loop-handle.inert svg { display: none; }
    /* Saved bits, marked as pills along the bottom of the screen: paper-white, told
       apart from the page by the shadow they cast. Rows are assigned by domain/bits.ts —
       longer bits lower, so a bit nested inside another sits above it.

       Pinned to the bottom of the *viewport*, not under the staff: the strip is a
       persistent index of the piece and belongs at the edge of the page, out of the
       notation's way. It still lives inside #osmd, so it travels horizontally with the
       score for free; only its vertical offset is computed against the viewport.

       The container takes no touches; each pill does. Events still bubble to
       #osmd-wrapper's pan handler, which is what lets a drag starting on a pill pan the
       score instead of being swallowed by it.

       200ms / this bezier are LOOP_UNFURL_MS and LOOP_UNFURL_EASING from playback.ts,
       written out because this template is a plain string with no access to them. The
       pill and the loop unfurl share one motion feel; keep them in step by hand. */
    /* The strip slides as one object. Transform on the container rather than on each
       pill: one animated property for the whole strip, and the pills keep their own `top`
       so the rows stay in formation on the way down. #osmd-wrapper clips at the viewport,
       so travelling past the bottom edge is genuinely out of sight. Distance is set from
       playback.ts — it depends on how many rows are occupied. */
    #bit-punches {
      position: absolute; top: 0; left: 0; pointer-events: none; z-index: 8;
      transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    .bit-punch {
      position: absolute; pointer-events: auto; box-sizing: border-box;
      /* Deliberately a shade off page white, and this is the load-bearing decision in the
         whole recipe. A bump lit from above has its brightest face on the upper slope —
         but nothing can be brighter than white paper, so on a white page a white-crowned
         pill simply has no visible top edge. Dropping the body a step gives the crown
         something to be bright *against*, and gives the pill a silhouette at all. */
      background: #F8F8FB;
      /* Fully rounded ends. Set here rather than per element so the radius cannot drift
         from PUNCH_HEIGHT_PX without someone noticing. */
      border-radius: 999px;
      /* The page pushed up from behind, lit from above — shading, not a card. There is
         deliberately no outline: a ring is what made an earlier version read as a badge
         lying on the paper, because a real deformation of a surface has no edge, only
         curvature. Read in order, these are:
           · the concave crease where the flat page bends up into the bump — the *only*
             thing that can mark the top edge, and directional so it reads as curvature
             rather than as a border
           · the lit crown just inside it
           · the underside curving back down into the page
           · the crease where it lands
           · what the bump casts onto the page below
         Depth sits midway between the two versions that were trialled: the softer one read
         as barely raised, the deeper one as a moulded plastic key rather than paper. Tuned
         as a set — raising one layer alone flattens the others by comparison.
         Shadows are slate-950 rather than pure black — the palette's ink, so the greys
         stay in the same family as the notation. */
      box-shadow:
        0 -1px 1.5px rgba(14,14,27,0.12),
        inset 0 4px 4px -2px rgba(255,255,255,1),
        inset 0 -6px 7px -4px rgba(14,14,27,0.38),
        inset 0 -1px 0 rgba(14,14,27,0.13),
        0 4px 6px -2px rgba(14,14,27,0.20),
        0 2px 3px rgba(14,14,27,0.12);
      /* For the armed/unarmed change only — the show/hide travel is the container's. */
      transition: background-color 200ms cubic-bezier(0.22, 0.61, 0.36, 1),
                  box-shadow 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    /* The armed bit: the same bump, in navy. Only the hue changes — the shading is the
       identical figure, so the two states read as one object lit differently rather than
       as two different components. navy-100 ground, navy-900 shadows. */
    .bit-punch.active {
      background: #E3E3F6;
      box-shadow:
        0 -1px 1.5px rgba(3,3,73,0.18),
        inset 0 4px 4px -2px rgba(255,255,255,0.92),
        inset 0 -6px 7px -4px rgba(3,3,73,0.45),
        inset 0 -1px 0 rgba(3,3,73,0.21),
        0 4px 6px -2px rgba(3,3,73,0.27),
        0 2px 3px rgba(3,3,73,0.16);
    }
    /* Playing slides the strip down off the bottom of the screen, and pausing brings it
       back up. Nothing fades: these are physical objects at the edge of the page, and a
       thing that leaves by moving is easier to follow than one that dissolves. Only the
       hit-testing is switched off here — an off-screen pill is clipped, not hidden, so it
       would still answer a touch. */
    #bit-punches.hidden .bit-punch { pointer-events: none; }
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
      <div id="bit-punches"></div>
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
