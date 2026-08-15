# Changelog

## [1.2.0](https://github.com/bthal/OpenRehearse/compare/v1.1.0...v1.2.0) (2026-08-15)


### Features

* add count-in metronome pre-roll with settings modal ([cf9fb96](https://github.com/bthal/OpenRehearse/commit/cf9fb96fea528fb42ee4113cdab841cb425a7150))
* add per-piece target speed and required-metadata import gate ([697e350](https://github.com/bthal/OpenRehearse/commit/697e350dd38158bcb3c9474dc10998891cb2100d))
* dashboard UI redesign, edit modal, and MusicXML credit scraping ([ee569f8](https://github.com/bthal/OpenRehearse/commit/ee569f8b00cca9fe4719fd27adcf79c29643a0d7))
* **dashboard:** brand header, import styling, and piece selection mode ([af96a17](https://github.com/bthal/OpenRehearse/commit/af96a174c3cb1457a8804627fdaf27ebe2d2ebe0))
* **dashboard:** track practice time and show a day heatmap ([bcee358](https://github.com/bthal/OpenRehearse/commit/bcee358d6dd1f12bb266a09d699b9347148aa53e))
* **i18n:** "remove" instead of "delete" ([722d6f5](https://github.com/bthal/OpenRehearse/commit/722d6f56d3f7695c142bf5d50f45c82f42581c67))
* **i18n:** add react-i18next infrastructure with English locale ([3837268](https://github.com/bthal/OpenRehearse/commit/38372681377bf121285e4756a13945566d1cdd34))
* implement Phase 1 — local pieces, Dashboard, MusicXML import ([7f792b3](https://github.com/bthal/OpenRehearse/commit/7f792b3eabfffcb2fcb3c3c7f2972d1ff399affa))
* **import:** support .mxl compressed MusicXML import ([cd92a37](https://github.com/bthal/OpenRehearse/commit/cd92a374eb1dec765d5d74519e62665efd15f33b))
* **playback:** fix loop-wrap lag, cursor clamp, and loop boundary semantics ([9bde288](https://github.com/bthal/OpenRehearse/commit/9bde288ff6c13015e9a743ad1f0c734868cd1b6a))
* **playback:** loop handle drag icon, drift fix, and continuous edge-scroll ([7dc0a77](https://github.com/bthal/OpenRehearse/commit/7dc0a77b3c9e630c6cb424ba70c817e94fcb0e38))
* **playback:** support fermata hold expansion and arpeggio chord rolling ([5c0eff8](https://github.com/bthal/OpenRehearse/commit/5c0eff86d1c3bfe8da27346f3342f71ac8cc2885))
* **playview:** add left/right/both hand selector for piece playview ([e4cec2a](https://github.com/bthal/OpenRehearse/commit/e4cec2af8e7875a38f0715335d9b0bcd5114b849))
* **playview:** add persistent fingering annotation editing ([91c0b01](https://github.com/bthal/OpenRehearse/commit/91c0b01d60e3f8df2c5aa7c88140f9abebe1b67b))
* **playview:** center toolbar, restyle speed selector as animated overlay ([c988433](https://github.com/bthal/OpenRehearse/commit/c9884330aff2af3558e0f773fbddc2c5cf70c81a))
* **playview:** implement Phase 2 — OSMD WebView score rendering ([439996f](https://github.com/bthal/OpenRehearse/commit/439996fa62115e8d9756fa4b32fcecd6e1f40412))
* **playview:** implement Phase 4 — one-line score, loop system, cursor alignment ([f74e395](https://github.com/bthal/OpenRehearse/commit/f74e3957f5a1c0caed8b9c956710a9e75a4d490a))
* **playview:** minimal toolbar styling ([89f94bd](https://github.com/bthal/OpenRehearse/commit/89f94bd81d542a5c69383207e65f68e06b1a161c))
* **playview:** portrait dashboard, hide OSMD cursor, toolbar + speed UI polish ([de380d3](https://github.com/bthal/OpenRehearse/commit/de380d3f4885f377e5b60c01e6e6506e70830e88))
* **playview:** realistic piano, score BPM, speed selector, cursor polish ([bd8f2c2](https://github.com/bthal/OpenRehearse/commit/bd8f2c2f1bdbd899d83d5ff71e457314ff0cf0c6))
* **playview:** toolbar restyle, metronome toggle with downbeat accent ([f5b35a0](https://github.com/bthal/OpenRehearse/commit/f5b35a0749d7f04eef05c1bd4d9acb7957244eca))
* **playview:** unfurl the loop out of the cursor and restyle its handles ([7314ff8](https://github.com/bthal/OpenRehearse/commit/7314ff8d005f353463847c411cfe7d1fc9ee94c4))
* **routines:** build and play ordered exercise routines ([c90aec0](https://github.com/bthal/OpenRehearse/commit/c90aec0a026b3b95bb55c7addce7e1098f8c6b2c))
* **routines:** pencil icon button in routine playview toolbar as quick link to routine edit view ([b1d796c](https://github.com/bthal/OpenRehearse/commit/b1d796cc6e2c7ee70929999a242f0f6f8e5a39d4))
* scaffold Phase 0 — Expo RN, NativeWind, ESLint, Prettier, strict TS ([aa745da](https://github.com/bthal/OpenRehearse/commit/aa745da764f66a74763fe89f8d93937907fedef3))
* **score-web:** suppress OSMD title/metadata rendering ([bc9e2be](https://github.com/bthal/OpenRehearse/commit/bc9e2be917dfa4040777a5bd634860ea594106e1))
* sort routine and piece lists chronologically by last opening | restyle routine edit view ([a048605](https://github.com/bthal/OpenRehearse/commit/a0486059749260a75ed0e1fc6fcc4f9f840d3d8c))
* v1.0.0 release prep ([0a4c87f](https://github.com/bthal/OpenRehearse/commit/0a4c87ffe0ec8695bef8a9886e7733b017add237))
* **warmup:** add 4-5 drill exercise ([dc2df36](https://github.com/bthal/OpenRehearse/commit/dc2df36d073f0273f875a3fbef855cfb24302c88))
* **warmup:** add arpeggio, chromatic, and five-finger exercises ([75e430a](https://github.com/bthal/OpenRehearse/commit/75e430acac5a51ae074a176b5ec8a16ca738b452))
* **warmup:** add Hanon I and scales warm-up exercises ([2e13a77](https://github.com/bthal/OpenRehearse/commit/2e13a7713b89c9a3226a377a7afe43de6a7e6227))


### Bug Fixes

* clean up en.json ([30fe9f4](https://github.com/bthal/OpenRehearse/commit/30fe9f48250a3b243299582cd158fe9621870594))
* import warnings ([7479307](https://github.com/bthal/OpenRehearse/commit/7479307d7cd6496db1902615e7adf4cad1a2ba7a))
* PageWidth doesn't exist on EngravingRules — the correct API is PageFormat, which takes (width, height). Using new PageFormat(10000, 40000) achieves the same effectively-infinite single-system layout. ([b88caf2](https://github.com/bthal/OpenRehearse/commit/b88caf2df3369b09ea532531853ae841d0f12404))
* **playback:** correct metronome beat alignment for pickup measures ([5d361ae](https://github.com/bthal/OpenRehearse/commit/5d361aea56893104d6d70758d5ca1ee4b85e3093))
* **playback:** correct OSMD halfTone octave offset for Tone.js MIDI ([b04669d](https://github.com/bthal/OpenRehearse/commit/b04669d47f9d134b174648f802e806a045a204be))
* **playback:** create loop at actual scroll position during momentum ([c8e1005](https://github.com/bthal/OpenRehearse/commit/c8e10051aece49e77703edd0bc2fb98d9399d645))
* **playback:** cursor drifts slowly through fermata instead of freezing ([d644c00](https://github.com/bthal/OpenRehearse/commit/d644c002a246824a081c46aa3bcce37a03c17f52))
* **playback:** preserve user tempo and cursor position across pause/play ([179ea27](https://github.com/bthal/OpenRehearse/commit/179ea27fc5850ce22d8a4ffaed841f95c7a99e04))
* **playback:** replace bpm.setValueAtTime with Transport.schedule — fixes replay BPM, ([c90aec0](https://github.com/bthal/OpenRehearse/commit/c90aec0a026b3b95bb55c7addce7e1098f8c6b2c))
* **playback:** tied note double-attacks and repeat timestamp ([7ace3e3](https://github.com/bthal/OpenRehearse/commit/7ace3e3b516077d8c565d6587d22055ccaffb5d1))
* **playview:** hide cursor during load, fix scroll bounds, loop pause, momentum scroll ([b20e054](https://github.com/bthal/OpenRehearse/commit/b20e054b71d96274b8c3d4bfd9a9c6e05d3ddd51))
* read ticks once into posTicks before cancelScheduledValues/bpm.value. ([179ea27](https://github.com/bthal/OpenRehearse/commit/179ea27fc5850ce22d8a4ffaed841f95c7a99e04))
* **routine:** stop playback when opening the routine editor ([699912d](https://github.com/bthal/OpenRehearse/commit/699912dcf7e3ca29ca36417f41189f8edc1230c0))
* **score-web:** re-center score after viewport orientation change ([c9f9959](https://github.com/bthal/OpenRehearse/commit/c9f9959e82b42a055cbd0e642c62a3e269f6d837))

## [1.1.0](https://github.com/bthal/OpenRehearse/compare/v1.0.0...v1.1.0) (2026-08-15)


### Features

* add count-in metronome pre-roll with settings modal ([cf9fb96](https://github.com/bthal/OpenRehearse/commit/cf9fb96fea528fb42ee4113cdab841cb425a7150))
* add per-piece target speed and required-metadata import gate ([697e350](https://github.com/bthal/OpenRehearse/commit/697e350dd38158bcb3c9474dc10998891cb2100d))
* **dashboard:** track practice time and show a day heatmap ([bcee358](https://github.com/bthal/OpenRehearse/commit/bcee358d6dd1f12bb266a09d699b9347148aa53e))
* **playview:** unfurl the loop out of the cursor and restyle its handles ([7314ff8](https://github.com/bthal/OpenRehearse/commit/7314ff8d005f353463847c411cfe7d1fc9ee94c4))
* **warmup:** add arpeggio, chromatic, and five-finger exercises ([75e430a](https://github.com/bthal/OpenRehearse/commit/75e430acac5a51ae074a176b5ec8a16ca738b452))


### Bug Fixes

* **routine:** stop playback when opening the routine editor ([699912d](https://github.com/bthal/OpenRehearse/commit/699912dcf7e3ca29ca36417f41189f8edc1230c0))
* **score-web:** re-center score after viewport orientation change ([c9f9959](https://github.com/bthal/OpenRehearse/commit/c9f9959e82b42a055cbd0e642c62a3e269f6d837))
