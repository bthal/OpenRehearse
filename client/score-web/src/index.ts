import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { OutboundMessage } from './types';

function postToNative(msg: OutboundMessage): void {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

// Assign the entry point BEFORE initialising OSMD. If OSMD's constructor throws
// it kills the whole IIFE; anything assigned after the throw is never set.
// See compound-docs/osmd-webview.md.
let osmd: OpenSheetMusicDisplay | null = null;

(window as unknown as { __rn_load_xml: (xml: string) => void }).__rn_load_xml = async (
  xml: string,
) => {
  if (!osmd) {
    postToNative({ type: 'ERROR', payload: 'OSMD did not initialise — check init error' });
    return;
  }
  try {
    await osmd.load(xml);
    osmd.render();
    postToNative({ type: 'LOADED' });
  } catch (err) {
    postToNative({ type: 'ERROR', payload: err instanceof Error ? err.message : String(err) });
  }
};

const container = document.getElementById('osmd');
if (!container) {
  postToNative({ type: 'ERROR', payload: 'OSMD container #osmd not found' });
} else {
  try {
    osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      followCursor: false,
    });
    postToNative({ type: 'DEBUG', payload: 'OSMD ready' });
  } catch (err) {
    postToNative({
      type: 'ERROR',
      payload: `OSMD init error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
