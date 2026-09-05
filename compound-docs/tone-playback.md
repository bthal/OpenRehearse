# Tone.js + OSMD playback landmines (Phase 3 / Phase 3b)

Traps found during Phase 3 implementation. Check here before touching `score-web/src/playback.ts`
or the `build.mjs` esbuild config.

## Tone.js `browser` field resolves to UMD bundle — no named exports

**LANDMINE:** Tone.js v14 sets `"browser": "build/Tone.js"` in `package.json`. esbuild with
`platform: 'browser'` (the default for a web target) picks up the `browser` field, which points
to the UMD/IIFE bundle. That bundle wraps everything in a closure and exports nothing. Every
`import * as Tone from 'tone'` member is `undefined`, and esbuild emits
"Import will always be undefined" warnings.

**Fix:** Override the field resolution order in `build.mjs`:
```javascript
mainFields: ['module', 'main'],
```
Tone.js's `module` field (`build/esm/index.js`) is the named-export ESM build. With `mainFields`
set, esbuild ignores the `browser` field and bundles the ESM sources correctly.

## Tone.js tick notation (`"Xi"`) for tempo-relative scheduling

**PATTERN:** To schedule note events relative to musical time (so BPM changes automatically
rescale all future onsets), use Tone.js's internal tick notation `"Xi"` where `X = beats *
Tone.Transport.PPQ`:

```typescript
const TONE_PPQ = 192; // Tone.js default PPQ — must match Tone.Transport.PPQ
const onsetTicks = Math.round(quarterBeatPosition * TONE_PPQ);

part = new Tone.Part(callback, [{ time: `${onsetTicks}i`, ... }]);
part.start(0);
```

Using seconds (`"Xs"`) would make BPM changes ineffective — the note times would be fixed in
wall-clock time. Ticks advance at a rate determined by the current BPM, so changing
`Tone.Transport.bpm.value` immediately affects when future events fire.

## `Tone.Part` survives `Transport.stop()` + `Transport.start()` without `cancel()`

**PATTERN:** After `Tone.Transport.stop()` (position resets to 0), a `Part` that was started at
transport time 0 (`part.start(0)`) replays from the beginning on the next `Transport.start()`.
Do **not** call `Tone.Transport.cancel(0)` between a stop and a re-play — `cancel()` removes
the Part's registered events, requiring a full `part.dispose()` + `new Tone.Part(...)` to replay.

Only call `cancel()` (via `part.dispose()`) when tearing down the PlaybackController entirely
(e.g. new piece load or component unmount).

## AudioContext autoplay in React Native WebView

**PATTERN:** Web Audio API's `AudioContext` starts in the `'suspended'` state and typically
requires a user gesture to `resume()`. In a React Native WebView on Android the restriction is
usually less strict than in a browser tab — calling `await Tone.start()` (which calls
`AudioContext.resume()`) programmatically from `injectJavaScript` typically succeeds because the
WebView is controlled by the native app, not the browser's autoplay policy.

Add `mediaPlaybackRequiresUserAction={false}` to the `<WebView>` prop to also allow inline media
elements to play without a gesture, but note this prop is **not** the same as permitting Web Audio
— it only affects HTML `<audio>`/`<video>` elements.

If audio fails to play on a specific Android device/WebView version, the most reliable fix is to
call `Tone.start()` inside a tap handler (e.g. tap anywhere on the WebView), then proceed with
`Transport.start()`.

## OSMD cursor note extraction: use `cursor.NotesUnderCursor()` not manual `VoiceEntry` iteration

**PATTERN:** `cursor.NotesUnderCursor()` returns all `Note[]` at the current cursor position
across all voices and instruments. It is simpler and safer than iterating `VoicesUnderCursor()`
→ `VoiceEntry.Notes` manually.

Filter before scheduling:
```typescript
const notes = osmd.cursor.NotesUnderCursor();
for (const note of notes) {
  if (note.isRest() || note.IsGraceNote) continue; // skip rests and grace notes
  // OSMD halfTone is semitones from C0; add 12 for standard MIDI. Piano range: A0=9, C8=96.
  if (note.halfTone < 9 || note.halfTone > 115) continue;
  ...
  noteEvents.push({ ..., midi: note.halfTone + 12, ... });
}
```

`Note.halfTone` is semitones from C0 (OSMD convention) — one octave below standard MIDI.
Always add 12 before passing to any Tone.js MIDI function.

## LANDMINE: OSMD `Note.halfTone` is one octave below standard MIDI — add 12

**LANDMINE:** `Note.halfTone` in OSMD counts semitones from C0 (octave * 12 + fundamentalNote).
Standard MIDI counts from C-1 (C0 = 12, C4 = 60). OSMD's C4 = 48, which Tone.js maps to C3 —
every note plays one octave too low.

**Fix:** add 12 whenever feeding `halfTone` to a Tone.js MIDI function:

```typescript
const midi = note.halfTone + 12; // OSMD C0=0 → MIDI C0=12
const noteName = Tone.Frequency(midi, 'midi').toNote();
samplerRef.triggerAttackRelease(noteName, durSec, time);
```

Piano range after the offset: A0 = 21, C8 = 108 (standard MIDI).

## Tone.Sampler with bundled samples (expo-asset, not a CDN)

**PATTERN:** `Tone.Sampler` pitch-shifts between recorded samples to cover a full range, so a set
spaced about a minor third apart is enough. Both sets ship **inside the APK** under
`client/assets/samples/`, are resolved to `file://` URIs by `expo-asset`, and are pushed into the
WebView by `injectInstrumentAudio` *before* `__rn_load_xml` — the Sampler is constructed during the
load, so samples cannot arrive after it. `injectJavaScript` delivers in order, which is what makes
the two back-to-back calls safe.

```typescript
// native: src/score-web/instrumentAudio.ts
await injectInstrumentAudio((js) => webViewRef.current?.injectJavaScript(js), instrument);
webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);

// web: playback.ts — bytes read by XHR, decoded by hand, handed over as AudioBuffers
const bytes = await readArrayBuffer(url); // XMLHttpRequest, NOT fetch
sampleBuffers[note] = await ctx.decodeAudioData(bytes);
sampler = new Tone.Sampler({ urls: sampleBuffers, release: 1 }).toDestination();
```

**HISTORY — why this changed.** Samples used to be fetched from `https://tonejs.github.io/audio/
salamander/` and kept only in the WebView's HTTP cache. That made "offline after import"
(`specs/features/offline-storage.md`) true by accident: a cache eviction, or a first play in
airplane mode, meant silence. Bundling costs ~2.4 MB of APK on a sideloaded release with no update
channel, and buys an offline story that is actually true.

**LANDMINE — the expensive one: `fetch()` cannot read `file:` URLs, and Tone.js loads with
`fetch()`.** `ToneAudioBuffer.load` calls `fetch(url)`, and Chromium's Fetch API refuses the `file:`
scheme outright, with a bare `TypeError: Failed to fetch`. Bundled samples resolve to `file://`
URIs, so **every** sample failed to load while `Tone.Sampler` reported no error of its own. Verified
on device: XHR against the exact same URI succeeds where `fetch` fails, so this is a Fetch scheme
restriction and **not** a file-permission problem — no WebView flag fixes it.

The fix is to bypass Tone's loader: read the bytes with `XMLHttpRequest`, decode them with
`decodeAudioData`, and hand `Tone.Sampler` the resulting `AudioBuffer`s. Its `urls` map accepts
`ToneAudioBuffer | AudioBuffer | string` per note, so nothing else changes.

Two things made this hard to see, and both are worth remembering:
- `startPlayback` races `Tone.loaded()` against an 8-second timeout, so a total load failure
  degrades to *silent playback* rather than an error. The transport still runs and the cursor still
  advances.
- The metronome is an oscillator and needs no buffers, so it keeps working. "Metronome yes, notes
  no" is the signature of a sample-loading failure, not a playback failure.

A successful `file://` XHR reports **`status 0`**, not 200 — gate on the response having a body.

**LANDMINE:** `allowFileAccess` defaults to **`false`** in react-native-webview and is still
required on every WebView that plays audio, alongside `allowUniversalAccessFromFileURLs`: the
WebView's `baseUrl` is `file:///android_asset/`, and a `file://` origin needs universal access to
read a `file://` URI from another directory. These are necessary for the XHR to succeed — they were
simply never sufficient, because of the Fetch restriction above.

**LANDMINE:** filename spelling is a per-set convention, not a global one. Salamander writes sharps
with `s` (`D#1` → `Ds1.mp3`); the FluidR3 clarinet uses flats (`Eb3.mp3`). The Sampler key must be
the note name Tone.js understands, so the mapping is written out explicitly in
`src/data/instrumentSamples.ts` — and Metro requires those `require()` paths to be literals anyway,
so the table cannot be generated. `missingSampleNotes` is tested against the registry so a note
declared but not bundled fails CI rather than going silent at runtime.

**Sounding vs written pitch.** The Part callback adds the instrument's `transposeSemitones` before
naming the note, so a Bb clarinet sounds a major 2nd below what is engraved. This is deliberate: the
app is something you play *along with*, and sounding written pitch would put it a whole tone above
the person reading the same notes. See `specs/features/instruments.md`.

## BPM from score: `cursor.Iterator.CurrentBpm`

**PATTERN:** Before iterating through the score to build timelines, read the tempo from the OSMD
iterator:

```typescript
osmd.cursor.reset();
const rawBpm = osmd.cursor.Iterator.CurrentBpm;
const scoreBpm = rawBpm > 0 && rawBpm < 400 ? rawBpm : 120;
```

Send the score BPM to native **before** sending `LOADED` so the native store has the BPM when
transport controls appear. Set `Tone.Transport.bpm.value = scoreBpm` in the WebView immediately;
native only needs to re-send if the user has a non-1.0 multiplier already selected.

## PATTERN: target speed drives the multiplier reference (native side)

The PlayView speed selector (×0.5/×0.75/×1.0) multiplies a **target speed**, not the raw score
BPM. The reference resolves to `piece.targetBpm ?? piece.importedBpm ?? scoreBpm`:

- `importedBpm` is scraped from the MusicXML at import (`domain/musicxml.ts` → `scrapeTempoBpm`):
  an explicit `<sound tempo>` wins, else the first `<metronome>` mark converted to quarter-note
  BPM. It is persisted on the piece so the edit modal can show the file's original speed without
  opening the score. A tempo-less score scrapes to `null` and leaves `importedBpm` **unset** — do
  not fabricate a default, because OSMD's own default for such a score is **100**, not 120, and
  forcing a scraped 120 onto the transport plays it ~20% too fast (regression fixed here).
- `targetBpm` is the user override set in the edit modal.

Native (`app/piece/[id].tsx`) sends `__rn_set_tempo(round(reference × multiplier))` on load — only
when it differs from the score's own BPM, so a piece with no override still plays at its native
tempo — and on every multiplier change. Because `setTempoBpm` clamps to **[20, 240]**, the target
range is bounded **40–240** (`domain/tempo.ts`): ×0.5 of the min (20) and ×1.0 of the max (240)
both land on the clamp edges, so the displayed effective BPM always equals what actually plays —
no silent clamp mismatch.

## OSMD cursor invisible: `#osmd` needs `position: relative`

