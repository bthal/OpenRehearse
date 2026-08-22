import {
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiHandBackLeft,
  mdiHandBackRight,
  mdiHandClap,
  mdiMetronome,
  mdiMetronomeTick,
  mdiMusicNoteOutline,
  mdiSpeedometer,
} from '@mdi/js';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AppIcon } from '@components/AppIcon';
import { CenterPlayButton } from '@components/CenterPlayButton';
import { ToolbarShell } from '@components/ToolbarShell';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { useCountInSync } from '@score-web/useCountInSync';
import {
  WARMUP_BPMS,
  WARMUP_KEYS,
  WARMUP_OCTAVES,
  WARMUP_PEAK_REPEATS,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
} from '@domain/warmup';
import {
  WARM_UP_REGISTRY,
  hasParam,
  isWarmUpType,
  keyLabel,
  type WarmUpType,
} from '@domain/warmupRegistry';
import { useWarmUpStore } from '@state/warmupStore';
import { Colors } from '@theme/colors';

type PanelKey = 'speed' | 'hand' | 'key' | 'octave' | 'peak';
type OpenPanel = PanelKey | null;

const PANEL_WIDTH = 176; // key panel (4 keys visible, scroll for more)
const HAND_PANEL_WIDTH = 132; // 3 × 44
const OCTAVE_PANEL_WIDTH = 132; // 3 × 44
const PEAK_PANEL_WIDTH = 220; // 5 × 44

const HAND_OPTIONS: WarmUpHand[] = ['both', 'left', 'right'];

const HAND_ICON: Record<WarmUpHand, string> = {
  both: mdiHandClap,
  left: mdiHandBackLeft,
  right: mdiHandBackRight,
};

