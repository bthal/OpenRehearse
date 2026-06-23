import {
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiMetronome,
  mdiMetronomeTick,
  mdiMusicNoteOutline,
  mdiPause,
  mdiPencilOutline,
  mdiPlay,
} from '@mdi/js';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { computeRoutineTempoSchedule, generateRoutineXml } from '@domain/routineMusicXml';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { usePlayViewStore } from '@state/playViewStore';
import { useRoutinesStore } from '@state/routinesStore';

export default function RoutinePlayView() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const routine = useRoutinesStore((s) => s.routines.find((r) => r.id === id));

  const webViewReady = usePlayViewStore((s) => s.webViewReady);
  const isLoadingScore = usePlayViewStore((s) => s.isLoadingScore);
  const scoreError = usePlayViewStore((s) => s.scoreError);
  const isPlaying = usePlayViewStore((s) => s.isPlaying);
  const metronomeOn = usePlayViewStore((s) => s.metronomeOn);

  const setWebViewReady = usePlayViewStore((s) => s.setWebViewReady);
  const setLoadingScore = usePlayViewStore((s) => s.setLoadingScore);
  const setScoreError = usePlayViewStore((s) => s.setScoreError);
  const setPlaying = usePlayViewStore((s) => s.setPlaying);
  const setMetronomeOn = usePlayViewStore((s) => s.setMetronomeOn);
  const reset = usePlayViewStore((s) => s.reset);

  const webViewRef = useRef<WebView>(null);

  useEffect(() => () => reset(), [reset]);

  // Generate XML + precise tempo schedule once per routine identity
  const { xml, tempoScheduleJson } = useMemo(() => {
    if (!routine) return { xml: null, tempoScheduleJson: null };
    try {
      return {
        xml: generateRoutineXml(routine),
        tempoScheduleJson: JSON.stringify(computeRoutineTempoSchedule(routine)),
      };
    } catch {
      return { xml: null, tempoScheduleJson: null };
    }
  }, [routine]);

  const sendXml = useCallback(() => {
    if (!xml) {
      setScoreError(t('routinePlay.failedToGenerate'));
      return;
    }
    setLoadingScore(true);
    setScoreError(null);
    const scheduleArg = JSON.stringify(tempoScheduleJson);
    webViewRef.current?.injectJavaScript(
      `window.__rn_load_xml(${JSON.stringify(xml)}, ${scheduleArg});void 0;`,
    );
  }, [xml, tempoScheduleJson, setLoadingScore, setScoreError, t]);

  useEffect(() => {
    if (webViewReady) sendXml();
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
        case 'PLAYBACK_STATE':
          setPlaying(msg.payload === 'playing');
          break;
        case 'PLAYBACK_END':
          setPlaying(false);
          break;
        default:
          break;
      }
    },
    [setLoadingScore, setScoreError, setPlaying],
  );

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
    } else {
      webViewRef.current?.injectJavaScript('window.__rn_play();void 0;');
    }
  }, [isPlaying]);

  const handleMetronomeToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_metronome();void 0;');
    setMetronomeOn(!metronomeOn);
  }, [metronomeOn, setMetronomeOn]);

  const scoreReady = webViewReady && !isLoadingScore && !scoreError;

  if (!routine) {
    return (
      <>
        <Stack.Screen options={{ orientation: 'landscape' }} />
        <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-base text-gray-500">{t('routinePlay.routineNotFound')}</Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-4">
            <Text className="text-base text-blue-500">{t('common.goBack')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ orientation: 'landscape' }} />
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1">
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

          {/* WebView loading overlay */}
          {!webViewReady && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <AppIcon path={mdiMusicNoteOutline} size={48} color="#9CA3AF" />
              <Text className="mt-3 text-sm text-ash-grey-400">
                {t('routinePlay.preparingScore')}
              </Text>
            </View>
          )}

          {/* Score loading overlay */}
          {webViewReady && isLoadingScore && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color="#4B7A6E" />
              <Text className="mt-3 text-sm text-ash-grey-400">
                {t('routinePlay.loadingScore')}
              </Text>
            </View>
          )}

          {/* Error overlay */}
          {scoreError ? (
            <View className="absolute inset-0 items-center justify-center bg-white/80 px-8">
              <AppIcon path={mdiAlertCircleOutline} size={48} color="#9C6B8A" />
              <Text className="mt-3 text-center text-sm text-ash-grey-950">
                {t('routinePlay.couldNotRender')}
              </Text>
              <Text className="mt-1 text-center text-xs text-ash-grey-400">{scoreError}</Text>
              <TouchableOpacity
                onPress={() => {
                  reset();
                  setWebViewReady(true);
                }}
                className="mt-4 rounded-lg border border-seagrass-600 px-4 py-2"
              >
                <Text className="text-sm font-semibold text-seagrass-600">{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Toolbar — left-side overlay, vertically centered */}
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
                className="items-center gap-4 rounded-xl bg-white px-2 py-3"
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

                {/* Play / Pause */}
                <TouchableOpacity onPress={handlePlayPause} hitSlop={8} className="p-1">
                  <AppIcon path={isPlaying ? mdiPause : mdiPlay} size={36} color="#4B7A6E" />
                </TouchableOpacity>

                {/* Metronome toggle */}
                <TouchableOpacity onPress={handleMetronomeToggle} hitSlop={8} className="p-1.5">
                  <AppIcon
                    path={metronomeOn ? mdiMetronome : mdiMetronomeTick}
                    size={26}
                    color={metronomeOn ? '#4B7A6E' : '#374151'}
                  />
                </TouchableOpacity>

                {/* Edit routine */}
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/routine/edit', params: { id } })}
                  hitSlop={8}
                  className="p-1"
                >
                  <AppIcon path={mdiPencilOutline} size={24} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}
