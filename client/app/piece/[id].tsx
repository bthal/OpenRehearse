import { mdiAlertCircleOutline, mdiArrowLeft, mdiMusicNoteOutline } from '@mdi/js';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AppIcon } from '@components/AppIcon';
import { pieceRepository } from '@data/index';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { usePiecesStore } from '@state/piecesStore';
import { usePlayViewStore } from '@state/playViewStore';

export default function PlayView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const piece = usePiecesStore((s) => (id ? s.piecesById[id] : undefined));

  const webViewReady = usePlayViewStore((s) => s.webViewReady);
  const isLoadingScore = usePlayViewStore((s) => s.isLoadingScore);
  const scoreError = usePlayViewStore((s) => s.scoreError);
  const setWebViewReady = usePlayViewStore((s) => s.setWebViewReady);
  const setLoadingScore = usePlayViewStore((s) => s.setLoadingScore);
  const setScoreError = usePlayViewStore((s) => s.setScoreError);
  const reset = usePlayViewStore((s) => s.reset);

  const webViewRef = useRef<WebView>(null);

  // Reset store on unmount so stale state doesn't persist between navigations.
  useEffect(() => () => reset(), [reset]);

  const sendXml = useCallback(async () => {
    if (!piece) return;
    setLoadingScore(true);
    setScoreError(null);
    try {
      const xml = await pieceRepository.readXml(piece);
      // injectJavaScript is the correct native→web channel; postMessage() on the
      // ref is web→native only (see compound-docs/osmd-webview.md).
      webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);
    } catch (err) {
      setLoadingScore(false);
      setScoreError(err instanceof Error ? err.message : 'Failed to read score file.');
    }
  }, [piece, setLoadingScore, setScoreError]);

  useEffect(() => {
    if (webViewReady) void sendXml();
  }, [webViewReady, sendXml]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: WebToNativeMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data) as WebToNativeMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'LOADED':
          setLoadingScore(false);
          break;
        case 'ERROR':
          setLoadingScore(false);
          setScoreError(msg.payload);
          break;
        case 'DEBUG':
          console.log('[score-web]', msg.payload);
          break;
      }
    },
    [setLoadingScore, setScoreError],
  );

  if (!piece) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-base text-gray-500">Piece not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-blue-500 text-base">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <AppIcon path={mdiArrowLeft} size={24} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1 min-w-0">
          <Text className="text-lg font-semibold text-gray-900" numberOfLines={1}>
            {piece.title}
          </Text>
          {piece.composer && (
            <Text className="text-sm text-gray-500 italic" numberOfLines={1}>
              {piece.composer}
            </Text>
          )}
        </View>
      </View>

      {/* Score area */}
      <View className="flex-1">
        {/* baseUrl is required on Android — see compound-docs/osmd-webview.md */}
        <WebView
          ref={webViewRef}
          source={{ html: SCORE_WEB_HTML, baseUrl: 'file:///android_asset/' }}
          originWhitelist={['*']}
          onLoadEnd={() => setWebViewReady(true)}
          onMessage={handleMessage}
          scrollEnabled={true}
          javaScriptEnabled={true}
          style={{ flex: 1 }}
        />

        {/* Overlay: WebView loaded but OSMD not yet initialised */}
        {!webViewReady && !scoreError && (
          <View className="absolute inset-0 items-center justify-center bg-white">
            <AppIcon path={mdiMusicNoteOutline} size={48} color="#D1D5DB" />
            <Text className="mt-3 text-sm text-gray-400">Preparing score…</Text>
          </View>
        )}

        {/* Overlay: XML sent, waiting for OSMD LOADED */}
        {isLoadingScore && (
          <View className="absolute inset-0 items-center justify-center bg-white/80">
            <ActivityIndicator size="large" color="#4B7A6E" />
            <Text className="mt-3 text-sm text-gray-500">Loading score…</Text>
          </View>
        )}

        {/* Error state */}
        {scoreError && (
          <View className="absolute inset-0 items-center justify-center bg-white px-8">
            <AppIcon path={mdiAlertCircleOutline} size={48} color="#9C6B8A" />
            <Text className="mt-3 text-base font-semibold text-gray-800 text-center">
              Could not render score
            </Text>
            <Text className="mt-1 text-sm text-gray-500 text-center">{scoreError}</Text>
            <TouchableOpacity
              className="mt-5 px-5 py-2.5 rounded-lg bg-seagrass-600 active:bg-seagrass-700"
              onPress={() => reset()}
            >
              <Text className="text-sm font-semibold text-ash-grey-50">Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