**LANDMINE:** OSMD appends the cursor element with `position: absolute` inside the `#osmd` div.
If `#osmd` has no positioning context (default `position: static`), the cursor positions itself
relative to the nearest positioned ancestor — usually the `<body>` — which places it at the wrong
coordinates.

**Fix:** Add `position: relative` to the `#osmd` CSS rule in `build.mjs`'s HTML template:

```javascript
<style>
  body { margin: 0; background: white; }
  #osmd { width: 100%; position: relative; }
</style>
```

## OSMD `Fraction.RealValue` is in whole notes — multiply by 4 for quarter notes

**LANDMINE:** `cursor.Iterator.currentTimeStamp.RealValue` and `Note.Length.RealValue` are both
expressed in **whole notes** (1.0 = one whole note = 4 quarter notes). Tone.js PPQ and tick math
use **quarter notes** as the base unit. Passing `RealValue` directly into tick calculations makes
every note event fire 4× too early and every note duration 4× too short — audio plays at 4×
speed.

**Fix:** Multiply by 4 when converting to Tone.js units:

```typescript
const WHOLE_TO_QUARTER = 4;
const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
const durQ     = note.Length.RealValue * WHOLE_TO_QUARTER;
const ticks    = Math.round(quarters * Tone.Transport.PPQ); // correct tick position
```

This applies everywhere OSMD `Fraction.RealValue` feeds Tone.js scheduling or cursor sync math.
See also: **OSMD repeats** section below for why `CurrentEnrolledTimestamp` is used instead of
`currentTimeStamp`.

## `Transport.start(offset)` leaves state `'stopped'` during the offset window

**LANDMINE:** `Tone.Transport.state` is a getter that returns the transport state **at the
current audio context time**. Calling `Transport.start('+0.1')` schedules the transport to begin
100 ms in the future; immediately after the call, `state` still reads `'stopped'` because the
current time is before the scheduled start. Any RAF loop gated on `state !== 'started'` fires at
~16 ms, sees `'stopped'`, and exits — permanently. Audio plays correctly (the Part events are
scheduled with lookahead), but the cursor loop is dead.

**Fix:** Use `Transport.start()` with no offset:

```typescript
Tone.Transport.start(); // state becomes 'started' immediately
```

Tone.js's built-in 100 ms lookahead pre-schedules tick-0 events before they need to fire, so
removing the explicit offset does not cause missed notes.

**Deliberate exception — the count-in.** The count-in feature *requires* a future start time so
the metronome pre-roll can sound before the first note (see "Count-in pre-roll" below). It keeps
the RAF loop alive across the offset window via a `countingIn` flag rather than dropping the
offset. Do **not** "simplify" `Tone.Transport.start(startAt + delaySec)` in `startPlayback` to a
bare `start()` — that removes the pre-roll gap and the piece begins immediately.

## Cursor smooth movement: interpolation-based RAF (Phase 4)

**PATTERN (replaces CSS `left` transition):** The CSS `left` transition approach causes visible
misalignment in one-line mode: OSMD's cursor element jumps to the next beat position instantly
(since `cursor.next()` updates `style.left` immediately), while the CSS transition animates the
element over the next beat duration. In one-line mode the fixed `#cursor-line` div is always at
screen center, so the cursor element must stay there too — any lag is immediately obvious.

**Fix:** Use a 60fps RAF loop that interpolates between beat positions each frame, then sets
BOTH the cursor element's `style.left` AND the score's `translateX` to the same interpolated
pixel value:

```typescript
function animateCursorLoop(): void {
  const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;
  // binary-search cursorSteps[] for the current beat
  const step = findStep(quartersElapsed);
  const currPx = cursorSteps[step].pxLeft;
  const nextPx = cursorSteps[step + 1]?.pxLeft ?? currPx;
  const fraction = (quartersElapsed - cursorSteps[step].quarters)
                 / (cursorSteps[step + 1]?.quarters - cursorSteps[step].quarters);
  const px = currPx + Math.min(1, fraction) * (nextPx - currPx);

  // Both the cursor element and the score translate to the same px — they stay aligned.
  cursorElement.style.left = `${px}px`;
  osmdEl.style.transform = `translateX(${viewportWidth / 2 - px}px)`;

  animFrameId = requestAnimationFrame(animateCursorLoop);
}
```

Key points:
- `cursorSteps[i].pxLeft` is captured at build time via `parseFloat(el.style.left || '0')`,
  **not** `el.offsetLeft` (which returns integers and rounds).
- OSMD iterator advancement (`cursor.next()`) is kept separate from translation; call it only
  when the step index changes.
- Never use `osmdEl.style.transition` for the score translateX — that re-introduces lag.

Access the cursor element:
```typescript
const el = (osmd.cursor as unknown as { cursorElement?: HTMLImageElement }).cursorElement;
```

## OSMD tied notes: skip continuation notes — only the start note triggers an attack

**LANDMINE:** `cursor.NotesUnderCursor()` returns ALL notes at the cursor position, including the
second (and later) notes of a tie. Scheduling a new `triggerAttackRelease` on a tie continuation
produces a double-attack — the note re-strikes audibly mid-sustain.

**Fix:** Skip any note whose tie's start note is not itself:

```typescript
if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
```

`Tie.StartNote` is a public getter on OSMD's `Tie` class. `note.NoteTie` is falsy (null/undefined)
for non-tied notes despite being typed as `Tie` (not `Tie | undefined`), so the `&&` guard is
required.

**Second half of the same rule — the half that was missing until `feat/instruments`:** skipping the
continuations is only correct if the start note is then held for the *whole chain*. `Note.Length`
is that note's OWN length, never the group's; the combined value lives on the tie as
`Tie.Duration`. Both are `Fraction`s in whole notes.

Verified against OSMD 1.9.9 by loading a score headlessly and reading both fields: two tied whole
notes give `Note.Length.RealValue` 1 and `Tie.Duration.RealValue` 2. `Tie.Duration` sums unequal
chains correctly (quarter + eighth = 0.375) and spans barlines.

Sounding `Note.Length` therefore cut every tied note to a *fraction* of its notated value — a half
for a two-note tie, a third for three, a quarter for four. It went unnoticed because a piano sample
has decayed to inaudibility long before the shortfall matters. The rule now lives in
`client/src/domain/ties.ts` (`soundingLengthWholes`) with unit tests, because `score-web/` is
outside tsc and Jest.

**Third part, from the Long Note exercise — writing a tie is not symmetric with reading one.**
Until that exercise nothing in the app *emitted* a tie; the rules above are all about parsing
imported MusicXML. Two things bite when generating one.

`<tie>` and `<tied>` are different elements and both are required. `<tie>` (a direct child of
`<note>`) is the sound; `<tied>` (inside `<notations>`) is the printed slur. **OSMD builds
`Note.NoteTie` from `<tied>` only** — its reader walks `notations.elements("tied")` and never looks
at `<tie>`. A chain written with `<tie>` alone therefore leaves `NoteTie` null on every note, the
skip rule above never fires, and the pitch re-attacks at every barline while looking perfectly tied
on screen. Emitting `<tied>` alone happens to work in this app but is wrong for anything else
reading the file. Write both.

Element order inside `<note>` is fixed by the schema: pitch, duration, tie, type, notations. That is
why `tiedWholeNote` in `warmupMusicXml.ts` is a separate builder rather than an append to
`wholeNote()` — appending would put `<tie>` after `<type>`. On a middle note the stop precedes the
start, in both elements.

Together with the sustain loop below, this is what makes a long tone work: a two-bar tie at 60 BPM
is eight seconds, and the raw clarinet sample is 3.13.

## LANDMINE: a sustained-instrument note cannot outlast its sample — `Tone.Sampler` never loops

`Tone.Sampler` has no loop option (`SamplerOptions` is `attack | release | onload | onerror |
baseUrl | curve | urls`). It plays a one-shot `ToneBufferSource`; when the buffer ends, the sound
ends, whatever duration `triggerAttackRelease` was given. `release` only shortens — it can never
extend past the buffer.

Measured lengths of the bundled sets (`afinfo`/`ffprobe`, not header arithmetic — the clarinet
files all report a misleading 128 kbps and are actually ~65 kbps):

| set | length | envelope |
|---|---|---|
| `fluidr3-clarinet` | **3.13 s**, every file identical | flat ~−28 dBFS throughout, then a hard cut — no decay |
| `salamander-piano` | 4–25 s | natural decay; −24 dBFS at onset, −55 dBFS by 1.25 s |

So a clarinet note stops sounding after 3.13 s no matter what the score says. At 60 BPM that is
just over three beats, which is what long-tone drills expose. **This is not specific to tied
notes**: any single clarinet note longer than 3.13 s truncates — a whole note below ~77 BPM, a
dotted half below ~58 BPM, a half note below ~39 BPM.

Piano is not immune in principle, only in practice: its samples decay to inaudibility well before
they run out, so the truncation is never heard.

**Do not "fix" it by re-triggering the sample.** That is audible as a re-attack, which is exactly
what the tie rule above exists to avoid. Longer samples were also rejected: the current sets
exactly meet the ~2.4 MB bundled-audio budget. The fix that shipped is the next entry.

## PATTERN: crossfade-loop a sample by pre-blending it once at load

`Tone.Sampler` cannot loop, but the node underneath it can. `AudioBufferSourceNode` has `loop`,
`loopStart` and `loopEnd` built in, and `Tone.ToneBufferSource` exposes all three. So the shape of
the fix is: **do the looping natively, and make the wrap seamless by editing the buffer, not by
juggling voices.**

Per channel, with loop start `S`, loop end `E` and crossfade `F`, all in frames:

```
for i in [0, F):
  buf[E - F + i] = orig[E - F + i] * cos(i/F * π/2) + orig[S - F + i] * sin(i/F * π/2)
```

The material immediately before `E` has then already been blended toward the material immediately
before `S`, so the frame the loop plays last leads into `S` exactly as `S`'s own predecessor does.
This runs **once per buffer at decode time**, so there is nothing per-note at runtime and still
exactly one voice per note. `src/score-web/sustainLoop.ts` (pure, unit-tested — `score-web/` is
outside tsc and Jest) does the maths; `score-web/src/loopingSampler.ts` plays it.

Four things that are easy to get wrong:

- **`loopStart`/`loopEnd` are in *buffer* seconds and are unaffected by `playbackRate`.** A
  pitch-shifted note needs no scaling of them.
- **`ToneBufferSource.start` defaults a *looping* source's offset to `loopStart`.** Pass an
  explicit `0` or every note skips its own attack.
- **Blend before the buffer is ever played.** Assigning an `AudioBuffer` to a source node's
  `buffer` "acquires the contents" and detaches its `ArrayBuffer`s, after which `getChannelData`
  hands back an empty array. Decode → blend → hand to the player is the only safe order.
- **A looping voice does not end by itself.** Its stop is scheduled at the note's end, which on a
  long tone is seconds away, so `_stopInternal` and `pausePlayback` must release the player's
  voices or the clarinet sounds on after the transport has stopped. One-shots never needed this,
  which is why the Sampler path has no equivalent.

**Equal-power (`cos`/`sin`) fades, not linear — and the seam is still not perfectly flat.** One set
of bounds is declared per *sample set* and applies to all of its pitches, so the loop length is not
a whole number of periods for any particular note and the two blended copies meet at an effectively
arbitrary phase. Equal power keeps the expected energy flat across that; linear would dip wherever
they are out of phase. What remains is a level modulation over the 0.2 s seam — measured on the
clarinet set, offline, against the shipped code: **typically 2–3 dB, worst case −7.4 dB on A4**
(comb cancellation) **and +2.9 dB on C6**. The discontinuity at the wrap itself is always *smaller*
than a typical inter-frame step inside the loop, i.e. there is no click.

