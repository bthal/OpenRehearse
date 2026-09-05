# Changelog

## [1.2.0](https://github.com/bthal/OpenRehearse/compare/v1.1.0...v1.2.0) (2026-09-05)


### Features

* **brand:** replace the seagrass palette with the navy piano identity ([#13](https://github.com/bthal/OpenRehearse/issues/13)) ([4848994](https://github.com/bthal/OpenRehearse/commit/484899410a6d917aeb4ef1a61ec51d0731bdc515))
* **dashboard:** add streaks and day details to the practice heatmap ([#10](https://github.com/bthal/OpenRehearse/issues/10)) ([3c5df99](https://github.com/bthal/OpenRehearse/commit/3c5df995d5897aed38222fd306656360906323a5))
* **playview:** discretise cursor and loop handles onto a barline-aligned note grid ([#11](https://github.com/bthal/OpenRehearse/issues/11)) ([e80a44d](https://github.com/bthal/OpenRehearse/commit/e80a44d33478d7fee0240fa01a84475edf30370b))
* **playview:** put play on the cursor, clear the screen while playing, fix count-in taps ([#15](https://github.com/bthal/OpenRehearse/issues/15)) ([96a9753](https://github.com/bthal/OpenRehearse/commit/96a9753d81973f7ff9d93a47458c81fa9b2dcdee))
* **playview:** remember speed and metronome per piece, set the routine's in the builder ([#20](https://github.com/bthal/OpenRehearse/issues/20)) ([1c69629](https://github.com/bthal/OpenRehearse/commit/1c6962945943ddc07e8a47797b56c5e7d681f3f0))
* **playview:** save loop selections as bits ([#18](https://github.com/bthal/OpenRehearse/issues/18)) ([884127d](https://github.com/bthal/OpenRehearse/commit/884127d02783bf2cc7da9bb366c42efa54c29692))
* **sections:** align section junctions to barlines and resolve them in score order ([#5](https://github.com/bthal/OpenRehearse/issues/5)) ([4d44558](https://github.com/bthal/OpenRehearse/commit/4d44558a81922770e89d668f09b006bcb5dd40dc))
* **sections:** let users create, edit and delete sections in the piece editor ([#12](https://github.com/bthal/OpenRehearse/issues/12)) ([c206f06](https://github.com/bthal/OpenRehearse/commit/c206f06a4230bf810da589c580f87818431ac1c8))
* **warmup:** add Hanon Nos. 2-20 from the reference edition ([#17](https://github.com/bthal/OpenRehearse/issues/17)) ([43ec26d](https://github.com/bthal/OpenRehearse/commit/43ec26df53cdeb1faed07ba6037eed32e8b5cc74))
* **warmup:** add peak repeats to the 4-5 drill ([#9](https://github.com/bthal/OpenRehearse/issues/9)) ([f3941b4](https://github.com/bthal/OpenRehearse/commit/f3941b49d5f7be235a78279f7c3f47e29df30722))


### Bug Fixes

* **playview:** end a piece on its closing barline, not a measure past it ([#23](https://github.com/bthal/OpenRehearse/issues/23)) ([c13c475](https://github.com/bthal/OpenRehearse/commit/c13c4754a26bcacbecc3adb3feb1ad8f1336427c))
* **playview:** keep the playhead on noteheads while it moves ([#19](https://github.com/bthal/OpenRehearse/issues/19)) ([c4fc62b](https://github.com/bthal/OpenRehearse/commit/c4fc62be77045c2df2bab90b3803f233e581d67b))
* **playview:** sound the first note of a loop, which Tone filed one tick too early ([#21](https://github.com/bthal/OpenRehearse/issues/21)) ([c938426](https://github.com/bthal/OpenRehearse/commit/c938426c11123eaede1003a2b302cb70d29072e6))

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
