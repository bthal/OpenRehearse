import { useEffect, type RefObject } from 'react';
import type WebView from 'react-native-webview';

import { useSettingsStore } from '@state/settingsStore';

/**
 * Keeps the WebView's count-in setting in sync with the settings store: loads
 * the persisted value and injects it once the WebView is ready and whenever it
 * changes. Setting it is order-independent with the XML load — the WebView keeps
 * the value across score reloads (see disposePlayback).
 */
export function useCountInSync(
  webViewRef: RefObject<WebView | null>,
  webViewReady: boolean,
): void {
  const countInMeasures = useSettingsStore((s) => s.countInMeasures);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!webViewReady) return;
    webViewRef.current?.injectJavaScript(`window.__rn_set_count_in(${countInMeasures});void 0;`);
  }, [webViewReady, countInMeasures, webViewRef]);
}
