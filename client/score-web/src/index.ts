import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  initPlayback,
  startPlayback,
  pausePlayback,
  stopPlayback,
  setTempoBpm,
  disposePlayback,
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

w.__rn_load_xml = async (xml: string) => {
  if (!osmd) {
    postToNative({ type: 'ERROR', payload: 'OSMD not ready' });
    return;
  }
  disposePlayback();
  try {
    await osmd.load(xml);
    osmd.render();
    initPlayback(osmd);
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

const container = document.getElementById('osmd');
if (!container) {
  postToNative({ type: 'ERROR', payload: '#osmd container not found' });
} else {
  try {
    osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      followCursor: true,
    });
    postToNative({ type: 'DEBUG', payload: 'OSMD ready' });
  } catch (err) {
    postToNative({
      type: 'ERROR',
      payload: `OSMD init: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