**Do not try to tune the bounds against that modulation.** It was swept: moving `endSec` by 5 ms
moves the worst case anywhere between 4.7 dB and 12.6 dB with no pattern, because the phase
relationship at the seam is chaotic in the bounds. It also reshuffles under a different mp3
decoder, so any value found this way is fitted to the measuring tool. The only real cure would be
snapping the loop length **per buffer** to a whole number of that sample's own fundamental period
(pitch detection at load), which was not done. Choose the bounds on the stable criteria instead —
clear of the onset, clear of the end, as long as possible — and take the modulation.

**Why the piano keeps `Tone.Sampler`.** A Salamander sample decays from about −24 dBFS at the onset
to −55 dBFS by 1.25 s; looping any part of it would hold a dead tail open. A piano note is supposed
to stop. Routing it through the new player would also have meant re-deriving its attack, release
and voice handling for no gain, so the registry's `sustainLoop` being absent is what selects the
Sampler, and the piano path is byte-for-byte what it was.

## OSMD repeats: use `CurrentEnrolledTimestamp`, not `currentTimeStamp`

**LANDMINE:** `Iterator.currentTimeStamp` is an alias for `CurrentSourceTimestamp` — the note's
position in the **printed score**. On the second pass through a repeated section the source
timestamp is identical to the first pass. Scheduling with it causes both passes to fire at the same
Tone.js tick; the repeat sounds identical to no repeat at all.

`Iterator.CurrentEnrolledTimestamp` is the **unrolled** playback timeline (increases monotonically
across back-jumps). Use it for both note scheduling and cursor step timing:

```typescript
const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
```

OSMD's cursor iterator follows repeats by default (`EngravingRules.CursorIgnoreRepetitions = false`).
`cursor.next()` performs back-jumps automatically; the enrolled timestamp correctly reflects the
resulting linear timeline offset so `Tone.Part` events and cursor steps are both sequenced
correctly.

## LANDMINE: anything built by walking the cursor is in playback order, not score order

The same back-jumps mean **a repeated measure is visited more than once**. Any array appended to
inside the `while (!EndReached)` walk therefore holds one entry per *pass*, not per printed measure:
`measureMeta` in `playback.ts` is the unrolled timeline, not the page.

Indexing such an array with a printed-score measure number is silently correct up to the first
repeat and wrong after it — the failure is invisible on a score without repeats, which is exactly
what a first test file tends to be. Section boundaries hit this: they arrive from `domain/sections.ts`
as 0-based indices into the MusicXML measure list, and a boundary past a repeat resolved to the
second pass of an earlier measure.

Two safe ways to consume the walk:

- **Look up by tick, not by index** — `measureAtTicks()` scans for the last measure starting at or
  before a tick, so the duplicates are harmless.
- **Key by printed index while walking** — `Iterator.CurrentMeasureIndex` indexes
  `Sheet.SourceMeasures` (the printed score) and is rewound by the iterator on a back-jump, so
  recording only the first visit per index gives a printed-measure → tick table. This is what
  `firstTicksBySourceIndex` is.

Do not reach for `SourceMeasure.measureListIndex` instead: it is a graphical-layer field, whereas
`CurrentMeasureIndex` is literally the index the iterator uses to fetch `CurrentMeasure`
(`currentMeasure = musicSheet.SourceMeasures[currentMeasureIndex]`).

## LANDMINE: backward OSMD cursor seek inside RAF loop causes visual stall proportional to piece length

**LANDMINE:** OSMD has no random-access seek. Moving the cursor backward requires `cursor.reset()`
followed by N calls to `cursor.next()` to reach the target position. For a 30-measure piece with
a loop near the end, N can exceed 200; at ~0.5 ms per call this is 100+ ms of synchronous
main-thread work.

Every loop wrap triggers a backward seek from the loop-end step back to the loop-start step.
Calling this inside `animateCursorLoop` blocks the RAF frame from returning, so the visual update
(`el.style.left` + `translateX`) and Tone.js transport tick reads are both delayed. The lag grows
linearly with piece length — a short piece or early loop is fast; a 30+ measure piece with a loop
near the end stalls for hundreds of milliseconds per wrap. Deferring via `setTimeout(0)` does not
help: the stall moves to a macrotask that still blocks the next RAF frame from being scheduled.

**Fix:** Do not advance the OSMD cursor iterator inside the RAF hot path at all. The cursor
element's visual position is driven by `cursorSteps[step].pxLeft` written directly to
`el.style.left` every frame — OSMD's internal iterator state contributes nothing to rendered
output (the cursor element is `visibility: hidden`; we override its `style.left` every frame
anyway). In `animateCursorLoop`, only update `currentCursorStep = targetStep`. Reserve
`advanceCursorTo` for `startPlayback` and `_stopInternal`, where it runs before
`Transport.start()` and any synchronous cost is a one-time charge, not a per-wrap stall.

Track the actual OSMD cursor position in a separate `osmdActualIdx` variable (updated in
`advanceCursorTo`) so forward seeks from `startPlayback` can compute the right delta without
relying on `currentCursorStep` (which now reflects the visual step, not the OSMD iterator step).

## One-line OSMD layout: `PageWidth` alone is not enough (Phase 4)

**LANDMINE:** Setting `osmd.EngravingRules.PageWidth = 10000` prevents automatic line wrapping
based on measure widths, but **MusicXML `<print new-system="yes"/>` and `<print new-page="yes"/>`
attributes still force system/page breaks** at mid-score. Pieces like Bach Prelude I (m.28) and
Mozart Rondo alla Turca (m.60) exhibit this.

**Fix:** Set all three rules before every `osmd.load()`:

```typescript
osmd.EngravingRules.PageWidth = 10000;
osmd.EngravingRules.NewSystemAtXMLNewSystemAttribute = false;  // ignore <print new-system>
osmd.EngravingRules.NewSystemAtXMLNewPageAttribute = false;    // ignore <print new-page>
osmd.EngravingRules.RenderSingleHorizontalStaffline = true;    // OSMD's own layout enforcer
```

All three must be set on every `__rn_load_xml` call (not just once at construction) because
`disposePlayback()` may reset rendering state between loads.

## OSMD cursor element dimensions: read `getAttribute('height')`, not `style.height` (Phase 4)

**LANDMINE:** In `Cursor.updateWidthAndStyle`, OSMD sets the cursor element's height as:
```javascript
r.height = 10 * systemHeightInUnits * zoom;  // sets the img IDL attribute, NOT style.height
```
`style.height` is never set. Reading `parseFloat(cEl.style.height || '0')` always returns 0.
`cEl.offsetHeight` and `getBoundingClientRect().height` both return the CSS-computed height,
which may reflect the parent container height rather than the staff system height if any
ancestor has an explicit height.

**Fix:** Read the HTML attribute value directly:
```typescript
const systemH = parseInt(cEl.getAttribute('height') ?? '0', 10);
```
This bypasses CSS-computed height and returns exactly what OSMD wrote.

Also: `style.top` IS set by OSMD (as `10 * y * zoom + "px"`), so `parseFloat(cEl.style.top)`
reliably gives the system's Y offset within the container.

## Vertical score positioning: OSMD title/composer offsets the system (Phase 4)

**LANDMINE:** OSMD renders title, composer, and subtitle above the staff system with top margins.
The cursor element's `style.top` gives the system Y offset (e.g. 179px for Prelude I, 600px+ for
scores with more metadata). Without correcting for this, the staff system can appear near the
bottom of the viewport or scroll off-screen entirely for metadata-heavy scores.

**Primary fix (Phase 5):** Suppress OSMD metadata rendering entirely — set before every `load()`:
```typescript
osmd.EngravingRules.RenderTitle = false;
osmd.EngravingRules.RenderSubtitle = false;
osmd.EngravingRules.RenderComposer = false;
osmd.EngravingRules.RenderLyricist = false;
osmd.EngravingRules.RenderCopyright = false;
```
Also pass `drawTitle: false, drawComposer: false` in the `OpenSheetMusicDisplay` constructor.
The native layer shows piece metadata; the WebView shows notation only. Suppressing metadata
eliminates the `systemTop` offset for most scores.

**Secondary fix (belt-and-suspenders):** After `initPlayback` measures `systemTop` and `systemH`,
vertically center the staff in case any residual offset remains:

```typescript
const viewportHeight = window.innerHeight;
const centeredTop = Math.round((viewportHeight - systemH) / 2);
if (osmdEl) osmdEl.style.top = `${centeredTop - systemTop}px`;
```

This slides `#osmd` up so the staff system appears at `centeredTop` from the WebView top,
regardless of how much title/composer space OSMD allocated. The native header already displays
piece title and composer, so OSMD's title region scrolling off the top is acceptable.

Elements inside `#osmd` (loop handles, shade, OSMD cursor) are positioned relative to `#osmd`
and auto-correct without additional adjustment. The horizontal `translateX` on `#osmd` (for
score scrolling) is independent of `style.top` and is not affected.

## Loop overlay sizing: use cursor element, not `#osmd.offsetHeight` (Phase 4)

**LANDMINE:** The loop shade (`#loop-shade`) and handles (`.loop-handle`) are absolutely
positioned inside `#osmd`. Setting their `height: 100%` in CSS, or reading `#osmd.offsetHeight`
to set a JS height, both return the full SVG canvas height (viewport-height-sized) rather than
the staff system height. This makes the loop overlay span the full screen.

**Fix:** Use the cursor element's measurements from `getAttribute('height')` and `style.top`
for both `height` and `top` on all overlay elements:

```typescript
const systemTop = parseFloat(cEl.style.top || '0');
const systemH = parseInt(cEl.getAttribute('height') ?? '0', 10);
for (const el of [handleAEl, handleBEl, shadeEl, sectionMarksEl]) {
  if (!el) continue;
  el.style.top = `${systemTop}px`;
  el.style.height = `${systemH}px`;
}
```

The section-mark container (`#section-marks`) goes through the same call for the same reason. Its
children are the only overlay elements sized with `height: 100%` in CSS, and that is safe *because*
their parent's height is set here — they inherit the staff system height, not the SVG canvas.

