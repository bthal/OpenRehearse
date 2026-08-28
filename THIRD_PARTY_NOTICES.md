# Third-Party Notices

OpenRehearse uses the following open-source libraries. Their licenses and copyright
notices are reproduced below as required by their terms.

---

## OpenSheetMusicDisplay (OSMD)

Bundled in `client/src/score-web/html.ts` (compiled into the WebView bundle).

**License:** BSD 3-Clause

```
Copyright 2019 PhonicScore

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

Source: https://github.com/opensheetmusicdisplay/opensheetmusicdisplay

---

## Tone.js

Bundled in `client/src/score-web/html.ts` (compiled into the WebView bundle).

**License:** MIT

```
Copyright (c) 2014-2020 Yotam Mann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source: https://github.com/Tonejs/Tone.js

---

## Material Design Icons (`@mdi/js`)

Used for all UI icons in the React Native app.

**License:** Apache License 2.0

Copyright (c) Austin Andrews and the Pictogrammers contributors.

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Source: https://github.com/Templarian/MaterialDesign-JS

---

## Instrument samples — piano and clarinet

Both sample sets are bundled in the APK under `client/assets/samples/` and are the only
audio the app plays; nothing is fetched at runtime. They are thinned to roughly one
sample per minor third, which is all `Tone.Sampler` needs to cover a full range.

### Salamander Grand Piano

Bundled in `client/assets/samples/salamander-piano/` (30 files, ~2.0 MB).

**Licence:** **Creative Commons Attribution 3.0 (CC BY 3.0)**.

Recorded by Alexander Holm. Obtained from the Tone.js audio collection
(<https://tonejs.github.io/audio/salamander/>), which previously served them to the app
over the network; they are now bundled so playback works offline.

### Clarinet — FluidR3_GM

Bundled in `client/assets/samples/fluidr3-clarinet/` (17 files, ~476 KB), spanning
C3–C7 at sounding pitch.

**Licence:** **Creative Commons Attribution 3.0 (CC BY 3.0)**.

FluidR3_GM soundfont by Frank Wen, rendered to per-note MP3 files by the
`midi-js-soundfonts` project (<https://github.com/gleitz/midi-js-soundfonts>, MIT), from
which the files were taken. Note that the other collections in that repository
(MusyngKite, FatBoy) are **CC BY-SA 3.0** and are deliberately **not** used — no bundled
asset in this project carries a share-alike obligation.

---

## Demo piece — Bach Prelude I in C major (BWV 846)

Bundled in `client/assets/demo/bach-prelude-c-major-bwv846.mxl` and pre-imported
on first install so the piece list is not empty out of the box.

**Music:** Johann Sebastian Bach (1685–1750) — **public domain** (author died > 70 years ago).

**MusicXML file:** Exported from MuseScore.com, score #117279
(<https://musescore.com/user/101554/scores/117279>), encoded with MuseScore 4.2.1.
The score is published under a **Creative Commons copyright waiver (CC0)**, effectively
placing it in the public domain.

---

## Warm-up exercises — Hanon, *Le Pianiste Virtuose* Nos. 1–20

No score file is bundled for these. `client/src/domain/warmupMusicXml.ts` holds a table
of note offsets and fingerings per exercise and generates MusicXML at runtime, which is
what lets the app transpose each exercise into any key and span one to three octaves.

**Music:** Charles-Louis Hanon (1819–1900), *Le Pianiste Virtuose en 60 Exercices*,
first published 1873 — **public domain** (author died > 70 years ago; published well
before 1929). This covers all twenty exercises of Part I, No. 1 included.

**Reference edition:** G. Schirmer No. 925 (1900), scanned on IMSLP as
[#91547](https://imslp.org/wiki/The_Virtuoso_Pianist_(Hanon,_Charles-Louis)) and marked
public domain there. Note that IMSLP hosts later editions of the same work that are
*not* public domain in every jurisdiction (Curci 1947, Jurgenson 1909); those were not
used.

**Machine-readable reference:** The offsets and fingerings in the table were extracted
from the [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2037)
LilyPond engraving of Part I, typeset from the Schirmer 1900 edition by Steve Taylor and
Javier Ruiz-Alma and published under **CC BY-SA 4.0**. Credited here because it saved
real work. What the app keeps from it is which notes Hanon wrote — facts about a public
domain composition, not the engraving — so no share-alike obligation is claimed over
this source tree. Mutopia's own editorial fingering annotations were deliberately not
used; fingerings come from the Schirmer edition.

---

## App logo — piano icon

The OpenRehearse mark in `client/assets/brand/` and the app icons in
`client/assets/` are derived from a piano icon by **Pixel Bazaar**
(<https://www.svgrepo.com/author/pixelbazaar/>), obtained via SVG Repo.

**Licence:** Creative Commons Attribution (CC BY)
— <https://creativecommons.org/licenses/by/4.0/>

**Modified:** Yes. The artwork was recoloured from black to white and placed on a
navy (`#000036`) ground, inverting it so the navy reads through where the white keys
would be. The unmodified source is kept at
`client/assets/brand/reference-piano.svg` for comparison.

This attribution must accompany the mark wherever it ships, including store listings
and any marketing surface.

---

## Brand typeface — Outfit

`client/assets/fonts/Outfit-SemiBold.ttf` is **Outfit** by the Outfit Project Authors
(<https://github.com/Outfitio/Outfit-Fonts>), licensed under the
**SIL Open Font License 1.1**. The full licence text ships alongside it at
`client/assets/fonts/OFL.txt`.

---

## Other Dependencies

All other runtime dependencies (React, React Native, Expo, Zustand, NativeWind,
i18next, fast-xml-parser, fflate, react-native-webview, react-native-reanimated,
react-native-svg, and others) are licensed under the MIT License. Their copyright
notices are preserved in the respective `node_modules` directories and in their
upstream repositories.
