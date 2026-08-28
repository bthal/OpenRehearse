import { OpenSheetMusicDisplay, PageFormat, TransposeCalculator } from 'opensheetmusicdisplay';
import {
  initPlayback,
  startPlayback,
  pausePlayback,
  stopPlayback,
  setTempoBpm,
  disposePlayback,
  toggleLoop,
  toggleMetronome,
  setActiveHand,
  setCountIn,
  setSections,
  seekSection,
  setBits,
  createBit,
  leaveBit,
  setInstrumentAudio,
} from './playback';
import type { OutboundMessage } from './types';

function postToNative(msg: OutboundMessage): void {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

let osmd: OpenSheetMusicDisplay | null = null;

// Assign all entry-point globals BEFORE initialising OSMD.
// If the OSMD constructor throws it aborts the IIFE; anything assigned after the throw
// is never set. See compound-docs/osmd-webview.md.
const w = window as unknown as Record<string, unknown>;

/**
 * The practised instrument's bundled samples and its sounding offset.
 *
 * Must arrive before __rn_load_xml, because the Sampler is built during the load.
 * injectJavaScript delivers in order, so native sends the two back to back.
 */
w.__rn_set_instrument_audio = (urlsJson: string, offsetSemitones: number) => {
  try {
    setInstrumentAudio(JSON.parse(urlsJson) as Record<string, string>, offsetSemitones);
  } catch (err) {
    postToNative({
      type: 'ERROR',
      payload: `instrument audio: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

/**
 * Semitones the engraved score is shifted by — the piece's base plus its practice
 * offset, already summed on the native side.
 *
 * Applied between `load()` and `render()`, which is the only window that works: the
 * note grid, the cursor steps and every barline pixel are derived from the *rendered*
 * layout in `initPlayback`, and transposing changes accidentals and key signatures and
 * therefore measure widths. Transposing after the grid is built would leave the two
 * describing different scores. Bits are stored as ticks, so they survive it untouched.
 */
let engravedTransposeSemitones = 0;

w.__rn_set_transpose = (semitones: number) => {
  engravedTransposeSemitones = Number.isFinite(semitones) ? Math.round(semitones) : 0;
};

w.__rn_load_xml = async (xml: string, scheduleJson?: string) => {
  if (!osmd) {
    postToNative({ type: 'ERROR', payload: 'OSMD not ready' });
    return;
  }
  disposePlayback();
  const externalTempoSchedule = scheduleJson
    ? (JSON.parse(scheduleJson) as import('./playback').ExternalTempoChange[])
    : undefined;
  try {
    // Force single-system (one-line) layout.
    // PageWidth = 10000 prevents automatic line wrapping.
    // The XML-attribute flags stop MusicXML <print new-system/new-page> markers from
    // overriding our layout (these are the cause of mid-score system breaks).
    // RenderSingleHorizontalStaffline tells OSMD's own layout engine to do the same.
    osmd.EngravingRules.PageFormat = new PageFormat(10000, 40000);
    osmd.EngravingRules.NewSystemAtXMLNewSystemAttribute = false;
    osmd.EngravingRules.NewSystemAtXMLNewPageAttribute = false;
    osmd.EngravingRules.RenderSingleHorizontalStaffline = true;
    osmd.EngravingRules.RenderTitle = false;
    osmd.EngravingRules.RenderSubtitle = false;
    osmd.EngravingRules.RenderComposer = false;
    osmd.EngravingRules.RenderLyricist = false;
    osmd.EngravingRules.RenderCopyright = false;
    // PlacementEnum.Above = 0. Force all fingerings present in the source MusicXML above
    // their staff line so bass-clef fingerings appear between the staves rather than below
    // the visible area.
    osmd.EngravingRules.FingeringPosition = 0;
    const container = document.getElementById('osmd')!;
    container.style.width = '10000px';
    await osmd.load(xml);
    if (engravedTransposeSemitones !== 0) {
      // OSMD ships TransposeCalculator in the free build but leaves it unset; without
      // it, Sheet.Transpose is silently ignored (OSMD logs a hint and moves on).
      if (!osmd.TransposeCalculator) osmd.TransposeCalculator = new TransposeCalculator();
      osmd.Sheet.Transpose = engravedTransposeSemitones;
      osmd.updateGraphic();
    }
    osmd.render();
    // Trim container to the SVG's actual rendered width (container.scrollWidth would
    // still be 10000px since we set it before render; query the SVG directly).
    const svgEl = container.querySelector('svg');
    container.style.width = `${svgEl ? svgEl.scrollWidth : container.scrollWidth}px`;
    initPlayback(osmd, externalTempoSchedule);
    postToNative({ type: 'LOADED' });
  } catch (err) {
    postToNative({ type: 'ERROR', payload: err instanceof Error ? err.message : String(err) });
  }
};

w.__rn_play = () => {
  void startPlayback();
};

w.__rn_pause = () => {
  pausePlayback();
};

w.__rn_stop = () => {
  stopPlayback();
};

w.__rn_set_tempo = (bpm: number) => {
  setTempoBpm(bpm);
};

w.__rn_toggle_loop = () => {
  toggleLoop();
};

w.__rn_toggle_metronome = () => {
  toggleMetronome();
};

w.__rn_set_active_hand = (hand: 'both' | 'right' | 'left') => {
  setActiveHand(hand);
};

w.__rn_set_count_in = (measures: number) => {
  setCountIn(measures);
};

// Sent after LOADED, not with the XML: section starts are resolved against the
// measure metadata that initPlayback builds, which does not exist before the load.
w.__rn_set_sections = (json: string) => {
  try {
    const parsed = JSON.parse(json) as { measures?: unknown; colors?: unknown };
    const measures = Array.isArray(parsed?.measures) ? (parsed.measures as number[]) : [];
    const colors = Array.isArray(parsed?.colors) ? (parsed.colors as string[]) : [];
    setSections(measures, colors);
  } catch {
    setSections([], []);
  }
};

w.__rn_seek_section = (direction: number) => {
  seekSection(direction);
};

// Sent after LOADED for the same reason as the sections: bits are stored in ticks and
// resolve against the note grid, which initPlayback builds during the load.
w.__rn_set_bits = (json: string) => {
  try {
    const parsed: unknown = JSON.parse(json);
    setBits(Array.isArray(parsed) ? (parsed as import('../../src/domain/bits').Bit[]) : []);
  } catch {
    setBits([]);
  }
};

// The id is minted natively: `crypto.randomUUID` cannot be relied on in every WebView
// this ships to, and a bit's handle has to be stable enough to store.
w.__rn_create_bit = (id: string) => {
  createBit(id);
};

w.__rn_leave_bit = () => {
  leaveBit();
};

const container = document.getElementById('osmd');
if (!container) {
  postToNative({ type: 'ERROR', payload: '#osmd container not found' });
} else {
  try {
    osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false, // PageWidth is set manually before each load for one-line layout
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      followCursor: false, // we control scrolling via translateX
    });
    postToNative({ type: 'DEBUG', payload: 'OSMD ready' });
  } catch (err) {
    postToNative({
      type: 'ERROR',
      payload: `OSMD init: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