Set these in `initPlayback` immediately after `cursor.show()` (which triggers
`updateWidthAndStyle` internally and populates the cursor element's position data).
Do **not** set `height` in CSS — leave it unset so the JS values are unambiguous.

## LANDMINE: `score-web/` edits are invisible until the bundle is rebuilt

`score-web/build.mjs` compiles `src/index.ts` (and its imports: `playback.ts`, `types.ts`) into
`client/src/score-web/html.ts` — an auto-generated TypeScript module that the React Native app
embeds in the WebView. The WebView's HTML shell — markup and CSS for the cursor line and the loop
overlay (`#loop-shade`, `.loop-handle`) — lives in the `HTML_TEMPLATE` literal inside `build.mjs`
itself, so template-only edits need the same rebuild. **No edit under `score-web/` takes effect in
the running app until the bundle is rebuilt.**

```bash
cd client && npm run build:score-web
```

This is easy to miss because the source files look like live TypeScript. Always add a rebuild
step to any task that touches `client/score-web/**`.

## PATTERN: Metronome via `scheduleRepeat` + raw Web Audio oscillator per tick

Do **not** create a persistent `Tone.Synth` for the metronome. Synth nodes (and any
`Tone.AudioNode`) created while the `AudioContext` is still `suspended` (before the user's first
`Tone.start()` call) silently fail to produce sound — the node graph is built against a suspended
context and does not recover correctly after resume.

**Fix:** create a fresh `OscillatorNode` + `GainNode` pair inside each `scheduleRepeat` callback.
By the time the callback fires, the transport is running and `AudioContext` is active:

```typescript
metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
  const ctx = Tone.getContext().rawContext as AudioContext;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = isDownbeat ? 1500 : 1000;
  gainNode.gain.setValueAtTime(isDownbeat ? 0.45 : 0.2, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}, '4n', 0);
```

Use `Tone.Transport.clear(id)` to cancel on toggle-off or dispose.

### LANDMINE: the repeat is unbounded, and its clicks cannot be taken back

Both halves of the pattern above have a cost, and together they produce a click **after** the piece
ends — one beat too many, landing exactly as it finishes:

- `scheduleRepeat` has **no end bound**. It clicks for as long as the transport runs.
- A click is a raw `OscillatorNode` with `osc.start(futureTime)`, scheduled ahead of the playhead by
  Tone's lookahead. It is committed to the audio graph, outside Tone's control.

So `Transport.stop()` cannot silence it. By the time the RAF loop sees `quartersElapsed >=
totalQuarters` and calls `_stopInternal()`, the click on the closing barline has already been
started, and stopping the transport does not unschedule a Web Audio node. Measured on a two-bar
C major scale (`totalQuarters` 8): clicks at quarters 0…8, the one at 8 being the downbeat of a
measure that does not exist.

**Fix:** refuse the click while it is still only *scheduled*, inside the callback, against the
click's own tick rather than the live transport position — `domain/transportTicks.ts`'s
`metronomeClickSounds`:

```typescript
const ticks = Math.round(Tone.Transport.getTicksAtTime(time));
if (!metronomeClickSounds({ clickTicks: ticks, pieceEndTicks: totalQuarters * TONE_PPQ })) return;
```

The tolerance is a whole tick — the same "filed one tick early" defect the loop fence backs off
from, so the comparison meets the click where Tone files it rather than where the beat is.

**Do not try to fix this by stopping the transport earlier.** The RAF loop is the wrong instrument:
it runs a frame late by construction, and it does not run at all when frames are throttled — a
backgrounded WebView or a locked screen left the metronome clicking indefinitely (observed running
to quarter 44 of an 8-quarter piece). The guard above is what actually bounds the metronome; the
RAF stop only ends playback.

### Set it, don't toggle it — and only after the load

The web side exposed `toggleMetronome()` and nothing else. That is enough for a toolbar button
whose whole job is to flip whatever state the WebView is in, and unusable the moment the setting
comes from *data*: a routine that stores `metronome: true`, or a piece that remembers the click
from its last session, needs the metronome driven to a **known** state, and a blind toggle
inverts it whenever the WebView happens to disagree. `setMetronome(enabled)` is now the
primitive and `toggleMetronome()` delegates to it.

Native then mirrors its own state into the WebView rather than firing and forgetting:

```typescript
useEffect(() => {
  if (!scoreReady) return;
  webViewRef.current?.injectJavaScript(`window.__rn_set_metronome(${metronomeOn});void 0;`);
}, [scoreReady, metronomeOn]);
```

**LANDMINE:** the injection has to wait for the score *load*, not merely `webViewReady`.
`startMetronome` reads `downbeatTicks`, which `initPlayback` builds during the cursor walk —
set the metronome before that and `scheduleRepeat` is armed against an empty set, so every
click is unaccented until something re-schedules it. Keying the effect on "score loaded" also
re-asserts the setting after any reload, which is what a one-shot injection on the `LOADED`
message quietly gets wrong.

## LANDMINE: `'@4n'` quantize syntax is NOT valid as `scheduleRepeat`'s `startTime`

Tone.js's `'@4n'` notation ("next quarter-note boundary") works for `Transport.schedule()` but
**silently produces no events when passed as the `startTime` argument to `scheduleRepeat()`**
while the transport is running. The call appears to succeed (returns an ID) but nothing fires.

**Fix:** always pass `startTime = 0`. `scheduleRepeat` with `startTime = 0` fires at absolute
transport positions 0, 4n, 8n, … When the transport is already past 0, Tone.js skips all past
firings and fires at the next interval multiple — so the phase is always locked to the beat grid:

```typescript
// Transport at position 5.3n → first fire at 8n (next multiple of 4n from 0). ✓
metronomeEventId = Tone.Transport.scheduleRepeat(callback, '4n', 0);
```

## PATTERN: Downbeat detection via `Iterator.CurrentMeasure` reference tracking

`Tone.Transport.timeSignature` is always 4/4 by default — it is not read from the MusicXML.
Do **not** use modulo arithmetic against `timeSignature` to find downbeats; it will be wrong for
3/4, 6/8, 5/4, and mid-score signature changes.

**Fix:** during `buildTimelines`, compare `osmd.cursor.Iterator.CurrentMeasure` by object
reference across cursor steps. Each reference change is a new measure boundary; record that tick
position in a `Set<number>`:

```typescript
let lastMeasure: unknown = null;
const downbeatTicks = new Set<number>();

while (!osmd.cursor.Iterator.EndReached) {
  const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
  const measure = osmd.cursor.Iterator.CurrentMeasure as unknown;
  if (measure !== lastMeasure) {
    lastMeasure = measure;
    downbeatTicks.add(Math.round(quarters * TONE_PPQ));
  }
  // ... rest of walk
}
```

In the metronome callback, snap the scheduled tick to the nearest beat and look it up:

```typescript
const ticks = Tone.Transport.getTicksAtTime(time);
const nearestBeat = Math.round(ticks / TONE_PPQ) * TONE_PPQ;
const isDownbeat = downbeatTicks.has(nearestBeat);
```

Works for any time signature and handles mid-score changes automatically.

## LANDMINE: scroll clamp must use `cursorSteps` extremes, not raw `scoreWidth`

Clamping `translateX` to `[viewportWidth - scoreWidth, 0]` limits the score so its left edge
reaches the screen left and its right edge reaches the screen right. But the cursor line is fixed
at screen centre — at either boundary the cursor line sits over blank space, not a note.

**Fix:** clamp to `[viewportWidth/2 - pxLast, viewportWidth/2 - px0]` — the first cursor step at
one end and the snap grid's terminal at the other, both computed in `recomputeViewportMetrics`:

```typescript
const px0 = cursorSteps[0]?.pxLeft ?? 0;
const pxLast = snapGrid[snapGrid.length - 1]?.pxLeft ?? ...;
scrollMaxPx = viewportWidth / 2 - px0; // first note centred
scrollMinPx = viewportWidth / 2 - pxLast; // closing barline centred
```

**Secondary LANDMINE (same root cause):** On load, `applyTranslate(viewportWidth/2 - px0)`
sets a positive `translateX` (first note at centre). The old clamp's max of `0` was lower than
this value, so any `touchmove` event — even a zero-delta tap — clamped the offset to `0` and
snapped the score to the left edge. The corrected `scrollMaxPx` bound is always ≥ the initial
translateX, so no snap occurs.

**The right bound is the terminal, not the final onset — and it has to be.** This used to say the
opposite ("the playhead must never park there"), which stopped being true once the last note began
gliding to the closing barline over its sounding length: with the bound at the final onset the score
spent that whole note outside its own pan range, so pausing on it and then panning yanked the score
right by a barline. The bound follows the playhead.

It still puts the centre line nowhere the playhead cannot go, which is what the bounds are for.
Nothing sounds past the final onset and nothing needs to — **the settle is still onsets-only**
(`nearestGridIndex(cursorSteps, ...)`), so a pan into the closing bar glides back onto the last note
rather than sticking in the gap. Keep those two apart: bounds follow the playhead, the settle follows
the notes.

**One dependency chain, one place.** The viewport fixes the terminal's reachable pixel, and the
terminal fixes `scrollMinPx`, so `recomputeViewportMetrics` calls `rebuildSnapGrid` itself between
the two. Do not rebuild the grid anywhere else on a resize — the bounds would be left a resize behind
the terminal they are derived from.

## Fermata: expand the tick timeline, don't just extend the note duration

**LANDMINE:** Extending `durQ` for a fermata note makes it sound longer, but the next note
is still scheduled at the original tick. The sustained tail is masked — the listener hears
the next note as "too early", not a held fermata.

**Fix:** Track a `tickShift` accumulator. After each fermata position, add
`round(normalDurQ * (FERMATA_MULTIPLIER - 1) * PPQ)` to `tickShift`. All subsequent note
events and cursor steps use `expandedQuarters = quarters + tickShift / PPQ` so the next
note only fires after the fermata expires.

No hold step is inserted. The interpolation between the fermata note's step and the next
note's step spans the full expanded duration, so the cursor drifts slowly toward the next
note during the hold instead of freezing on the fermata symbol — matching visual motion to
playback. `advanceCursorTo` uses `CursorStep.osmdIdx` — not the array index — to count
`cursor.next()` calls; each step has a unique `osmdIdx` so forward seeks work correctly.

**Detection:** `note.ParentVoiceEntry.Articulations` contains `Articulation` objects;
check `a.articulationEnum === ArticulationEnum.fermata` (10) or `invertedfermata` (11).
Both `ArticulationEnum` and `ArpeggioType` must be **value imports** (not `import type`)
from `opensheetmusicdisplay` since the enum members are needed at runtime.

## Arpeggio chord rolling: group by `VoiceEntry.Arpeggio`, stagger by `ArpeggioType`

**PATTERN:** `note.ParentVoiceEntry.Arpeggio` returns the chord's `Arpeggio` object.
Notes in the same voice entry share the same object reference — use it as a `Map` key.
Sort the group ascending (UP / directionless) or descending (DOWN types) by `halfTone`,
then schedule each note at `baseTicks + i * ARPEGGIO_STEP_TICKS`. Six ticks (~15 ms at
120 BPM) per step produces a perceptible roll without audibly delaying the chord.

## PATTERN: momentum scroll — EMA velocity + time-based exponential deceleration

Track drag velocity in `touchmove` with an exponential moving average so brief direction
reversals don't corrupt the end-of-drag velocity:

```typescript
const inst = (clientX - lastMoveX) / dt; // px/ms instantaneous
velocityPx  = velocityPx * 0.7 + inst * 0.3; // EMA (α = 0.3)
```

On `touchend`, if `|velocityPx| > 0.05`, fire a RAF loop with time-based deceleration so the
rate is frame-rate independent:

```typescript
const MOMENTUM_DECELERATION = 0.95; // per 16 ms — increase toward 1 for a longer glide

function step(now: number): void {
  const dt = Math.min(now - lastTime, 64); // cap: avoid jump after tab hide/show
  lastTime = now;
  velocity *= Math.pow(MOMENTUM_DECELERATION, dt / 16);
  if (Math.abs(velocity) < 0.05) { settleToNearestStep(true); return; }
  const next    = scrollOffsetPx + velocity * dt;
  const clamped = clampTranslate(next);
  applyTranslate(clamped);
  if (clamped !== next) { settleToNearestStep(true); return; } // boundary hit
  momentumFrameId = requestAnimationFrame(step);
}
```

The coast is unchanged by the snap work — it still runs free, and the preview line simply tracks the
nearest onset through it. Call `settleToNearestStep(true)` whenever momentum stops (naturally, at a
boundary, or on cancel); see the next entry for what that does and why the ordering matters.

## PATTERN: commit the logical position, animate only the pixels

**This is the fix for "the cursor jumps backwards when I press play after scrolling."**

The old `syncCursorToCenter` wrote `Tone.Transport.ticks`, `currentCursorStep` and the cursor
element's `style.left` to the snapped step — but never called `applyTranslate`. The score kept
whatever arbitrary offset the finger produced while the playhead had already been rounded back to
the previous note, and the first frame of `animateCursorLoop` yanked the score onto the snapped note.
The rounding was always backwards (`nearestStepToPx` was a floor search despite its name), so the
error only ever went one way.

`settleToNearestStep(animate)` commits the logical position **synchronously**, then animates only
`translateX`:

```typescript
const step = nearestGridIndex(cursorSteps, viewportWidth / 2 - scrollOffsetPx);
currentCursorStep = step;                       // 1. logical position, immediately
Tone.Transport.ticks = Math.round(target.quarters * TONE_PPQ);
if (el) el.style.left = `${target.pxLeft}px`;
emitSectionIfChanged(Tone.Transport.ticks);
startScoreGlide(step, hideSnapPreview);          // 2. pixels only
```

Two consequences worth keeping:

- Transport and translate can never disagree at rest, so the whole class of bug is structurally gone.
- **Pressing play mid-glide is safe.** `startPlayback` calls `cancelScoreGlide(true)`, the transport
  is already correct, and the RAF loop's first `applyTranslate` lands exactly where the glide was
  heading. Nothing jumps in either path.

The glide holds its target as a **step index**, not a translate value, and re-derives
`viewportWidth / 2 - pxLeft` every frame — a resize mid-flight would otherwise fly to an offset
computed for the old viewport.

**LANDMINE: the RAF cancellation matrix.** Four RAF loops now exist and three of them write
`scrollOffsetPx`, so they must be mutually exclusive:

| Loop | Variable | Writes translate |
|---|---|---|
| Playback cursor | `animFrameId` | yes |
| Momentum coast | `momentumFrameId` | yes |
| Settle glide | `glideFrameId` | yes |
| Handle drag | `dragRafId` (per handle) | yes, via edge-scroll |

`cancelScoreGlide(commit)` must run from `initTouchHandlers`' `touchstart` (abandon — the finger is
about to drive the score), both handles' `touchstart` (**commit**), `startPlayback` (commit),
`createLoop` (commit), `setActiveHand` (commit), `onViewportResize` (commit, *after*
`recomputeViewportMetrics`), `seekSection`, `_stopInternal` and `disposePlayback` (abandon).

