# Mission

We are building a **practice companion for piano students**: rendered sheet music, **synthesized** audio derived from the score, a **moving cursor** aligned with playback, and a user-defined **loop** over a small segment of the piece—conceptually similar to Flowkey **without** instructional video.

The app prioritizes **focused repetition** (loop a phrase or transition), **clear musical timing**, and **respect for user data and copyright sensitivity** by keeping scores **on-device** for the foreseeable MVP.

## Success criteria (product)

- A student can **import** a piece, open **PlayView**, set **tempo**, hear **audio that matches the notation**, and **loop one active region** with the cursor and loop boundaries behaving predictably.
- The experience is **usable offline** after import.
- The codebase stays **modular** so future work (Anki-like bits, hierarchy, further instruments) extends the same domain model rather than replacing it. Instruments now do exactly that: `INSTRUMENT_REGISTRY` is a row plus a sample set, not a refactor.