export default function WarmUpView() {
  const { t } = useTranslation();
  const { type } = useLocalSearchParams<{ type: string }>();
  const warmUpType: WarmUpType = type && isWarmUpType(type) ? type : 'scales';
  const descriptor = WARM_UP_REGISTRY[warmUpType];
  const title = t(descriptor.labelKey);

  const initSettings = useWarmUpStore((s) => s.initSettings);
  const settings = useWarmUpStore((s) => s.exercises[warmUpType]);
  const updateExercise = useWarmUpStore((s) => s.updateExercise);
  const updateSettings = useCallback(
    (patch: Partial<typeof settings>) => updateExercise(warmUpType, patch),
    [updateExercise, warmUpType],
  );

  const webViewReady = useWarmUpStore((s) => s.webViewReady);
  const isLoadingScore = useWarmUpStore((s) => s.isLoadingScore);
  const scoreError = useWarmUpStore((s) => s.scoreError);
  const isPlaying = useWarmUpStore((s) => s.isPlaying);
  const metronomeOn = useWarmUpStore((s) => s.metronomeOn);
  const scoreMoving = useWarmUpStore((s) => s.scoreMoving);

  const setWebViewReady = useWarmUpStore((s) => s.setWebViewReady);
  const setLoadingScore = useWarmUpStore((s) => s.setLoadingScore);
  const setScoreError = useWarmUpStore((s) => s.setScoreError);
  const setPlaying = useWarmUpStore((s) => s.setPlaying);
  const setLoopActive = useWarmUpStore((s) => s.setLoopActive);
  const setMetronomeOn = useWarmUpStore((s) => s.setMetronomeOn);
  const setScoreMoving = useWarmUpStore((s) => s.setScoreMoving);
  const resetPlayback = useWarmUpStore((s) => s.resetPlayback);

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [panelAnim] = useState(() => ({
    speed: new Animated.Value(0),
    hand: new Animated.Value(0),
    key: new Animated.Value(0),
    octave: new Animated.Value(0),
    peak: new Animated.Value(0),
  }));
  const [panelLayout, setPanelLayout] = useState<Record<PanelKey, { top: number; left: number }>>({
    speed: { top: 0, left: 0 },
    hand: { top: 0, left: 0 },
    key: { top: 0, left: 0 },
    octave: { top: 0, left: 0 },
    peak: { top: 0, left: 0 },
  });

  const scoreAreaRef = useRef<View>(null);
  const speedTriggerRef = useRef<View>(null);
  const handTriggerRef = useRef<View>(null);
  const keyTriggerRef = useRef<View>(null);
  const octaveTriggerRef = useRef<View>(null);
  const peakTriggerRef = useRef<View>(null);
  const toolbarRef = useRef<View>(null);
  const webViewRef = useRef<WebView>(null);

  // Keep a ref so the loaded handler always sees the latest bpm without recreating
  const bpmRef = useRef<WarmUpBpm>(settings.bpm);
  useEffect(() => {
    bpmRef.current = settings.bpm;
  }, [settings.bpm]);

  useEffect(() => {
    void initSettings();
    return () => resetPlayback();
  }, [initSettings, resetPlayback]);

  // Destructured so the generation effect depends on the note-affecting parameters
  // only. Depending on `settings` wholesale would reload the score on every tempo
  // change, which handleBpmChange goes out of its way to avoid.
  const { pitchClass, mode, hand, octaves, peakRepeats } = settings;

  const sendScore = useCallback(async () => {
    setLoadingScore(true);
    setScoreError(null);
    try {
      const xml = WARM_UP_REGISTRY[warmUpType].generateXml({
        pitchClass,
        mode,
        hand,
        octaves,
        peakRepeats,
      });
      webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);
    } catch (err) {
      setLoadingScore(false);
      setScoreError(err instanceof Error ? err.message : t('warmup.failedToGenerate'));
    }
  }, [warmUpType, pitchClass, mode, hand, octaves, peakRepeats, setLoadingScore, setScoreError, t]);

  useEffect(() => {
    if (webViewReady) void sendScore();
  }, [webViewReady, sendScore]);

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
        case 'LOADED':
          setLoadingScore(false);
          // Always override with our selected BPM (ignore whatever tempo the XML declares)
          webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpmRef.current});void 0;`);
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
        case 'SCORE_MOTION':
          setScoreMoving(msg.payload);
          break;
        case 'SCORE_BPM':
          // Intentionally ignored — warm-up BPM is always user-controlled
          break;
      }
    },
    [setLoadingScore, setScoreError, setPlaying, setLoopActive, setScoreMoving],
  );

  function animatePanel(panel: PanelKey, toValue: number) {
    Animated.spring(panelAnim[panel], {
      toValue,
      useNativeDriver: false,
      bounciness: 4,
      speed: 18,
    }).start();
  }

  function measureTrigger(triggerRef: React.RefObject<View | null>, panelKey: PanelKey) {
    triggerRef.current?.measureLayout(
      scoreAreaRef.current as never,
      (_tx, ty, _tw, th) => {
        toolbarRef.current?.measureLayout(
          scoreAreaRef.current as never,
          (_bx, _by, bw) => {
            setPanelLayout((prev) => ({
              ...prev,
              [panelKey]: { top: ty + th / 2 - 22, left: bw },
            }));
          },
          () => {},
        );
      },
      () => {},
    );
  }

  function togglePanel(panel: PanelKey, triggerRef: React.RefObject<View | null>) {
    const isOpening = openPanel !== panel;

    // Close whichever panel is open
    if (openPanel && openPanel !== panel) animatePanel(openPanel, 0);

    if (isOpening) {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      measureTrigger(triggerRef, panel);
      setOpenPanel(panel);
      animatePanel(panel, 1);
    } else {
      setOpenPanel(null);
      animatePanel(panel, 0);
    }
  }

  const handleBpmChange = useCallback(
    (bpm: WarmUpBpm) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ bpm });
      bpmRef.current = bpm;
      webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpm});void 0;`);
      setOpenPanel(null);
      animatePanel('speed', 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPlaying, updateSettings],
  );

  const handleHandChange = useCallback(
    (hand: 'both' | 'right' | 'left') => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ hand });
      setOpenPanel(null);
      animatePanel('hand', 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPlaying, updateSettings],
  );

  const handleKeyChange = useCallback(
    (pitchClass: number, mode: 'major' | 'minor') => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ pitchClass, mode });
      setOpenPanel(null);
      animatePanel('key', 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPlaying, updateSettings],
  );

  const handleOctaveChange = useCallback(
    (octaves: WarmUpOctaves) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ octaves });
      setOpenPanel(null);
      animatePanel('octave', 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPlaying, updateSettings],
  );

  const handlePeakRepeatsChange = useCallback(
    (value: WarmUpPeakRepeats) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ peakRepeats: value });
      setOpenPanel(null);
      animatePanel('peak', 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPlaying, updateSettings],
  );

  const handleMetronomeToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_metronome();void 0;');
    setMetronomeOn(!metronomeOn);
  }, [metronomeOn, setMetronomeOn]);

  const scoreReady = webViewReady && !isLoadingScore && !scoreError;
  const showKey = hasParam(warmUpType, 'key');
  const showOctave = hasParam(warmUpType, 'octaves');
  const showPeak = hasParam(warmUpType, 'peakRepeats');

  const currentKeyLabel = keyLabel(settings.pitchClass, settings.mode);

  function panelWidthInterp(panel: Exclude<OpenPanel, null>, maxWidth: number) {
    return panelAnim[panel].interpolate({
      inputRange: [0, 1],
      outputRange: [0, maxWidth],
      extrapolate: 'clamp',
    });
  }

  const panelBase = {
    position: 'absolute' as const,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 2, height: 0 },
  };

  return (
    <>
      <Stack.Screen options={{ orientation: 'landscape', title }} />
      {/* Deliberately not a SafeAreaView — see the play view for why: the score runs to
        the physical edges, and the toolbar applies the cutout inset itself. */}
      <View className="flex-1 bg-white">
        <View ref={scoreAreaRef} className="flex-1">
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

          {/* The play affordance sits on the cursor at screen centre, not in the
            toolbar. Decorative — the WebView's tap-on-the-score handles the press. */}
          <CenterPlayButton ready={scoreReady} playing={isPlaying} scoreMoving={scoreMoving} />

          {/* Toolbar — slides away while playing, leaving the notation alone. */}
          {scoreReady && (
            <ToolbarShell ref={toolbarRef} hidden={isPlaying}>
              {/* Back */}
              <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="p-1">
                <AppIcon path={mdiArrowLeft} size={24} color={Colors.icon} />
              </TouchableOpacity>

              {/* Metronome */}
              <TouchableOpacity onPress={handleMetronomeToggle} hitSlop={8} className="p-1.5">
                <AppIcon
                  path={metronomeOn ? mdiMetronome : mdiMetronomeTick}
                  size={26}
                  color={metronomeOn ? Colors.primary : Colors.icon}
                />
              </TouchableOpacity>

              {/* Speed trigger */}
              <View ref={speedTriggerRef}>
                <TouchableOpacity
                  onPress={() => togglePanel('speed', speedTriggerRef)}
                  hitSlop={8}
                  className="items-center px-2 py-1"
                >
                  <View style={{ height: 22, justifyContent: 'center', alignItems: 'center' }}>
                    {openPanel === 'speed' ? (
                      <AppIcon path={mdiSpeedometer} size={22} color={Colors.primary} />
                    ) : (
                      <Text className="text-base font-semibold text-gray-700">{settings.bpm}</Text>
                    )}
                  </View>
                  <Text className="text-[9px] text-black mt-0.5">{t('common.bpm')}</Text>
                </TouchableOpacity>
              </View>

              {/* Hand trigger */}
              <View ref={handTriggerRef}>
                <TouchableOpacity
                  onPress={() => togglePanel('hand', handTriggerRef)}
                  hitSlop={8}
                  className="p-1.5"
                >
                  <AppIcon
                    path={HAND_ICON[settings.hand]}
                    size={22}
                    color={settings.hand !== 'both' ? Colors.primary : Colors.icon}
                  />
                </TouchableOpacity>
              </View>

              {/* Key trigger — exercises that declare a key */}
              {showKey && (
                <View ref={keyTriggerRef}>
                  <TouchableOpacity
                    onPress={() => togglePanel('key', keyTriggerRef)}
                    hitSlop={8}
                    className="items-center px-2 py-1"
                  >
                    <Text
                      className="text-base font-semibold mt-0.5"
                      style={{ color: openPanel === 'key' ? Colors.primary : Colors.icon }}
                    >
                      {currentKeyLabel}
                    </Text>
                    <Text className="text-[9px] text-black mt-0.5">{t('warmup.key')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Peak repeats trigger — exercises that declare it */}
              {showPeak && (
                <View ref={peakTriggerRef}>
                  <TouchableOpacity
                    onPress={() => togglePanel('peak', peakTriggerRef)}
                    hitSlop={8}
                    className="items-center px-2 py-1"
                  >
                    <Text
                      className="text-base font-semibold mt-0.5"
                      style={{ color: openPanel === 'peak' ? Colors.primary : Colors.icon }}
                    >
                      ×{settings.peakRepeats}
                    </Text>
                    <Text className="text-[9px] text-black mt-0.5">{t('warmup.peak')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Octave trigger — exercises that declare octaves */}
              {showOctave && (
                <View ref={octaveTriggerRef}>
                  <TouchableOpacity
                    onPress={() => togglePanel('octave', octaveTriggerRef)}
                    hitSlop={8}
                    className="items-center px-2 py-1"
                  >
                    <Text
                      className="text-base font-semibold mt-0.5"
                      style={{ color: openPanel === 'octave' ? Colors.primary : Colors.icon }}
                    >
                      {settings.octaves}
                    </Text>
                    <Text className="text-[9px] text-black mt-0.5">
                      {t('warmup.octave', { count: settings.octaves })}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ToolbarShell>
          )}

          {/* Speed panel */}
          <Animated.View
            pointerEvents={openPanel === 'speed' ? 'auto' : 'none'}
            style={[
              panelBase,
              {
                top: panelLayout.speed.top,
                left: panelLayout.speed.left,
                width: panelWidthInterp('speed', PANEL_WIDTH),
              },
            ]}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {WARMUP_BPMS.map((bpm) => (
                <TouchableOpacity
                  key={bpm}
                  onPress={() => handleBpmChange(bpm)}
                  hitSlop={4}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: settings.bpm === bpm ? Colors.primary : Colors.iconMuted,
                    }}
                  >
                    {bpm}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          {/* Hand panel */}
          <Animated.View
            pointerEvents={openPanel === 'hand' ? 'auto' : 'none'}
            style={[
              panelBase,
              {
                top: panelLayout.hand.top,
                left: panelLayout.hand.left,
                width: panelWidthInterp('hand', HAND_PANEL_WIDTH),
              },
            ]}
          >
            {HAND_OPTIONS.map((hand) => (
              <TouchableOpacity
                key={hand}
                onPress={() => handleHandChange(hand)}
                hitSlop={4}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <AppIcon
                  path={HAND_ICON[hand]}
                  size={22}
                  color={settings.hand === hand ? Colors.primary : Colors.iconMuted}
                />
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* Key panel */}
          {showKey && (
            <Animated.View
              pointerEvents={openPanel === 'key' ? 'auto' : 'none'}
              style={[
                panelBase,
                {
                  top: panelLayout.key.top,
                  left: panelLayout.key.left,
                  width: panelWidthInterp('key', PANEL_WIDTH),
                },
              ]}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {WARMUP_KEYS.map((k) => {
                  const isActive = k.pitchClass === settings.pitchClass && k.mode === settings.mode;
                  return (
                    <TouchableOpacity
                      key={k.label}
                      onPress={() => handleKeyChange(k.pitchClass, k.mode)}
                      hitSlop={4}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: isActive ? Colors.primary : Colors.iconMuted,
                        }}
                      >
                        {k.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )}

          {/* Peak repeats panel */}
          {showPeak && (
            <Animated.View
              pointerEvents={openPanel === 'peak' ? 'auto' : 'none'}
              style={[
                panelBase,
                {
                  top: panelLayout.peak.top,
                  left: panelLayout.peak.left,
                  width: panelWidthInterp('peak', PEAK_PANEL_WIDTH),
                },
              ]}
            >
              {WARMUP_PEAK_REPEATS.map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => handlePeakRepeatsChange(n)}
                  hitSlop={4}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: settings.peakRepeats === n ? Colors.primary : Colors.iconMuted,
                    }}
                  >
                    ×{n}
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Octave panel */}
          {showOctave && (
            <Animated.View
              pointerEvents={openPanel === 'octave' ? 'auto' : 'none'}
              style={[
                panelBase,
                {
                  top: panelLayout.octave.top,
                  left: panelLayout.octave.left,
                  width: panelWidthInterp('octave', OCTAVE_PANEL_WIDTH),
                },
              ]}
            >
              {WARMUP_OCTAVES.map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => handleOctaveChange(n)}
                  hitSlop={4}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: settings.octaves === n ? Colors.primary : Colors.iconMuted,
                    }}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Overlay: WebView loading */}
          {!webViewReady && !scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <AppIcon path={mdiMusicNoteOutline} size={48} color={Colors.iconDisabled} />
              <Text className="mt-3 text-sm text-gray-400">{t('common.preparingScore')}</Text>
            </View>
          )}

          {/* Overlay: score rendering */}
          {isLoadingScore && (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text className="mt-3 text-sm text-gray-500">{t('common.loadingScore')}</Text>
            </View>
          )}

          {/* Error state */}
          {scoreError && (
            <View className="absolute inset-0 items-center justify-center bg-white px-8">
              <AppIcon path={mdiAlertCircleOutline} size={48} color={Colors.error} />
              <Text className="mt-3 text-base font-semibold text-gray-800 text-center">
                {t('common.couldNotRender')}
              </Text>
              <Text className="mt-1 text-sm text-gray-500 text-center">{scoreError}</Text>
              <TouchableOpacity
                className="mt-5 px-5 py-2.5 rounded-lg bg-navy-600 active:bg-navy-700"
                onPress={() => resetPlayback()}
              >
                <Text className="text-sm font-semibold text-slate-50">{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </>
  );
}