**LANDMINE: cancelling a coast is not the same as resolving it.** Momentum moves *pixels only* —
the transport, `currentCursorStep` and the cursor element are not written until a settle runs. So
anything that acts on the playhead while momentum is live must call `settleFromCoast(animate)`, not
just `stopMomentum()`. Creating a loop mid-coast is the case that exposed this: `createLoop` snaps
its handles from the grid and so places them perfectly, while the score stayed parked between two
onsets and the cursor sat visibly behind handle A. `startPlayback` had the same shape — play from the
toolbar during a coast started from whatever tick the *previous* settle wrote, and the first RAF
frame dragged the score back there.

Which of the two to use:

| Caller | Call | Why |
|---|---|---|
| `createLoop` | `settleFromCoast(true)` | Cursor glides onto the grid while the loop unfurls from that same on-grid position |
| `startPlayback`, `setActiveHand` | `settleFromCoast(false)` | Both drive the translate themselves immediately after; a glide would just fight them |
| wrapper `touchstart` | `stopMomentum()` | The finger is taking over — resolving would be undone by the drag about to start |
| handle `touchstart` | `stopMomentum()` | A settle would slide the score under a finger holding a handle still, and editing a handle sets `loopModified` so the next play seeks to A anyway |
| `seekSection`, `_stopInternal`, `disposePlayback` | `stopMomentum()` | The position the coast was heading for is about to be replaced or rewound |

The nastiest of these is the **handle `touchstart`**: it calls `stopPropagation`, and the wrapper's
own handler bails on `.loop-handle` targets anyway, so nothing there cancels momentum or the glide.
Before this was added, grabbing a handle during a coast let the score keep sliding under a held
finger — and because `dragFrame` re-projects the finger through the *current* `scrollOffsetPx`, the
handle looked correct while the score drifted, which is very hard to read as a bug.

## Loop boundary ticks come from half-open grid indices

**PATTERN:** A loop is a half-open range of snap-grid indices — `aStep` is the first note played,
`bStep` the first target *not* played — and `loopFromSteps` derives pixels and ticks from that pair.
`loopRegion.aPx/bPx/aTicks/bTicks` are caches, never edited on their own.

That reading reproduces the tick rules the old pixel-based helpers were reaching for, without any of
their special cases:

- `aTicks` is an onset's own ticks. The deleted `pxToLoopStartTicks` used a *ceiling* search to get
  there, because a floor would have included notes just before A that the user meant to exclude.
  A now **is** a note, so there is nothing to round.
- `bTicks` is the ticks of the first excluded target — literally the deleted `pxToLoopEndTicks`'s
  "step AFTER the last included note" rule. Setting `loopEnd` to the last *included* note's ticks
  makes Tone fire the wrap at the moment that note is scheduled, so it never sounds.
- The old end-of-piece fallback (`totalQuarters * TONE_PPQ` when B was on the final note) is now the
  terminal target's own `quarters`. `buildSnapGrid` normalises it to at least
  `lastOnset + LOOP_MIN_QUARTERS`, which is what makes `clampLoopIndices` total: dragging B to the
  end always yields a legal loop, so the final note is always loopable.

`ceilStepToPx`, `pxToLoopStartTicks`, `pxToLoopEndTicks` and `nearestStepToPx` are all gone.
`ticksToStep` stays a floor search — the RAF interpolation depends on it.

**LANDMINE: never round-trip a step through ticks.** `ticksToStep(Math.round(q * TONE_PPQ))` floors
over `quarters`, and the `round` can go *up*, so the trip lands on the **previous** step wherever a
position is not an exact tick multiple — tuplets, mostly. `seekToStep(step, ticks?)` exists for this:
wherever the caller already knows the index, pass the index. `startPlayback`'s seek to loop A goes
through it, otherwise a loop starting on a triplet would begin one note early.

## A measure's first onset is anchored to its barline — one pixel at rest, two in motion

**PATTERN:** `buildTimelines` records each measure-opening step's barline (`measureBoundsPx`) and
`anchorToBarlines` (`domain/scoreGrid.ts`) writes the result into `CursorStep.pxLeft`. That is the
**placement** pixel, and at rest it is the only one: the snap search, the settle, the seek, the
preview line, the loop overlay, `pxAtTicks` for section seams and the scroll clamp all read it.
**Never split those apart** — one shared value is what stops the resting playhead and the loop
handles disagreeing.

The raw notehead pixel survives alongside it as `CursorStep.notePxLeft`, and the RAF playback
interpolation is the **only** reader, through `motionPxLeft` (`domain/scoreGrid.ts`).

**Why the split exists, after this note spent a release forbidding it.** The original rejection was
right about its defect and wrong about the cost:

- *Right:* a naive split parks the playhead ~22 px inside the loop shade at every loop start and
  wrap — the off-grid cursor bug the grid was built to kill, made permanent. `motionPxLeft` avoids
  it by re-anchoring at exactly the two positions the playhead *arrives* at rather than flows
  through: `loopRegion.aStep`, and the step a fresh start began on. **Remove either exception and
  that bug is back.**
- *Wrong:* "not noticeable in practice". The table below is a fair account of one barline, but the
  event repeats every measure, and over a piece it reads as the playhead lurching back to each
  barline and then hurrying to beat 2. It was reported as a bug.

**The redistribution at one barline, measured on Bach BWV 846** (28 px per sixteenth as 1.0×;
median shift 6.9 px, max 22.8) — this is what motion now avoids, and what still happens at the two
anchored positions:

| step | notehead | anchored |
|---|---|---|
| into the barline (last note of the measure) | 1.50× | **1.25×** |
| out of the barline (downbeat) | 1.28× | **1.52×** |

An earlier revision of this note claimed 0.71× / 2.06×. That was measured while `measureBoundsPx`
still carried the cursor's `- 1.5` offset (see `osmd-webview.md`), which inflated the shift from
6.9 px to 21.9 px. If you find figures in that range anywhere, the offset bug is back — and the
motion track then also breaks `settleToNearestStep`, which resolves a paused playhead against
`pxLeft` and only has ~11 px of margin (half the minimum note gap) to absorb the difference.

### LANDMINE: `loopRegion.aStep`/`bStep` index `snapGrid`, not `cursorSteps`

`snapGrid` is `cursorSteps` plus the terminal target standing for the closing barline, so **B can be
one past the end of `cursorSteps`**. Any per-step lookup on a loop bound has to account for that.

The first attempt at the motion track did not, and produced a playhead that reached the end of a
loop early and then stuck there until the transport wrapped. Two causes, both in the interval that
ends the loop:

- `nextPx` read `motionPxLeft(cursorSteps, bStep, …)`. B is not an anchor index, so it returned B's
  *notehead* — right of `bPx`. The playhead aimed past the bracket, hit the `Math.min(…, bPx)` clamp
  early and parked. Where B was the terminal target the lookup missed entirely and `nextPx` fell
  back to `currPx`, freezing the playhead for the whole interval.
- `nextQ` had the same shape. It happened to be correct only because the terminal sits exactly
  `LOOP_MIN_QUARTERS` past the final onset.

**Fix:** the interval ending a loop aims at the region's own edge — `loopRegion.bPx` and
`loopRegion.bTicks / TONE_PPQ`, the same value the wrap predicate tests. `fraction` then reaches 1.0
at the instant the wrap fires, and the clamp goes back to being a safety net instead of the thing
that stops the playhead.

### The start anchor is a tick test, not `isFreshStart`

`startAnchorStep` is armed by `startAnchorFor(countInOriginTicks)`, which asks only whether the
transport sits *on* an onset. Do not reach for `isFreshStart` here: it answers whether the **player**
lost the pulse, by provenance. Its loop branch is `didLoopSeek || resumingAbortedCountIn` and never
inspects position; its piece branch is `posTicks <= firstStepTicks`, false at every mid-piece onset.

Without the anchor the cursor sits parked on the barline through the whole count-in and then yanks
right the instant the first note sounds. With it applied to a *mid-note resume* it jerks
**backwards** instead — hence the tick test. `startAnchorFor` reads `currentCursorStep` rather than
`ticksToStep` because the latter is a floor search (see the round-trip landmine above), and allows
`SEAM_EPSILON_TICKS` of slack for whole-tick rounding. The anchor expires the first time the RAF
sees a `targetStep` past it, so a playback started *inside* a loop cannot leave a stale downbeat
pinned on every later pass.

Two rules inside `anchorToBarlines` that are not decoration:

