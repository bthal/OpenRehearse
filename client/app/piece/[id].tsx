import {
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiClose,
  mdiHandBackLeft,
  mdiHandBackRight,
  mdiHandClap,
  mdiMetronome,
  mdiMetronomeTick,
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
import { SectionLabel } from '@components/SectionLabel';
import { pieceRepository } from '@data/index';
import type { Section } from '@domain/sections';
import { SectionColors } from '@theme/colors';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { useCountInSync } from '@score-web/useCountInSync';
import { usePiecesStore } from '@state/piecesStore';
import {
  TEMPO_MULTIPLIERS,
  type ActiveHand,
  type TempoMultiplier,
  usePlayViewStore,
} from '@state/playViewStore';

const MULTIPLIER_LABEL: Record<number, string> = {
  0.5: '×0.5',
  0.75: '×0.75',
  1: '×1.0',
};

const SPEED_PANEL_WIDTH = 132;
const HAND_PANEL_WIDTH = 132; // 3 × 44 px

const HAND_OPTIONS: ActiveHand[] = ['both', 'left', 'right'];

const HAND_ICON: Record<ActiveHand, string> = {
  both: mdiHandClap,
  left: mdiHandBackLeft,
  right: mdiHandBackRight,
};

export default function PlayView() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const piece = usePiecesStore((s) => (id ? s.piecesById[id] : undefined));
  const touchPiece = usePiecesStore((s) => s.touchPiece);

  const webViewReady = usePlayViewStore((s) => s.webViewReady);
  const isLoadingScore = usePlayViewStore((s) => s.isLoadingScore);
  const scoreError = usePlayViewStore((s) => s.scoreError);
  const isPlaying = usePlayViewStore((s) => s.isPlaying);
  const scoreBpm = usePlayViewStore((s) => s.scoreBpm);
  const tempoMultiplier = usePlayViewStore((s) => s.tempoMultiplier);
  const loopActive = usePlayViewStore((s) => s.loopActive);
  const metronomeOn = usePlayViewStore((s) => s.metronomeOn);
  const activeHand = usePlayViewStore((s) => s.activeHand);
  const currentSectionIndex = usePlayViewStore((s) => s.currentSectionIndex);

  const setWebViewReady = usePlayViewStore((s) => s.setWebViewReady);
  const setLoadingScore = usePlayViewStore((s) => s.setLoadingScore);
  const setScoreError = usePlayViewStore((s) => s.setScoreError);
  const setPlaying = usePlayViewStore((s) => s.setPlaying);
  const setScoreBpm = usePlayViewStore((s) => s.setScoreBpm);
  const setTempoMultiplier = usePlayViewStore((s) => s.setTempoMultiplier);
  const setLoopActive = usePlayViewStore((s) => s.setLoopActive);
  const setMetronomeOn = usePlayViewStore((s) => s.setMetronomeOn);
  const setActiveHand = usePlayViewStore((s) => s.setActiveHand);
  const setCurrentSectionIndex = usePlayViewStore((s) => s.setCurrentSectionIndex);
  const reset = usePlayViewStore((s) => s.reset);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [speedAnim] = useState(() => new Animated.Value(0));
  const [panelLayout, setPanelLayout] = useState({ top: 0, left: 0 });

  const [handOpen, setHandOpen] = useState(false);
  const [handAnim] = useState(() => new Animated.Value(0));
  const [handPanelLayout, setHandPanelLayout] = useState({ top: 0, left: 0 });

  const scoreAreaRef = useRef<View>(null);
  const speedTriggerRef = useRef<View>(null);
  const handTriggerRef = useRef<View>(null);
  const toolbarRef = useRef<View>(null);
  const webViewRef = useRef<WebView>(null);
  // Refs so the message handler and multiplier handler always see the latest values
  // without recreating callbacks on every state change.
  const scoreBpmRef = useRef(120);
  const tempoMultiplierRef = useRef<TempoMultiplier>(1.0);
  // The user's target speed (or imported tempo) overrides the score's native BPM
  // as the 100% reference the multiplier applies to. Undefined → fall back to the
  // score BPM reported by the WebView.
  const overrideBpmRef = useRef<number | undefined>(undefined);
  const sectionsRef = useRef<Section[] | undefined>(undefined);
  useEffect(() => {
    scoreBpmRef.current = scoreBpm;
  }, [scoreBpm]);
  useEffect(() => {
    sectionsRef.current = piece?.sections;
  }, [piece?.sections]);
  useEffect(() => {
    tempoMultiplierRef.current = tempoMultiplier;
  }, [tempoMultiplier]);
  useEffect(() => {
    overrideBpmRef.current = piece?.targetBpm ?? piece?.importedBpm;
  }, [piece?.targetBpm, piece?.importedBpm]);

  useEffect(() => () => reset(), [reset]);
  useEffect(() => {
    if (id) void touchPiece(id);
  }, [id, touchPiece]);

  const toggleSpeed = useCallback(() => {
    const opening = !speedOpen;
    if (opening) {
      if (handOpen) {
        setHandOpen(false);
        Animated.spring(handAnim, {
          toValue: 0,
          useNativeDriver: false,
          bounciness: 4,
          speed: 18,
        }).start();
      }
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
  }, [speedOpen, speedAnim, isPlaying, handOpen, handAnim]);

  const toggleHand = useCallback(() => {
    const opening = !handOpen;
    if (opening) {
      if (speedOpen) {
        setSpeedOpen(false);
        Animated.spring(speedAnim, {
          toValue: 0,
          useNativeDriver: false,
          bounciness: 4,
          speed: 18,
        }).start();
      }
      handTriggerRef.current?.measureLayout(
        scoreAreaRef.current as never,
        (_tx, ty, _tw, th) => {
          toolbarRef.current?.measureLayout(
            scoreAreaRef.current as never,
            (_bx, _by, bw) => setHandPanelLayout({ top: ty + th / 2 - 22, left: bw }),
            () => {},
          );
        },
        () => {},
      );
    }
    setHandOpen(opening);
    Animated.spring(handAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: false,
      bounciness: 4,
      speed: 18,
    }).start();
  }, [handOpen, handAnim, speedOpen, speedAnim]);

  const handleHandChange = useCallback(
    (hand: ActiveHand) => {
      setActiveHand(hand);
      setHandOpen(false);
      Animated.spring(handAnim, {
        toValue: 0,
        useNativeDriver: false,
        bounciness: 4,
        speed: 18,
      }).start();
      webViewRef.current?.injectJavaScript(
        `window.__rn_set_active_hand(${JSON.stringify(hand)});void 0;`,
      );
    },
    [setActiveHand, handAnim],
  );

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
  }, [piece, setLoadingScore, setScoreError, t]);

  useEffect(() => {
    if (webViewReady) void sendXml();
  }, [webViewReady, sendXml]);

  useCountInSync(webViewRef, webViewReady);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: WebToNativeMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data) as WebToNativeMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'SCORE_BPM': {
          setScoreBpm(msg.payload);
          // The WebView initialised its transport at the score's own BPM (payload).
          // Re-send only when our effective target differs — i.e. the user set a
          // target speed and/or a non-1.0 multiplier — so the BPM we show matches
          // what actually plays.
          const reference = overrideBpmRef.current ?? msg.payload;
          const desired = Math.round(reference * tempoMultiplierRef.current);
          if (desired !== msg.payload) {
            webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${desired});void 0;`);
          }
          break;
        }
        case 'LOADED': {
          setLoadingScore(false);
          // Only now: the web side resolves section starts against measure metadata
          // that initPlayback builds during the load.
          const loaded = sectionsRef.current ?? [];
          // Colors travel with the indices because the WebView paints the junction
          // marks in the score and cannot reach the native theme. They are stored on
          // the section now that the user can pick them, not derived per render.
          const payload = {
            measures: loaded.map((s) => s.startMeasureIndex),
            colors: loaded.map((s) => s.color ?? SectionColors[0]!),
          };
          webViewRef.current?.injectJavaScript(
            `window.__rn_set_sections(${JSON.stringify(JSON.stringify(payload))});void 0;`,
          );
          break;
        }
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
        case 'SECTION_INDEX':
          setCurrentSectionIndex(msg.payload);
          break;
      }
    },
    [
      setScoreBpm,
      setLoadingScore,
      setScoreError,
      setPlaying,
      setLoopActive,
      setCurrentSectionIndex,
    ],
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
      const reference = overrideBpmRef.current ?? scoreBpmRef.current;
      const bpm = Math.round(reference * m);
      webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpm});void 0;`);
    },
    [setTempoMultiplier, isPlaying],
  );

  const handleLoopToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_loop();void 0;');
  }, []);

  // Index arithmetic stays in the WebView, which owns the anacrusis offset — native
  // only says which way to go.
  const handleSeekSection = useCallback((direction: -1 | 1) => {
    webViewRef.current?.injectJavaScript(`window.__rn_seek_section(${direction});void 0;`);
  }, []);

  const handleMetronomeToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_metronome();void 0;');
    setMetronomeOn(!metronomeOn);
  }, [metronomeOn, setMetronomeOn]);

  const referenceBpm = piece?.targetBpm ?? piece?.importedBpm ?? scoreBpm;
  const effectiveBpm = Math.round(referenceBpm * tempoMultiplier);
  const scoreReady = webViewReady && !isLoadingScore && !scoreError;

  const sections = piece?.sections;
  // A single section is the "no readable form" case: every piece has at least one
  // after normalisation, so one section is not a form worth naming on screen.
  const hasLabelledSections = (sections?.length ?? 0) > 1;
  const activeSection =
    hasLabelledSections && sections && currentSectionIndex !== null
      ? sections[currentSectionIndex]
      : undefined;
  // An armed loop is a deliberate "stay here" gesture, so section navigation stands
  // down rather than yanking the playhead out of the bit the user just set.
  const canNavigateSections = !isPlaying && !loopActive;

  // The label is a carousel and needs its neighbours, not just the current section:
  // a swipe drags the adjacent name and color into view before the seek has landed.
  const sectionAt = useCallback(
    (index: number): { name: string; color: string } | null => {
      const section = sections?.[index];
      if (!section) return null;
      return {
        name: section.name ?? t('playView.sectionOrdinal', { n: index + 1 }),
        color: section.color ?? SectionColors[0]!,
      };
    },
    [sections, t],
  );

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
                className="bg-white rounded-xl py-3 px-2 items-center gap-4"
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
                    path={metronomeOn ? mdiMetronome : mdiMetronomeTick}
                    size={26}
                    color={metronomeOn ? '#4B7A6E' : '#374151'}
                  />
                </TouchableOpacity>

                {/* Hand selector trigger */}
                <View ref={handTriggerRef}>
                  <TouchableOpacity onPress={toggleHand} hitSlop={8} className="p-1.5">
                    <AppIcon
                      path={HAND_ICON[activeHand]}
                      size={22}
                      color={activeHand !== 'both' ? '#4B7A6E' : '#374151'}
                    />
                  </TouchableOpacity>
                </View>

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
                      {effectiveBpm} {t('common.bpm')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Section label — upper-right overlay. Absent when the piece has a single
            section: every piece has one after normalisation, so a lone section means
            "no readable form" and there is nothing worth labelling. */}
          {scoreReady && activeSection && currentSectionIndex !== null && (
            // Pinned in absolute screen space and lifted above the WebView, like the
            // cursor line: it must not ride on anything the score layout can move.
            // Android needs `elevation` — zIndex alone does not lift a sibling above
            // a native WebView.
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', top: 8, right: 8, zIndex: 30, elevation: 6 }}
            >
              <SectionLabel
                name={
                  activeSection.name ?? t('playView.sectionOrdinal', { n: currentSectionIndex + 1 })
                }
                previousName={sectionAt(currentSectionIndex - 1)?.name ?? null}
                nextName={sectionAt(currentSectionIndex + 1)?.name ?? null}
                color={activeSection.color ?? SectionColors[0]!}
                previousColor={sectionAt(currentSectionIndex - 1)?.color ?? SectionColors[0]!}
                nextColor={sectionAt(currentSectionIndex + 1)?.color ?? SectionColors[0]!}
                sectionIndex={currentSectionIndex}
                collapsed={isPlaying}
                canNavigate={canNavigateSections}
                onSeek={handleSeekSection}
              />
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

          {/* Hand panel — overlays the score, anchored to the hand trigger position */}
          <Animated.View
            pointerEvents={handOpen ? 'auto' : 'none'}
            style={{
              position: 'absolute',
              top: handPanelLayout.top,
              left: handPanelLayout.left,
              width: handAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, HAND_PANEL_WIDTH],
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
            {HAND_OPTIONS.map((hand) => {
              const isActive = activeHand === hand;
              return (
                <TouchableOpacity
                  key={hand}
                  onPress={() => handleHandChange(hand)}
                  hitSlop={4}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <AppIcon
                    path={HAND_ICON[hand]}
                    size={22}
                    color={isActive ? '#4B7A6E' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Overlay: WebView not yet loaded */}
          {!webViewReady && !scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <AppIcon path={mdiMusicNoteOutline} size={48} color="#D1D5DB" />
              <Text className="mt-3 text-sm text-gray-400">{t('common.preparingScore')}</Text>
            </View>
          )}

          {/* Overlay: XML sent, OSMD rendering */}
          {isLoadingScore && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color="#4B7A6E" />
              <Text className="mt-3 text-sm text-gray-500">{t('common.loadingScore')}</Text>
            </View>
          )}

          {/* Error state */}
          {scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white px-8">
              <AppIcon path={mdiAlertCircleOutline} size={48} color="#9C6B8A" />
              <Text className="mt-3 text-base font-semibold text-gray-800 text-center">
                {t('common.couldNotRender')}
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
