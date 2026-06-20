import {
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiClose,
  mdiMetronome,
  mdiMusicNoteOutline,
  mdiPause,
  mdiPlay,
  mdiRepeat,
  mdiSpeedometer,
} from '@mdi/js';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { pieceRepository } from '@data/index';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { usePiecesStore } from '@state/piecesStore';
import { TEMPO_MULTIPLIERS, type TempoMultiplier, usePlayViewStore } from '@state/playViewStore';

const MULTIPLIER_LABEL: Record<number, string> = {
  0.5: '×0.5',
  0.75: '×0.75',
  1: '×1.0',
};

const SPEED_PANEL_WIDTH = 132;

export default function PlayView() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const piece = usePiecesStore((s) => (id ? s.piecesById[id] : undefined));

  const webViewReady = usePlayViewStore((s) => s.webViewReady);
  const isLoadingScore = usePlayViewStore((s) => s.isLoadingScore);
  const scoreError = usePlayViewStore((s) => s.scoreError);
  const isPlaying = usePlayViewStore((s) => s.isPlaying);
  const scoreBpm = usePlayViewStore((s) => s.scoreBpm);
  const tempoMultiplier = usePlayViewStore((s) => s.tempoMultiplier);
  const loopActive = usePlayViewStore((s) => s.loopActive);
  const metronomeOn = usePlayViewStore((s) => s.metronomeOn);

  const setWebViewReady = usePlayViewStore((s) => s.setWebViewReady);
  const setLoadingScore = usePlayViewStore((s) => s.setLoadingScore);
  const setScoreError = usePlayViewStore((s) => s.setScoreError);
  const setPlaying = usePlayViewStore((s) => s.setPlaying);
  const setScoreBpm = usePlayViewStore((s) => s.setScoreBpm);
  const setTempoMultiplier = usePlayViewStore((s) => s.setTempoMultiplier);
  const setLoopActive = usePlayViewStore((s) => s.setLoopActive);
  const setMetronomeOn = usePlayViewStore((s) => s.setMetronomeOn);
  const reset = usePlayViewStore((s) => s.reset);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [speedAnim] = useState(() => new Animated.Value(0));
  const [panelLayout, setPanelLayout] = useState({ top: 0, left: 0 });

  const scoreAreaRef = useRef<View>(null);
  const speedTriggerRef = useRef<View>(null);
  const toolbarRef = useRef<View>(null);
  const webViewRef = useRef<WebView>(null);
  // Refs so the message handler and multiplier handler always see the latest values
  // without recreating callbacks on every state change.
  const scoreBpmRef = useRef(120);
  const tempoMultiplierRef = useRef<TempoMultiplier>(1.0);
  useEffect(() => {
    scoreBpmRef.current = scoreBpm;
  }, [scoreBpm]);
  useEffect(() => {
    tempoMultiplierRef.current = tempoMultiplier;
  }, [tempoMultiplier]);

  useEffect(() => () => reset(), [reset]);

  const toggleSpeed = useCallback(() => {
    const opening = !speedOpen;
    if (opening) {
      if (isPlaying) {
        webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      }
      speedTriggerRef.current?.measureLayout(
        scoreAreaRef.current as never,
        (_tx, ty, _tw, th) => {
          toolbarRef.current?.measureLayout(
            scoreAreaRef.current as never,
            (_bx, _by, bw) => setPanelLayout({ top: ty + th / 2 - 22, left: bw }),
            () => {},
          );
        },
        () => {},
      );
    }
    setSpeedOpen(opening);
    Animated.spring(speedAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: false,
      bounciness: 4,
      speed: 18,
    }).start();
  }, [speedOpen, speedAnim, isPlaying]);

  const sendXml = useCallback(async () => {
    if (!piece) return;
    setLoadingScore(true);
    setScoreError(null);
    try {
      const xml = await pieceRepository.readXml(piece);
      // injectJavaScript is the correct native→web channel; see compound-docs/osmd-webview.md
      webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);
    } catch (err) {
      setLoadingScore(false);
      setScoreError(err instanceof Error ? err.message : t('playView.failedToReadScore'));
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
        case 'SCORE_BPM':
          setScoreBpm(msg.payload);
          // Transport BPM is already set in the WebView by initPlayback at this value.
          // No need to re-send unless the user has a non-1.0 multiplier selected already.
          if (tempoMultiplierRef.current !== 1.0) {
            const bpm = Math.round(msg.payload * tempoMultiplierRef.current);
            webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpm});void 0;`);
          }
          break;
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
        case 'PLAYBACK_STATE':
          setPlaying(msg.payload === 'playing');
          break;
        case 'PLAYBACK_END':
          setPlaying(false);
          break;
        case 'LOOP_STATE':
          setLoopActive(msg.payload);
          break;
      }
    },
    [setScoreBpm, setLoadingScore, setScoreError, setPlaying, setLoopActive],
  );

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
    } else {
      webViewRef.current?.injectJavaScript('window.__rn_play();void 0;');
    }
  }, [isPlaying]);

  const handleMultiplierChange = useCallback(
    (m: TempoMultiplier) => {
      if (isPlaying) {
        webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      }
      setTempoMultiplier(m);
      const bpm = Math.round(scoreBpmRef.current * m);
      webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpm});void 0;`);
    },
    [setTempoMultiplier, isPlaying],
  );

  const handleLoopToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_loop();void 0;');
  }, []);

  const handleMetronomeToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_metronome();void 0;');
    setMetronomeOn(!metronomeOn);
  }, [metronomeOn, setMetronomeOn]);

  const effectiveBpm = Math.round(scoreBpm * tempoMultiplier);
  const scoreReady = webViewReady && !isLoadingScore && !scoreError;

  if (!piece) {
    return (
      <>
        <Stack.Screen options={{ orientation: 'landscape' }} />
        <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
          <Text className="text-base text-gray-500">{t('playView.pieceNotFound')}</Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-4">
            <Text className="text-blue-500 text-base">{t('common.goBack')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ orientation: 'landscape' }} />
      <SafeAreaView className="flex-1 bg-white">
        {/* Score area — WebView fills all space, toolbar floats over it */}
        <View ref={scoreAreaRef} className="flex-1">
          {/* baseUrl required on Android for large inline HTML; allowUniversalAccessFromFileURLs
            lets the file:// origin fetch HTTPS audio samples — see compound-docs */}
          <WebView
            ref={webViewRef}
            source={{ html: SCORE_WEB_HTML, baseUrl: 'file:///android_asset/' }}
            originWhitelist={['*']}
            allowUniversalAccessFromFileURLs={true}
            onLoadEnd={() => setWebViewReady(true)}
            onMessage={handleMessage}
            scrollEnabled={false}
            javaScriptEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            style={{ flex: 1 }}
          />

          {/* Toolbar — vertically centered, left-side overlay */}
          {scoreReady && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
              }}
            >
              <View
                ref={toolbarRef}
                className="bg-white rounded-r-xl py-3 px-2 items-center gap-4"
                style={{
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 6,
                  shadowOffset: { width: 2, height: 0 },
                }}
              >
                {/* Back */}
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="p-1">
                  <AppIcon path={mdiArrowLeft} size={24} color="#374151" />
                </TouchableOpacity>

                {/* Loop select / clear */}
                <TouchableOpacity onPress={handleLoopToggle} hitSlop={8} className="p-1.5">
                  <AppIcon
                    path={loopActive ? mdiClose : mdiRepeat}
                    size={26}
                    color={loopActive ? '#9C6B8A' : '#374151'}
                  />
                </TouchableOpacity>

                {/* Play / Pause */}
                <TouchableOpacity onPress={handlePlayPause} hitSlop={8} className="p-1">
                  <AppIcon path={isPlaying ? mdiPause : mdiPlay} size={36} color="#4B7A6E" />
                </TouchableOpacity>

                {/* Metronome toggle */}
                <TouchableOpacity onPress={handleMetronomeToggle} hitSlop={8} className="p-1.5">
                  <AppIcon
                    path={mdiMetronome}
                    size={26}
                    color={metronomeOn ? '#4B7A6E' : '#374151'}
                  />
                </TouchableOpacity>

                {/* Speed trigger — icon when open, current speed label when closed */}
                <View ref={speedTriggerRef}>
                  <TouchableOpacity
                    onPress={toggleSpeed}
                    hitSlop={8}
                    className="items-center px-2 py-1"
                  >
                    <View style={{ height: 22, justifyContent: 'center', alignItems: 'center' }}>
                      {speedOpen ? (
                        <AppIcon path={mdiSpeedometer} size={22} color="#4B7A6E" />
                      ) : (
                        <Text className="text-base font-semibold text-gray-700">
                          {MULTIPLIER_LABEL[tempoMultiplier]}
                        </Text>
                      )}
                    </View>
                    <Text className="text-[9px] text-black mt-0.5">
                      {effectiveBpm} {t('playView.bpm')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Speed panel — overlays the score, anchored to the speed trigger position */}
          <Animated.View
            pointerEvents={speedOpen ? 'auto' : 'none'}
            style={{
              position: 'absolute',
              top: panelLayout.top,
              left: panelLayout.left,
              width: speedAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, SPEED_PANEL_WIDTH],
                extrapolate: 'clamp',
              }),
              overflow: 'hidden',
              flexDirection: 'row',
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderRadius: 10,
              elevation: 4,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 6,
              shadowOffset: { width: 2, height: 0 },
            }}
          >
            {TEMPO_MULTIPLIERS.map((m) => {
              const isActive = tempoMultiplier === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    handleMultiplierChange(m);
                    toggleSpeed();
                  }}
                  hitSlop={4}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isActive ? '#4B7A6E' : '#9CA3AF',
                    }}
                  >
                    {MULTIPLIER_LABEL[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Overlay: WebView not yet loaded */}
          {!webViewReady && !scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <AppIcon path={mdiMusicNoteOutline} size={48} color="#D1D5DB" />
              <Text className="mt-3 text-sm text-gray-400">{t('playView.preparingScore')}</Text>
            </View>
          )}

          {/* Overlay: XML sent, OSMD rendering */}
          {isLoadingScore && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color="#4B7A6E" />
              <Text className="mt-3 text-sm text-gray-500">{t('playView.loadingScore')}</Text>
            </View>
          )}

          {/* Error state */}
          {scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white px-8">
              <AppIcon path={mdiAlertCircleOutline} size={48} color="#9C6B8A" />
              <Text className="mt-3 text-base font-semibold text-gray-800 text-center">
                {t('playView.couldNotRender')}
              </Text>
              <Text className="mt-1 text-sm text-gray-500 text-center">{scoreError}</Text>
              <TouchableOpacity
                className="mt-5 px-5 py-2.5 rounded-lg bg-seagrass-600 active:bg-seagrass-700"
                onPress={() => reset()}
              >
                <Text className="text-sm font-semibold text-ash-grey-50">{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}