- **The opening measure is never anchored.** Its left edge is the edge of the engraving, so the
  playhead would sit left of the clef, and `scrollMaxPx` (which reads `cursorSteps[0].pxLeft`) would
  follow it there.
- **An anchor never reaches back past the previous onset**, except across a repeat's back-jump,
  where the pixel sequence descends and the previous step says nothing about how far left this one
  may go. That guard is what preserves the ascending-pixel invariant `nearestGridIndex`
  binary-searches on. On the prelude it never has to fire (34 anchored steps, 0 clamped), but a
  measure whose first entry carries accidentals has a 37.8 px inset against ~28 px steps, so it can.

## LANDMINE: the iterator is a whole measure past the music once `EndReached` is set

**LANDMINE:** once `cursor.Iterator.EndReached` is true, nothing the iterator reports is a musical
position any more. On OSMD 1.9.9 it has advanced `CurrentEnrolledTimestamp` a **full measure past the
end of the piece** and `CurrentMeasureIndex` one past the last measure, while the cursor element has
drifted a few pixels right of the final notehead. Measured:

| score                   | final onset | music ends     | iterator after the walk |
| ----------------------- | ----------- | -------------- | ----------------------- |
| C major scale, 2 bars   | q=7         | q=8            | q=12                    |
| Hanon No. 1, 16 bars    | q=60        | q=64           | q=68                    |
| Bach BWV 846, 35 bars   | q=136       | q=143 (fermata)| q=147                   |

**Do not push a step from it after the loop, and do not derive `totalQuarters` from one.** A step
built from that pair is a note onset that does not exist, and every consumer believes it: the
playhead spent 8 quarters crossing Hanon's closing semibreve and 11 crossing Bach's fermata — twice
the written value, longer than the fermata itself — and `totalQuarters` held the transport open
behind it. The walk already captures the final note (Hanon No. 1 ends at step 120 of 121), so nothing
is missing that needs recovering.

This block previously existed for the opposite belief — "some OSMD builds set `EndReached` while the
cursor is still AT the final note" — guarded by `finalPxLeft > lastCapturedPx`. That test cannot tell
the two cases apart: the cursor element moves past the last notehead either way, so the guard fires
unconditionally. If a future OSMD really does exit the walk early, detect it against the *score*, not
against a pixel.

**`cursorSteps` holds real note onsets only.** The point standing for the closing barline is
`buildSnapGrid`'s terminal, appended on top — see below.

## The end of the piece is the closing barline, not "one quarter past the last note"

`totalQuarters` used to be `lastExpandedQuarters + 1`, which is neither the barline nor the last
note's length: a piece closing on a semibreve stopped three quarters early, one closing on a quaver
ran a quarter long. `domain/scoreGrid.ts`'s `pieceEndQuarters` measures the closing measure the way
every other measure is measured — its downbeat, plus its own length, plus any fermata inside it:

```typescript
totalQuarters = pieceEndQuarters({
  lastMeasureStartQuarters, // captured on the last measure change, fermata-expanded
  lastMeasureQuarters, // SourceMeasure.Duration, NOT the time signature
  trailingHoldQuarters: (tickShift - tickShiftAtLastMeasure) / TONE_PPQ,
  lastOnsetQuarters: lastExpandedQuarters,
});
```

- **`Duration`, not `ActiveTimeSignature`.** A piece that opens with a pickup pays it back in a short
  closing bar, and a full bar's worth of meter would run past the double bar.
- **Snapshot `tickShift` at the measure change**, so a fermata _inside_ the closing measure counts
  and one before it does not.
- The floor at `lastOnset + LOOP_MIN_QUARTERS` is for malformed MusicXML, where OSMD can report a
  zero-length measure. Without it the terminal lands on or behind the final onset, stopping the
  transport before that note sounds and leaving `clampLoopIndices` with no legal loop at the end.

**The RAF loop's final interval aims at the terminal**, for the same reason the loop's last interval
aims at handle B: it is a position the playhead _arrives_ at, and it is not in `cursorSteps`.

```typescript
const terminal = snapGrid[snapGrid.length - 1];
// ... ?? terminal?.pxLeft ?? currPx     and     ?? terminal?.quarters ?? currQ + 1
```

