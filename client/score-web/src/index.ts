import { OpenSheetMusicDisplay, PageFormat } from 'opensheetmusicdisplay';
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
  setFingeringData,
  buildFingeringXml,
  debugFingeringAreas,
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

w.__rn_load_xml = async (xml: string, scheduleJson?: string, fingeringJson?: string) => {
  if (!osmd) {
    postToNative({ type: 'ERROR', payload: 'OSMD not ready' });
    return;
  }
  disposePlayback();
  const externalTempoSchedule = scheduleJson
    ? (JSON.parse(scheduleJson) as import('./playback').ExternalTempoChange[])
    : undefined;
  const storedFingering: Record<string, number> = fingeringJson ? JSON.parse(fingeringJson) : {};
  // setFingeringData returns the resolved map: storedFingering if non-empty, otherwise
  // fingerings extracted from the raw XML (so imported fingerings are tracked from day one).
  const resolvedFingeringMap = setFingeringData(xml, storedFingering);
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
    // PlacementEnum.Above = 0. Force all fingerings above their staff line so bass-clef
    // fingerings appear between the staves rather than below the visible area.
    osmd.EngravingRules.FingeringPosition = 0;
    const container = document.getElementById('osmd')!;
    container.style.width = '10000px';
    const xmlToLoad =
      Object.keys(resolvedFingeringMap).length > 0
        ? buildFingeringXml(xml, resolvedFingeringMap)
        : xml;
    await osmd.load(xmlToLoad);
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

w.__rn_debug_fingering_areas = (show: boolean) => {
  debugFingeringAreas(show);
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
