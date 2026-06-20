# Feature: Warm-up exercises

## Goal

Built-in exercises (Hanon No. 1 and major/minor scales) rendered as live score
and played back with synthesis — no file import needed.

## Parameters

Both exercises share the same controls:

| Parameter | Options |
|-----------|---------|
| Key | All 12 pitch classes × major + minor |
| Hand | Both / Right / Left |
| Octaves | 1 / 2 / 3 |
| BPM | 40, 50, 60, 70, 80, 100, 120, 140, 160, 180 |

## Score generation

- MusicXML is generated on-device from parameters; nothing is imported or stored.
- **Scales**: ascending then descending; top note appears once; final root held to fill
  the bar (quarter / half / dotted half depending on octave count).
- **Hanon No. 1**: 7 ascending cells per octave (peak at degree 7n+4); symmetric
  descent; whole-note landing. First 16 ascending notes fingered 1-2-3-4-5-4-3-2 ×2;
  first 16 descending 5-4-3-2-1-2-3-4 ×2.
- Eighth notes beamed in groups of 4. No tempo marking rendered in score;
  BPM injected via WebView bridge after LOADED.

## UI

- Dashboard shows a **Warm-ups** section above the piece list.
- Warm-up view is **landscape**; left toolbar: back, play/pause, metronome, BPM, hand,
  key, octave. Each picker opens a sliding panel over the score; opening pauses playback.
- Settings persisted per exercise type to device storage (`warmup-settings.json`).

## Acceptance criteria

- [ ] Dashboard rows navigate to the correct warm-up view.
- [ ] Score renders correctly for all key/hand/octave combinations.
- [ ] Play/pause, BPM change, and metronome toggle work correctly.
- [ ] Settings survive app restart.
- [ ] Changing any parameter while playing pauses playback and re-generates the score.