Without it the playhead freezes on the last notehead while its note is still sounding — the one
measure in the piece it does not cross. With it, the last note glides from its notehead to the double
bar over exactly its sounding length (4 quarters for Hanon, 7 for Bach's fermata), and playback stops
there.

## LANDMINE: Tone files a scheduled event one tick early, so a loop's first note never sounds

**LANDMINE:** the tick you hand Tone is not the tick Tone stores. Every tick position goes
through `ToneWithContext.toTicks` → `TransportTimeClass.toTicks`, which converts to seconds
at the current BPM and straight back:

```
_ticksToUnits(n) = (n * (60 / bpm)) / PPQ      // to seconds
toTicks()        = (seconds / (60 / bpm)) * PPQ // and back
```

That round trip is not exact. At 100 BPM `"43776i"` returns **43775.99999999999**, and
`TransportEvent` then does `this.time = Math.floor(options.time)`, keeping the remainder in
`_remainderTime` and adding it back to the audio time in `invoke()`. So the note still
*sounds* on the beat — it is merely **filed one tick early**. That is why this hid for
several releases.

The clock only ever emits whole ticks, so anything that compares a transport position
against a *musical* tick misses by one wherever this bites:

- `Transport.ticks = <onset>` then play leaves that onset's notes filed *behind* the
  playhead, and they never sound. That is the first note of a piece, of a bit, or of
  whatever position the user panned to.
- `Transport.loop` fences the clock to `[loopStart, loopEnd)`, so **A's notes fall outside
  the loop and never sound, while B's own notes fall inside it and sound at the end of every
  pass**. Measured on `waltz-for-nala` with a loop over measures 77–82: A silent on all
  three passes, B sounding on every one, and the emitted ticks resuming at 43777 after each
  wrap.

Neither drift nor rare, and not fixable by choosing better numbers:

| | affected onsets at the score's own tempo |
|---|---|
| `waltz-for-nala` (100 BPM) | 32 of 623 — measures 77 and 82 among them |
| Chopin nocturne op. 9 no. 2 (92 BPM) | 71 of 558 |
| `adele-set-fire-to-the-rain` (108 BPM) | 112 of 894 |
| `maple-leaf-rag` (100 BPM) | 57 of 1019 |
| BWV 846 prelude (100 BPM) | 32 of 547 |
| `Grüne_Augen_lügen_nicht` (80 BPM) | 0 of 196 — until the speed control moves off 80 |

Which onsets are hit depends on the tempo (0 at 60/80/120, 138 of 623 at 72), so the speed
control moves the failures around rather than removing them. **No PPQ escapes it** — 192,
256, 384, 512, 960 and 1920 all fail at some tempo — and **no input representation does
either**: the `"Ni"` string, a `Tone.Ticks` and raw seconds all land on the same floor, and
the `i` notation is whole ticks only (`/^(\d+)i$/`) so there is nothing to bias it with.
`Math.round` of the round trip is never wrong (the error is ≤1.5e-11 ticks and goes **both
ways**), but Tone floors rather than rounds and the floor is inside `TransportEvent`.

**Fix:** stop arguing with it and meet it where it files. `gridTransportTicks` in
`playback.ts` asks the live transport for each grid position's filed tick
(`Math.floor(Transport.toTicks("<ticks>i"))`) and everything that talks to the transport
reads that: the fence, the seek in `seekToStep`, the settle in `settleToNearestStep`, and
`startPlayback`'s "is the playhead inside the loop" test. `loopRegion` carries both spaces —
`aTicks`/`bTicks` stay musical for the count-in's meter and for a saved bit's stored bounds.

Two rules for the fence itself, both load-bearing, and both owned by
`domain/transportTicks.ts` (`loopFence`) so they are testable without a browser:

- **`loopStart` is A's filed tick exactly.** The wrap seeks the clock there and then fires
  that tick's timeline events, so a bound one tick off means A never sounds — first pass or
  any later one. It survives the setter's own re-conversion because both readers tolerate the
  error (`forEachAtTime` matches within `EPSILON` = 1e-6, and emitted ticks are rounded).
- **`loopEnd` is half a tick *below* B's filed tick.** Tone tests `ticks >= loopEnd` against
  the raw float, and the round trip can leave it a hair *above* the integer — 96 ticks at
  41 BPM comes back as 96.00000000000003 — which slips the wrap by a tick and sounds B's own
  notes. Assign it in **seconds**, since the tick notation cannot carry a fraction.

**The capture is paired with the `Part`, not with the grid.** A Part's event ticks are frozen
when it is built, while the speed control moves `Transport.bpm` afterwards, so
`captureTransportTicks()` runs immediately before each `new Tone.Part` — in `initPlayback`
(after `bpm.value = initialBpm`) and in `setActiveHand`. Splitting that pair silently
re-introduces the bug at every tempo the user has touched.

**Two consequences elsewhere**, both a whole tick — 3 ms at 100 BPM — and both absorbed with
the existing `SEAM_EPSILON_TICKS`:

- `animateCursorLoop` reads `Tone.Transport.ticks + SEAM_EPSILON_TICKS`. Without it the first
  frame of a fresh start or of a loop pass resolves to the step *before* the one sounding, and
  the playhead flicks backwards for a frame at every wrap.
- the metronome's downbeat test accepts `ticks` or `ticks + SEAM_EPSILON_TICKS`, or a downbeat
  loses its accent for a whole playthrough.

**How to re-verify** (there is no Tone in the app's Jest environment — it is a score-web
dependency and needs an AudioContext, so `transportTicks.test.ts` asserts the fence against a
*model* of the arithmetic above). Build the bundle with `minify: false` into a standalone page
next to the unzipped MusicXML, stub `window.ReactNativeWebView`, call `__rn_load_xml`, and wrap
`(Tone.Transport as any)._clock.callback` to record the emitted ticks plus a probe in the
`Part` callback to record what fires. Then arm a loop over an affected onset and count. The
numbers in this note came from exactly that, on all eleven files in `testfiles/`.

## PATTERN: `effectiveQE` snap — prevent cursor sitting at B for an extra RAF frame

When Tone's transport loops, `Transport.ticks` wraps from `bTicks` back to `aTicks` on the audio
thread. The main-thread RAF callback may fire one or more times while `Transport.ticks` still
reflects the old (pre-wrap) value, leaving the cursor visually parked at the B position for a
frame before jumping back.

**Fix:** Compute an `effectiveQE` (effective quarters elapsed) that snaps to `aTicks/TONE_PPQ`
the moment `quartersElapsed` reaches or passes `bTicks/TONE_PPQ`:

```typescript
const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;
const effectiveQE =
  loopRegion !== null && quartersElapsed >= loopRegion.bTicks / TONE_PPQ
    ? loopRegion.aTicks / TONE_PPQ
    : quartersElapsed;
```

Use `effectiveQE` for the binary step search and the interpolation fraction. Also clamp the
interpolated pixel to `loopRegion.bPx` so the cursor never drifts into the handle-B area when
interpolating toward a next-step that lies outside the loop:

```typescript
const rawPx = currPx + fraction * (nextPx - currPx);
const interpolatedPx = loopRegion !== null ? Math.min(rawPx, loopRegion.bPx) : rawPx;
```

## LANDMINE: `dx` accumulation for handle drag breaks when edge-scroll runs concurrently

Computing `newPx = startPx + (clientX - startTouchX)` tracks the finger correctly while the
score is stationary, but fails the moment edge-scrolling shifts `scrollOffsetPx`: the score
moves while `startPx` stays fixed, so the handle drifts left relative to the finger on every
auto-scroll step.

**Fix:** project the finger's viewport position into score space on every frame using the
*current* `scrollOffsetPx`. Capture `startScrollOffset = scrollOffsetPx` at `touchstart`,
then in each frame:

```typescript
const initialOffset = startPx + startScrollOffset - startTouchX; // constant
newPx = clientX + initialOffset - scrollOffsetPx;
```

As `scrollOffsetPx` changes (edge scroll), `newPx` is recomputed to compensate, keeping the
handle locked to the finger in viewport space.

## LANDMINE: `bpm.setValueAtTime("Xi")` is broken for multi-tempo scores — use `Transport.schedule`

**LANDMINE:** Scheduling BPM changes in `initPlayback` via
`Tone.Transport.bpm.setValueAtTime(bpm, "Xi")` has three failure modes for routine playback:

1. **"One beat early":** `"Xi"` is converted to an absolute AudioContext time at call time.
   If sample loading takes ~1–2 s before `Transport.start()`, the deadline is already that many
   seconds in the past relative to when the transport actually starts — the BPM fires ~1 beat early
   at 40 BPM.

2. **Replay at wrong BPM:** AudioParam events are one-shot. After a full playthrough the
   AudioParam is stuck at the last tempo (e.g. 160 BPM). The next `Transport.start()` has no
   scheduled changes left; BPM stays at 160 for the entire replay.

3. **Wrong BPM when starting mid-score:** `initPlayback` only sets the initial BPM for tick 0.
   If the user scrolls to a later section and presses play, the BPM is at the initial value
   until the scheduled AudioParam change fires — which may be well into the score.

**Fix:** Register BPM changes via `Tone.Transport.schedule()` instead. Transport events fire
relative to transport ticks, replay correctly on every `Transport.start()`, and are skipped when
starting past their tick:

```typescript
for (const { ticks, bpm } of scheduledChanges) {
  const id = Tone.Transport.schedule((time) => {
    Tone.Transport.bpm.setValueAtTime(bpm, time);
  }, `${ticks}i`);
  tempoScheduleEventIds.push(id);
}
```

Before each `Transport.start()`, cancel stale AudioParam values and set the BPM for the current
position so the correct tempo is audible from the first note:

```typescript
Tone.Transport.bpm.cancelScheduledValues(0);
const posTicks = Tone.Transport.ticks;
let bpmForPos = initialBpmValue;
for (const { ticks, bpm } of tempoChangeSchedule) {
  if (ticks <= posTicks) bpmForPos = bpm;
  else break;
}
Tone.Transport.bpm.value = bpmForPos;
```

Track event IDs in `tempoScheduleEventIds[]` and clear with `Tone.Transport.clear(id)` in
`disposePlayback`. Also clear and re-register on every `initPlayback` call so stale events from
a previous score load don't accumulate.

## LANDMINE: `startPlayback()` BPM reset overwrites user-set tempo

**LANDMINE:** The BPM reset block in `startPlayback()` sets `Tone.Transport.bpm.value` to the
score-position tempo on every play — including resume after a speed-picker change. This overwrites
any multiplier or warm-up BPM that was applied via `setTempoBpm()`.

**Fix:** Track the user-set BPM in a module variable `userBpmOverride: number | null`. Set it in
`setTempoBpm()`; use `userBpmOverride ?? bpmForPos` in `startPlayback()`. Reset to `null` in
`initPlayback()` and `disposePlayback()`. Multi-tempo routines never call `setTempoBpm()`, so the
override stays `null` and score-position BPM is used unchanged.

## LANDMINE: read `Tone.Transport.ticks` before `bpm.value` assignment in `startPlayback()`

**LANDMINE:** The loop-seek condition in `startPlayback()` originally re-read `Tone.Transport.ticks`
after `Tone.Transport.bpm.value = X`. Changing BPM while the transport is paused can cause Tone.js
to recompute the paused tick position via the clock integral, producing a stale value that falls
outside `[aTicks, bTicks)`. This falsely triggered the loop-start jump on every pause/play or
speed-picker change.

**Fix:** Read `Tone.Transport.ticks` once into `posTicks` **before** `cancelScheduledValues()` and
`bpm.value` are set. Use `posTicks` for both the multi-tempo BPM lookup and the loop-seek condition
— no second read.

## PATTERN: run handle drag in a RAF loop, not only on `touchmove`

`touchmove` fires only when the finger moves. Edge-scrolling must continue even when the finger
is stationary near the viewport edge.

**Fix:** `touchmove` only updates a `currentClientX` variable (plus `e.preventDefault()`).
All scroll + handle-reposition logic runs in a `requestAnimationFrame` loop started on
`touchstart` and cancelled on `touchend`:

```typescript
function dragFrame(): void {
  // 1. proportional edge scroll — update scrollOffsetPx
  // 2. newPx = currentClientX + initialOffset - scrollOffsetPx
  // 3. clamp, update loopRegion, updateLoopOverlay()
  dragRafId = requestAnimationFrame(dragFrame);
}
el.addEventListener('touchstart', () => { dragRafId = requestAnimationFrame(dragFrame); });
el.addEventListener('touchmove',  (e) => { e.preventDefault(); currentClientX = e.touches[0].clientX; });
el.addEventListener('touchend',   () => { cancelAnimationFrame(dragRafId!); loopModified = true; });
```

Because auto-scroll runs before the `newPx` projection in each frame, `scrollOffsetPx` is
already up-to-date when the handle position is computed — no single-frame lag.

## PATTERN: OSMD `GraphicSheet` note coloring for hand filtering

To grey out one staff's notes without triggering a re-render, traverse the graphical tree and
call `note.setColor()` directly on each `GraphicalNote`:

```typescript
const coloringOpts = {
  applyToNoteheads: true, applyToBeams: true, applyToFlag: true,
  applyToStem: true, applyToLedgerLines: true,
};
for (const measureRow of osmd.GraphicSheet.MeasureList) {
  for (let si = 0; si < measureRow.length; si++) {
    const measure = measureRow[si];
    if (!measure) continue;
    const greyed = (activeHand === 'right' && si === 1) || (activeHand === 'left' && si === 0);
    for (const staffEntry of measure.staffEntries) {
      for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
        for (const note of voiceEntry.notes) {
          note.setColor(greyed ? '#B0B0B0' : '#000000', coloringOpts);
        }
      }
    }
  }
}
```

Staff index mapping (0-based in `MeasureList`): `si === 0` → right hand (treble, MusicXML
`<staff>1</staff>`); `si === 1` → left hand (bass, `<staff>2</staff>`). This matches
`note.ParentStaff.idInMusicSheet` used to filter `noteEvents` in `buildTimelines`.

The coloring persists across `Transport.start/stop` cycles because it is applied to the
rendered SVG elements directly; it is re-applied on every `initPlayback` and on every
`setActiveHand` call.

## PATTERN: Rebuild `Tone.Part` without losing cursor position

When rebuilding the Part on a hand-filter change, save position state **before** `stopPlayback()`
resets it, then restore after Part creation:

```typescript
// 1. Capture before stop
const savedTicks = Tone.Transport.ticks;
const savedStep  = currentCursorStep; // -1 if never played
const savedScrollPx = scrollOffsetPx;

if (Tone.Transport.state !== 'stopped') stopPlayback();
// stopPlayback → _stopInternal sets: currentCursorStep=0, osmdActualIdx=0, Transport.ticks=0

// 2. Rebuild timelines (buildTimelines calls osmd.cursor.reset() at the end,
//    leaving osmdActualIdx=0 and the OSMD cursor at position 0)
const { noteEvents } = buildTimelines(osmdRef);

// 3. Rebuild Part (hand-filtered noteEvents, same sampler + tempo schedule)
part?.dispose();
part = new Tone.Part(..., noteEvents);
part.start(0);

// 4. Restore position
const step = Math.max(0, Math.min(savedStep < 0 ? 0 : savedStep, cursorSteps.length - 1));
Tone.Transport.ticks = savedTicks;
advanceCursorTo(step);   // advances from osmdActualIdx=0; must be called BEFORE setting currentCursorStep
currentCursorStep = step; // advanceCursorTo early-returns if targetStep === currentCursorStep
applyTranslate(savedScrollPx !== 0 ? savedScrollPx : scrollMaxPx);
```

Key ordering constraint: call `advanceCursorTo(step)` **before** assigning `currentCursorStep`,
because `advanceCursorTo` short-circuits when `targetStep === currentCursorStep`.

## PATTERN: Count-in pre-roll (metronome before a fresh start)

The count-in setting (0/1/2 measures, `settings.md`) plays N measures of metronome clicks before
a piece, routine, or loop begins. The pure schedule math lives in `src/domain/countIn.ts`
(`computeCountIn`); `playback.ts` supplies the meter/tempo it reads from OSMD.

**Meter + pickup come from OSMD `SourceMeasure`, captured in `buildTimelines`:**
```typescript
const sm = measure as { ActiveTimeSignature?: {...}; ImplicitMeasure?: boolean };
measureMeta.push({ startTicks, num: sm.ActiveTimeSignature.Numerator,
                   den: sm.ActiveTimeSignature.Denominator, implicit: sm.ImplicitMeasure });
```
Beats per measure = numerator; one beat = `(60/bpm) * (4/den)` seconds. A pickup is an
`ImplicitMeasure` first measure — its duration (`measureMeta[1].startTicks - measureMeta[0]`) is
folded into the LAST counted measure, so the audio starts that many beats early and the prelude
sounds as the tail of the count-in. A loop that starts partway through a measure is folded the same
way via `loopLeadInBeats(beatOffset, beatsPerMeasure)` — the beats from the measure's downbeat to
the loop start become the count-in's tail, so the loop enters on its natural beat and the count-in's
downbeats stay aligned with the loop's bar grid. A loop on a downbeat has no lead-in.

**Timing — clicks on the raw audio clock, transport deferred to a sample-accurate future time:**
```typescript
const startAt = ctx.currentTime + 0.12;               // small lead so click 1 isn't clipped
countInNodes = clicks.map((c) => playClick(ctx, startAt + c.offsetSec, c.accented));
countingIn = true;
Tone.Transport.start(startAt + delaySec);             // first note lands exactly on the beat
```

**LANDMINE (interacts with the `Transport.start(offset)` state trap above):** because the
transport is scheduled to start in the future, `Tone.Transport.state` reads `'stopped'` during the
pre-roll, which would kill the RAF cursor loop. The `countingIn` flag keeps `animateCursorLoop`
requesting frames (cursor parked at the start) until the transport actually starts; on the first
`'started'` frame it clears `countingIn` and drops `countInNodes` (so a later mid-piece pause is
not mistaken for a count-in abort).

**Eligibility — only a *fresh* start counts in**, never a resumed pause. The rule is pure and lives
in `domain/countIn.ts` as `isFreshStart` (tested): piece/routine when `posTicks <= firstStepTicks`;
loop when `startPlayback` seeks to the A handle (`didLoopSeek`), *or* when a cancelled count-in is
owed a retry (below). `countInMeasures` is set via `__rn_set_count_in` and, as a user setting, is
preserved across score reloads (`disposePlayback` keeps it).

**LANDMINE: `Tone.Transport.state` is not "is it playing?" — use `isPlaybackActive()`.** The state
getter reports the state *at now*, so throughout a count-in — whose transport start is scheduled in
the future — it reads `'stopped'`. There is a second blind window before it, while `startPlayback`
awaits `Tone.loaded()`, which is seconds on a cold first play. In both, the native shell has already
been told `'playing'` (the post moved to the top of `startPlayback` so the toolbar leaves on the
tap), so the user sees a playing screen and taps it to stop.

Six call sites tested `Tone.Transport.state === 'started'` and all six were wrong in those windows.
The tap handler was the one that bit: it read the tap as a *fresh start*, called `startPlayback()`
again, and scheduled a second pre-roll over the first — heard as two competing sets of clicks, one
more per tap. `isPlaybackActive()` (`state === 'started' || countingIn || startPending`) is now the
only sanctioned test; a raw state check in `playback.ts` is almost certainly a bug.

`startPending` needs a companion: a start parked on the `await` must not wake up and seize a
transport that has since been cancelled. Every cancel bumps a module `playToken`, and `startPlayback`
compares the token it captured before the await and returns if it has been superseded.

**Cancelling a pre-roll — `abortStart`, deliberately not `_stopInternal`.** Nothing has sounded, so
there is no position to freeze; but `_stopInternal` rewinds to the top of the piece, which is a
no-op at bar 1 and throws the score back from a loop's A handle to the start of the piece. Nothing
needs restoring visually either — `animateCursorLoop` parks itself during the pre-roll, so the score
is still where the start left it. Only the transport position does, because `Transport.stop()`
rewinds it as a side effect of cancelling the scheduled start; `countInOriginTicks` puts it back.

That leaves the playhead on A having never played a note — positionally identical to a pause taken
on A, which is exactly the case `isFreshStart` refuses. So the abort sets `countInReArmed`, honoured
by the next start only while `posTicks` is still `countInOriginTicks` (cancel, scroll elsewhere in
the loop, press play → an ordinary mid-loop resume again). Without it, cancelling a loop's count-in
would silently buy you a loop with no pre-roll.

## Sections: junction ticks, and why they must not come from `noteEvents`

`setSections(indices, colors)` turns 0-based measure indices into transport ticks once per load, then
`emitSectionIfChanged` posts `SECTION_INDEX` only when the index actually changes — about once per
section, never per frame, even though it is called from several per-frame paths.

There are **two** position sources, because the playhead moves in two different ways:

- **Playing** — `animateCursorLoop` passes the transport position (loop-aware `effectiveQE`).
- **Panning** — the transport has not moved, only the score has, so `emitSectionAtScrollOffset`
  derives the position from `scrollOffsetPx` via `nearestGridIndex(cursorSteps, viewportWidth / 2 -
  offset)`. It is called on every `touchmove` and every momentum frame. Relying on
  `settleToNearestStep` alone (which runs on lift and when momentum settles) makes the label lag the
  score visibly — the name only flips once the scroll stops, long after the centre line crossed the
  junction. It uses *nearest*, matching the preview line and the settle; flooring instead would let
  the label flip only after the glide had already landed, which reads as a different kind of lag.

`_stopInternal` also emits at tick 0: `Transport.stop()` rewinds, and without it a piece that plays
to the end leaves the label showing the final section while the cursor sits at the start.

**LANDMINE:** `noteEvents` is **filtered by `activeHand`**, and `setActiveHand` re-runs
`buildTimelines` to rebuild it. Deriving anything score-structural from it means that structure
silently changes when the user practises one hand. Section junctions did exactly this in an early
draft: switching to left-hand-only moved every junction, because the rest-separation test stopped
seeing the right-hand notes.

`buildTimelines` therefore also fills `noteSpans` — `{start, end}` per note in ticks, pushed
**before** the `activeHand` check, so it is identical for every hand setting:

```typescript
if (note.halfTone < 9 || note.halfTone > 115) continue;
const spanQ = note.Length.RealValue * WHOLE_TO_QUARTER;
if (spanQ > 0) spans.push({ start: baseTicks, end: baseTicks + Math.round(spanQ * TONE_PPQ) });
if (activeHand !== 'both') { /* … filter … */ }
```

**Anacrusis offset.** With a pickup (`measureMeta[0].implicit`), phrase starts sit
`measureMeta[1].startTicks` *before* each barline. `sectionStartTickFor` applies that offset only
when the upbeat is real: note onsets inside `[bar - anacrusis, bar)` **and** nothing sounding across
the window's start. Testing only for "notes in the window" fires almost always — a section normally
ends with a full measure — so it would be indistinguishable from an unconditional offset. Ticks
compare with a 1-tick epsilon because note ends are rounded.

**`seekToTicks` is the single seek primitive.** Transport ticks, the OSMD iterator
(`advanceCursorTo`), the cursor element's `style.left`, and `applyTranslate` all have to move
together; the loop-start seek in `startPlayback` and `seekSection` both go through it so they cannot
drift apart.

**Junction marks are static DOM, not per-frame drawing.** `renderSectionMarks` builds four absolutely
positioned divs per junction (two gradient ramps, two 1px seam lines) as children of `#section-marks`
inside `#osmd`. Because `#osmd` is what `applyTranslate` transforms, the marks scroll with the score
for free — there is no per-frame cost and nothing to keep in sync. They are rebuilt only when the
section list changes, and cleared in `disposePlayback` for the same reason the loop handles are: they
are positioned in score pixels, so surviving into the next score would paint them at stale
coordinates.

Marks sit at **junctions only** — between two sections, so *n* sections produce *n−1* marks and the
opening of the piece is unmarked. Each junction draws the outgoing section's color fading away to the
left and the incoming section's fading away to the right, meeting at a two-pixel seam (one pixel of
each) at full opacity. The seam is what keeps a junction visible when two neighbouring sections
happen to draw the same hue, which the gradients alone would blur into one continuous wash.

