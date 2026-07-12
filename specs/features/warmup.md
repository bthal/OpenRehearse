# Feature: Warm-up exercises

## Goal

Built-in exercises (Hanon No. 1, major/minor scales, arpeggios, chromatic scales, 5-finger
scales, and a 4-5 finger drill) rendered as live score and played back with synthesis — no
file import needed.

## Parameters

Hanon I, Scales, Arpeggios, Chromatic, and 5-Finger scales share the same controls:

| Parameter | Options |
|-----------|---------|
| Key | All 12 pitch classes × major + minor |
| Hand | Both / Right / Left |
| Octaves | 1 / 2 / 3 |
| BPM | 40, 50, 60, 70, 80, 100, 120, 140, 160, 180 |

**4-5 Drill** has a reduced set (key and octave are fixed — always C major, one octave):

| Parameter | Options |
|-----------|---------|
| Hand | Both / Right / Left |
| BPM | 40, 50, 60, 70, 80, 100, 120, 140, 160, 180 |

## Score generation

- MusicXML is generated on-device from parameters; nothing is imported or stored.
- **Scales**: ascending then descending; top note appears once; final root held to fill
  the bar (quarter / half / dotted half depending on octave count).
- **Arpeggios**: rolling-window figuration over the tonic triad (major/minor selects the
  chord quality). The chord tones form a ladder (root/3rd/5th, repeating every octave); the
  exercise plays a sliding window of four consecutive ladder tones, each group starting one
  tone higher. The window's starting note climbs the selected octave count, so the four-wide
  window peaks one octave above that. Example (C major, 1 octave): C-E-G-C · E-G-C-E · G-C-E-G
  · C-E-G-C, then mirrored back down with the final root held.
- **Chromatic**: every semitone from the tonic up the selected octaves and back. The chosen
  key governs only note spelling and the rendered key signature; the pitches are always
  chromatic. Final tonic is a whole note.
- **5-Finger**: scale degrees 1-5 ascending then back to the tonic (C-D-E-F-G-F-E-D-C in C
  major). Multi-octave runs climb the five-note pattern into each successive octave before
  the mirror brings it back down.
- **Hanon No. 1**: 7 ascending cells per octave (peak at degree 7n+4); symmetric
  descent; whole-note landing. First 16 ascending notes fingered 1-2-3-4-5-4-3-2 ×2;
  first 16 descending 5-4-3-2-1-2-3-4 ×2.
- **4-5 Drill**: 6 measures of 4/4 in C major. Grand staff with two voices per hand.
  RH voice 1 (fingers 4+5): C5/B4 alternating eighths. RH voice 2 (fingers 1–3): ascending
  half-note melody C4→A4 then descending G4→C4. LH mirrors in contrary motion. Final measure:
  whole notes, 5-4 eighths stop. Fingering notation on first 5 and first 4 only.
  The Key and Octave toolbar panels are hidden for this exercise.
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

---

## Routines

A **Routine** is an ordered list of exercise blocks (Hanon I, Scales, Arpeggios, Chromatic, 5-Finger) and optional Pause blocks, rendered and played back as a single continuous score.

### Dashboard

- A **Routines** sub-section appears below the Hanon/Scales rows, with a **New Routine** button.
- Routine rows support long-press selection (like pieces), but routines and pieces cannot be selected simultaneously.
- Selecting one routine: shows **Edit** + **Delete**. Selecting multiple: shows **Delete** only.
- Tapping a routine row (not in selection mode) opens the Routine Playview.

### Edit view (portrait, `app/routine/edit.tsx`)

- Accessible via **New Routine** (no id param) or **Edit** (id param) from the dashboard.
- Header: back arrow (with unsaved-changes guard) | title "New Routine"/"Edit Routine" | Save button.
- Body: name TextInput field, then a `FlatList` of blocks with **+ Add Exercise** buttons between/after every block.
- Each exercise block row: up/down arrow buttons (reorder) | exercise name | delete (with confirm). Below: parameter pills (Key, BPM, Hand, Octaves) that open a centred picker Modal on tap. Key and Octave pills are hidden for drill45 blocks.
- Each pause block row: up/down arrow buttons | "Pause" | delete. Below: a measures pill (1 / 2 / 3 / 4 measures) that opens the same centred picker Modal.
- **Validation** (enforced before Save is enabled): at least one exercise block; last block is not a pause.

### Routine Playview (landscape, `app/routine/[id].tsx`)

- Simplified toolbar: back arrow, play/pause, metronome only. No loop, no speed panel.
- Generates a combined MusicXML via `generateRoutineXml(routine)` in `domain/routineMusicXml.ts`.
- Score always uses 2 staves (treble + bass); single-hand exercises fill the unused staff with whole-note rests.
- Each exercise block's first measure includes a `<rehearsal>` section label (e.g. "Hanon I", "Scales") and a `<sound tempo="X"/>` directive.
- Pause blocks appear as rest measures with a "Pause" rehearsal mark; they play at the BPM of the **next** exercise block.
- Tempo changes are driven by `computeRoutineTempoSchedule()` in `domain/routineMusicXml.ts`, which computes cumulative quarter-beat positions for each BPM change. `initPlayback` receives this as `externalTempoSchedule` and registers each change via `Tone.Transport.schedule()` so BPM fires at the correct tick on every play and replay. OSMD's `<sound tempo>` detection is bypassed when an external schedule is provided.

### Acceptance criteria

- [X] "New Routine" button creates an empty routine; edit view opens.
- [X] Blocks can be added (Hanon I, Scales, 4-5 Drill, Pause), reordered, and deleted with confirm.
- [X] Exercise parameter pills update the block.
- [X] Save is disabled until the routine has a title, ≥1 exercise block, and the last block is not a pause.
- [X] Saved routine appears in the dashboard; persists after app restart.
- [X] Opening a routine in the playview renders the combined score with section labels, tempo markers, and pause measures.
- [X] Playback respects per-block BPM: exercise 1 at 60 BPM, exercise 2 at 120 BPM plays at the correct speeds.
- [X] Pause measures are silent and at the correct duration.
- [X] Metronome toggle works in routine playview.
- [X] Routine and piece selection modes are mutually exclusive in the dashboard.