The fade reach is *measured*, not assumed: `fadeReachPx` converts half a measure of the junction's
own meter into pixels via `pxAtTicks`, then clamps to `[20, 130]`. Engraved measure widths vary by an
order of magnitude between a whole-note bar and a run of semiquavers, so a fixed pixel reach reads as
a different amount of music in different parts of the same score.

Gradients ramp to `transparent` rather than to an explicit zero-alpha color. CSS interpolates gradient
stops with premultiplied alpha, so `transparent` does not drag the ramp through grey; writing
`rgba(r,g,b,0)` instead would require parsing the palette string web-side for no gain.

## LANDMINE: a Tone.Part never starts an event that began before the resume position

`Part._startNote` (tone 14.9.17), non-looping branch:

```javascript
else if (event.startOffset >= offset) {
    event.start(new TicksClass(this.context, ticks));
}
```

`offset` is where the transport starts. An event whose onset is *strictly before* it is silently
dropped — not delayed, not clipped, never started. So resuming at tick T sounds nothing for any
note that began before T, and the remainder of that note is silence.

This sat unnoticed for the whole life of the app because **every position the playhead can park on
is normally a note onset**: `nearestGridIndex` snaps to the closest one, so the worst case was a
gap of less than one note. Ties break the assumption. The cursor visits every continuation of a
chain (`steps.push` in `buildTimelines` runs for each iterator position, before note extraction),
but the chain contributes a single event at its start, because continuations are skipped so the
note sounds once for its combined length. A two-measure long tone therefore has a barline in the
middle of it with nothing scheduled anywhere near.

**Fix:** before `Transport.start`, sound the notes that are already under way —
`notesSoundingAt(events, ticks, PPQ)` in `src/score-web/resumeNotes.ts`. The exclusion at its
boundary is exact and load-bearing: it takes `ticks < resumeTicks`, the precise complement of
Tone's `startOffset >= offset`, so a note whose onset *is* the resume position is left to the Part.
Return it here as well and it attacks twice at the same instant.

Three things that are easy to get wrong in the resume itself:

- **The buffer offset is not the elapsed time.** `loopStart`/`loopEnd` are buffer seconds and
  ignore `playbackRate`, so a pitch-shifted note has travelled further through its buffer than the
  clock says. Convert first, then fold — `resumeBufferOffsetSec` in `src/score-web/sustainLoop.ts`.
- **`Tone.Sampler` cannot do this at all.** `Sampler.js:130` is `source.start(time, 0, ...)` — the
  offset is hardcoded. The piano therefore borrows `LoopingSamplePlayer` for resumed notes only,
  which also means the piano now needs `releaseAll` on stop and pause, where before it never did.
- **Pass the transport's start *time*, not `now`.** A count-in defers the start by seconds; a
  resumed note scheduled at `now` would sound during the click track.

### The same gap on a loop wrap

A bit whose A handle sits inside a held note hits this twice over. The first pass is fine, because
it goes through `startPlayback`. Every wrap after it was silent, for a related but *different*
reason — note the mechanism, because the obvious guess is wrong. The app loops the **Transport**,
not the Part, so `Part._loop` is false and the branch above never runs at all. What happens is in
`Transport._processTick`:

```javascript
if (ticks >= this._loopEnd) {
    this.emit("loopEnd", tickTime);
    this._clock.setTicksAtTime(this._loopStart, tickTime);
    ticks = this._loopStart;
    this.emit("loopStart", tickTime, ...);
    this.emit("loop", tickTime);
}
// ...
this._timeline.forEachAtTime(ticks, (event) => event.invoke(tickTime));
```

Ticks rewind to `loopStart` and only the events **at** that tick are invoked. A `Tone.Part` puts
each note on that timeline as a one-shot `transport.schedule` at its absolute onset
(`ToneEvent._rescheduleEvents`), so anything scheduled earlier is never reached again.

**Fix:** the `loop` emit is the hook — `Tone.Transport.on('loop', ...)`, sounding the in-progress
notes at A. Three traps in it:

- **Do not read `Tone.Transport.ticks` in that handler.** The rewind is applied *at* `tickTime`,
  which is ahead of now by the lookahead, so the read can still return the pre-wrap value. Use the
  loop region's own `aTicks`.
- **The handler's argument is the audio time of the wrap**, and that is what the resumed note must
  be scheduled at.
- **Bound the note at B.** This is the one that bites: left to run its natural length, a resumed
  note outlives the wrap, and the next wrap sounds the same pitch again while the first is still
  going. Voices stack one per pass until the loop is stopped. Hence `untilTicks` on
  `notesSoundingAt`.

`initPlayback` runs again on every score load, so the handler is removed before it is added —
otherwise the previous score's closure stays subscribed and every held note sounds twice.

**Both resume paths work in the transport's tick space, not the musical one.** This is the trap
the two fixes set for each other. `notesSoundingAt` compares an onset against the position
playback resumes at, and after the filed-tick work above those are different spaces: the position
read off the transport is filed, a note event's tick is musical, and they differ by up to a whole
tick. Mixed, a note ending exactly where you resume looks like it has a tick left, and the 50 ms
floor on the note duration turns that into an audible stub of the previous note under the right
one. So the events are put through `Transport.toTicks` and floored, the same way
`captureTransportTicks` does for the grid — asked of Tone rather than recomputed — the wrap passes
`aTransportTicks` rather than `aTicks`, and the loop bound is `bTransportTicks`. A one-tick end
tolerance (`SEAM_EPSILON_TICKS`) absorbs what is left, since a note with a tick to live is not
worth sounding anyway.
