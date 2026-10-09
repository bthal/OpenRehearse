import {
  mdiAlertCircleOutline,
  mdiExitToApp,
  mdiHandBackLeft,
  mdiHandBackRight,
  mdiHandClap,
  mdiMetronome,
  mdiMetronomeTick,
  mdiMusicNoteOutline,
  mdiSpeedometer,
} from '@mdi/js';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AppIcon } from '@components/AppIcon';
import {
  DEFAULT_INSTRUMENT,
  INSTRUMENT_REGISTRY,
  clampLongNoteOctave,
  exerciseRootMidi,
  isInstrumentId,
  longNoteOctaves,
  maxExerciseOctaves,
  supportsExercise,
} from '@domain/instrumentRegistry';
import { injectInstrumentAudio } from '@score-web/instrumentAudio';
import { CenterPlayButton } from '@components/CenterPlayButton';
import {
  TOOLBAR_PANEL_ICON_SIZE,
  ToolbarPanel,
  ToolbarPanelText,
  panelTopFor,
} from '@components/ToolbarPanel';
import { ToolbarShell } from '@components/ToolbarShell';
import { ToolbarSlot } from '@components/ToolbarSlot';
import { SCORE_WEB_HTML } from '@score-web/html';
import type { WebToNativeMessage } from '@score-web/messageProtocol';
import { useCountInSync } from '@score-web/useCountInSync';
import {
  WARMUP_BPMS,
  WARMUP_KEYS,
  WARMUP_LONG_NOTE_MEASURES,
  WARMUP_LONG_NOTE_NOTES,
  WARMUP_LONG_NOTE_OCTAVES,
  WARMUP_LONG_NOTE_REPEATS,
  WARMUP_OCTAVES,
  WARMUP_PEAK_REPEATS,
  longNoteEntry,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpLongNoteMeasures,
  type WarmUpLongNoteName,
  type WarmUpLongNoteOctave,
  type WarmUpLongNoteRepeats,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
} from '@domain/warmup';
import {
  HANON_EXERCISE_COUNT,
  WARM_UP_REGISTRY,
  hasParam,
  isWarmUpType,
  keyLabel,
  type WarmUpType,
} from '@domain/warmupRegistry';
import { useWarmUpStore } from '@state/warmupStore';
import { Colors } from '@theme/colors';

type PanelKey =
  | 'speed'
  | 'hand'
  | 'key'
  | 'octave'
  | 'peak'
  | 'exercise'
  | 'noteName'
  | 'noteOctave'
  | 'longNoteMeasures'
  | 'longNoteRepeats';
type OpenPanel = PanelKey | null;

const HAND_OPTIONS: WarmUpHand[] = ['both', 'left', 'right'];

const HANON_EXERCISE_NUMBERS = Array.from({ length: HANON_EXERCISE_COUNT }, (_, i) => i + 1);

const HAND_ICON: Record<WarmUpHand, string> = {
  both: mdiHandClap,
  left: mdiHandBackLeft,
  right: mdiHandBackRight,
};

export default function WarmUpView() {
  const { t } = useTranslation();
  const { type, instrument: instrumentParam } = useLocalSearchParams<{
    type: string;
    instrument?: string;
  }>();
  const warmUpType: WarmUpType = type && isWarmUpType(type) ? type : 'scales';
  const descriptor = WARM_UP_REGISTRY[warmUpType];
  const title = t(descriptor.labelKey);

  /**
   * The instrument comes from the route, not from a stored selection: a warm-up row is
   * opened *for* an instrument, and tapping "Scales (Clarinet)" must not re-point the
   * dashboard's filter at the clarinet. A missing or nonsensical parameter — a deep
   * link, or an exercise this instrument does not have — falls back to the default
   * instrument rather than rendering an exercise nobody can play.
   */
  const instrument =
    isInstrumentId(instrumentParam) && supportsExercise(instrumentParam, warmUpType)
      ? instrumentParam
      : DEFAULT_INSTRUMENT;

  const initSettings = useWarmUpStore((s) => s.initSettings);
  const settings = useWarmUpStore((s) => s.exercisesByInstrument[instrument][warmUpType]);
  const updateExercise = useWarmUpStore((s) => s.updateExercise);
  const updateSettings = useCallback(
    (patch: Partial<typeof settings>) => updateExercise(instrument, warmUpType, patch),
    [updateExercise, instrument, warmUpType],
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
  const [panelTop, setPanelTop] = useState<Partial<Record<PanelKey, number>>>({});

  const scoreAreaRef = useRef<View>(null);
  const speedTriggerRef = useRef<View>(null);
  const handTriggerRef = useRef<View>(null);
  const keyTriggerRef = useRef<View>(null);
  const octaveTriggerRef = useRef<View>(null);
  const peakTriggerRef = useRef<View>(null);
  const exerciseTriggerRef = useRef<View>(null);
  const noteNameTriggerRef = useRef<View>(null);
  const noteOctaveTriggerRef = useRef<View>(null);
  const longMeasuresTriggerRef = useRef<View>(null);
  const longRepeatsTriggerRef = useRef<View>(null);
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
  const { exercise, pitchClass, mode, hand, octaves, peakRepeats } = settings;
  const { noteName, noteOctave, longNoteMeasures, longNoteRepeats } = settings;
  // The picker only offers what fits, but a value stored while another instrument was
  // selected can outlive that choice — so the generator is given the clamped value
  // rather than trusting what is on disk.
  const octaveOptions = useMemo(
    () =>
      WARMUP_OCTAVES.filter(
        (n): n is WarmUpOctaves => n <= maxExerciseOctaves(instrument, pitchClass),
      ),
    [instrument, pitchClass],
  );
  const effectiveOctaves = Math.min(
    octaves,
    maxExerciseOctaves(instrument, pitchClass),
  ) as WarmUpOctaves;

  // Same contract for the long note's absolute octave: offer only the octaves this
  // instrument can reach for the chosen spelling, and render the clamped value rather
  // than whatever a settings file happens to hold.
  const notePitchClass = longNoteEntry(noteName).pitchClass;
  const noteOctaveOptions = useMemo(
    () =>
      WARMUP_LONG_NOTE_OCTAVES.filter((n): n is WarmUpLongNoteOctave =>
        longNoteOctaves(instrument, notePitchClass).includes(n),
      ),
    [instrument, notePitchClass],
  );
  const effectiveNoteOctave = clampLongNoteOctave(
    instrument,
    notePitchClass,
    noteOctave,
  ) as WarmUpLongNoteOctave;

  const sendScore = useCallback(async () => {
    setLoadingScore(true);
    setScoreError(null);
    try {
      const xml = WARM_UP_REGISTRY[warmUpType].generateXml({
        exercise,
        pitchClass,
        mode,
        hand,
        // A single-staff instrument has no hand control, so its exercises are the
        // one-part case — which is exactly what 'right' already produces.
        ...(INSTRUMENT_REGISTRY[instrument].staffLayout === 'single'
          ? { hand: 'right' as const }
          : {}),
        octaves: effectiveOctaves,
        peakRepeats,
        noteName,
        noteOctave: effectiveNoteOctave,
        longNoteMeasures,
        longNoteRepeats,
        // Anchors the exercise in this instrument's own register rather than the
        // piano's C4. Derived, never persisted — see ScoreParams.
        rootMidi: exerciseRootMidi(instrument, pitchClass),
      });
      void injectInstrumentAudio((js) => webViewRef.current?.injectJavaScript(js), instrument).then(
        () => {
          webViewRef.current?.injectJavaScript(
            `window.__rn_load_xml(${JSON.stringify(xml)});void 0;`,
          );
        },
      );
    } catch (err) {
      setLoadingScore(false);
      setScoreError(err instanceof Error ? err.message : t('warmup.failedToGenerate'));
    }
  }, [
    warmUpType,
    exercise,
    pitchClass,
    mode,
    hand,
    effectiveOctaves,
    peakRepeats,
    noteName,
    effectiveNoteOctave,
    longNoteMeasures,
    longNoteRepeats,
    instrument,
    setLoadingScore,
    setScoreError,
    t,
  ]);

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
          // The toolbar slides away on play and carries any open panel with it; closing
          // it here means it is not still standing open when the toolbar comes back.
          if (msg.payload === 'playing') setOpenPanel(null);
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

  function togglePanel(panel: PanelKey, triggerRef: React.RefObject<View | null>) {
    if (openPanel === panel) {
      setOpenPanel(null);
      return;
    }
    if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
    triggerRef.current?.measureLayout(
      scoreAreaRef.current as never,
      (_x, y, _w, h) => setPanelTop((prev) => ({ ...prev, [panel]: panelTopFor(y, h) })),
      () => {},
    );
    setOpenPanel(panel);
  }

  const handleBpmChange = useCallback(
    (bpm: WarmUpBpm) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ bpm });
      bpmRef.current = bpm;
      webViewRef.current?.injectJavaScript(`window.__rn_set_tempo(${bpm});void 0;`);
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleHandChange = useCallback(
    (hand: 'both' | 'right' | 'left') => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ hand });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleKeyChange = useCallback(
    (pitchClass: number, mode: 'major' | 'minor') => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ pitchClass, mode });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleOctaveChange = useCallback(
    (octaves: WarmUpOctaves) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ octaves });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handlePeakRepeatsChange = useCallback(
    (value: WarmUpPeakRepeats) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ peakRepeats: value });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleExerciseChange = useCallback(
    (value: number) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ exercise: value });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleNoteNameChange = useCallback(
    (value: WarmUpLongNoteName) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      // The octave moves with the note in one write. Db6 is playable and Db7 is not,
      // so a note change alone could strand the stored octave outside the list the
      // picker is about to show.
      const pc = longNoteEntry(value).pitchClass;
      updateSettings({
        noteName: value,
        noteOctave: clampLongNoteOctave(instrument, pc, noteOctave) as WarmUpLongNoteOctave,
      });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings, instrument, noteOctave],
  );

  const handleNoteOctaveChange = useCallback(
    (value: WarmUpLongNoteOctave) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ noteOctave: value });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleLongNoteMeasuresChange = useCallback(
    (value: WarmUpLongNoteMeasures) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ longNoteMeasures: value });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleLongNoteRepeatsChange = useCallback(
    (value: WarmUpLongNoteRepeats) => {
      if (isPlaying) webViewRef.current?.injectJavaScript('window.__rn_pause();void 0;');
      updateSettings({ longNoteRepeats: value });
      setOpenPanel(null);
    },
    [isPlaying, updateSettings],
  );

  const handleMetronomeToggle = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__rn_toggle_metronome();void 0;');
    setMetronomeOn(!metronomeOn);
  }, [metronomeOn, setMetronomeOn]);

  const scoreReady = webViewReady && !isLoadingScore && !scoreError;
  const showExercise = hasParam(warmUpType, 'exercise');
  const showKey = hasParam(warmUpType, 'key');
  const showOctave = hasParam(warmUpType, 'octaves');
  const showPeak = hasParam(warmUpType, 'peakRepeats');
  const showNoteName = hasParam(warmUpType, 'noteName');
  const showNoteOctave = hasParam(warmUpType, 'noteOctave');
  const showLongMeasures = hasParam(warmUpType, 'longNoteMeasures');
  const showLongRepeats = hasParam(warmUpType, 'longNoteRepeats');
  // Declaring `hand` is not enough on its own: a single-staff instrument has no hand
  // to choose, and `sendScore` already forces the one-part case, so the control would
  // be a button that cannot change anything.
  const showHand =
    hasParam(warmUpType, 'hand') && INSTRUMENT_REGISTRY[instrument].staffLayout !== 'single';

  const currentKeyLabel = keyLabel(settings.pitchClass, settings.mode);

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
            // Samples are bundled assets served over file://; react-native-webview
            // defaults allowFileAccess to false, which would block the Sampler.
            allowFileAccess={true}
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
            <ToolbarShell
              hidden={isPlaying}
              panels={
                <>
                  {showExercise && (
                    <ToolbarPanel
                      open={openPanel === 'exercise'}
                      top={panelTop.exercise ?? 0}
                      maxVisible={4}
                    >
                      {HANON_EXERCISE_NUMBERS.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handleExerciseChange(n)}>
                          <ToolbarPanelText active={settings.exercise === n}>{n}</ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  <ToolbarPanel
                    open={openPanel === 'speed'}
                    top={panelTop.speed ?? 0}
                    maxVisible={4}
                  >
                    {WARMUP_BPMS.map((bpm) => (
                      <ToolbarSlot key={bpm} onPress={() => handleBpmChange(bpm)}>
                        <ToolbarPanelText active={settings.bpm === bpm}>{bpm}</ToolbarPanelText>
                      </ToolbarSlot>
                    ))}
                  </ToolbarPanel>

                  {showHand && (
                    <ToolbarPanel open={openPanel === 'hand'} top={panelTop.hand ?? 0}>
                      {HAND_OPTIONS.map((h) => (
                        <ToolbarSlot key={h} onPress={() => handleHandChange(h)}>
                          <AppIcon
                            path={HAND_ICON[h]}
                            size={TOOLBAR_PANEL_ICON_SIZE}
                            color={settings.hand === h ? Colors.primary : Colors.iconMuted}
                          />
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showKey && (
                    <ToolbarPanel open={openPanel === 'key'} top={panelTop.key ?? 0} maxVisible={4}>
                      {WARMUP_KEYS.map((k) => (
                        <ToolbarSlot
                          key={k.label}
                          onPress={() => handleKeyChange(k.pitchClass, k.mode)}
                        >
                          <ToolbarPanelText
                            active={
                              k.pitchClass === settings.pitchClass && k.mode === settings.mode
                            }
                          >
                            {k.label}
                          </ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showPeak && (
                    <ToolbarPanel open={openPanel === 'peak'} top={panelTop.peak ?? 0}>
                      {WARMUP_PEAK_REPEATS.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handlePeakRepeatsChange(n)}>
                          <ToolbarPanelText active={settings.peakRepeats === n}>
                            ×{n}
                          </ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showOctave && (
                    <ToolbarPanel open={openPanel === 'octave'} top={panelTop.octave ?? 0}>
                      {octaveOptions.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handleOctaveChange(n)}>
                          <ToolbarPanelText active={effectiveOctaves === n}>{n}</ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showNoteName && (
                    <ToolbarPanel
                      open={openPanel === 'noteName'}
                      top={panelTop.noteName ?? 0}
                      maxVisible={4}
                    >
                      {WARMUP_LONG_NOTE_NOTES.map((n) => (
                        <ToolbarSlot key={n.label} onPress={() => handleNoteNameChange(n.label)}>
                          <ToolbarPanelText active={noteName === n.label}>
                            {n.label}
                          </ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showNoteOctave && (
                    <ToolbarPanel open={openPanel === 'noteOctave'} top={panelTop.noteOctave ?? 0}>
                      {noteOctaveOptions.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handleNoteOctaveChange(n)}>
                          <ToolbarPanelText active={effectiveNoteOctave === n}>
                            {n}
                          </ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showLongMeasures && (
                    <ToolbarPanel
                      open={openPanel === 'longNoteMeasures'}
                      top={panelTop.longNoteMeasures ?? 0}
                      maxVisible={4}
                    >
                      {WARMUP_LONG_NOTE_MEASURES.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handleLongNoteMeasuresChange(n)}>
                          <ToolbarPanelText active={longNoteMeasures === n}>{n}</ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}

                  {showLongRepeats && (
                    <ToolbarPanel
                      open={openPanel === 'longNoteRepeats'}
                      top={panelTop.longNoteRepeats ?? 0}
                    >
                      {WARMUP_LONG_NOTE_REPEATS.map((n) => (
                        <ToolbarSlot key={n} onPress={() => handleLongNoteRepeatsChange(n)}>
                          <ToolbarPanelText active={longNoteRepeats === n}>×{n}</ToolbarPanelText>
                        </ToolbarSlot>
                      ))}
                    </ToolbarPanel>
                  )}
                </>
              }
            >
              {/* Back */}
              <ToolbarSlot onPress={() => router.back()} accessibilityLabel={t('playView.back')}>
                <AppIcon path={mdiExitToApp} size={24} color={Colors.icon} flip="vertical" />
              </ToolbarSlot>

              {/* Metronome */}
              <ToolbarSlot
                onPress={handleMetronomeToggle}
                accessibilityLabel={t('playView.metronome')}
              >
                <AppIcon
                  path={metronomeOn ? mdiMetronome : mdiMetronomeTick}
                  size={26}
                  color={metronomeOn ? Colors.primary : Colors.icon}
                />
              </ToolbarSlot>

              {/* Exercise-number trigger — families with numbered exercises */}
              {showExercise && (
                <ToolbarSlot
                  ref={exerciseTriggerRef}
                  onPress={() => togglePanel('exercise', exerciseTriggerRef)}
                >
                  <ValueTrigger
                    value={settings.exercise}
                    label={t('warmup.exercise')}
                    open={openPanel === 'exercise'}
                  />
                </ToolbarSlot>
              )}

              {/* Speed trigger */}
              <ToolbarSlot
                ref={speedTriggerRef}
                onPress={() => togglePanel('speed', speedTriggerRef)}
              >
                <View style={{ height: 22, justifyContent: 'center', alignItems: 'center' }}>
                  {openPanel === 'speed' ? (
                    <AppIcon path={mdiSpeedometer} size={22} color={Colors.primary} />
                  ) : (
                    <Text className="text-base font-semibold text-gray-700">{settings.bpm}</Text>
                  )}
                </View>
                <Text className="text-[9px] text-black mt-0.5">{t('common.bpm')}</Text>
              </ToolbarSlot>

              {/* Hand trigger — two-staff instruments only */}
              {showHand && (
                <ToolbarSlot
                  ref={handTriggerRef}
                  onPress={() => togglePanel('hand', handTriggerRef)}
                >
                  <AppIcon
                    path={HAND_ICON[settings.hand]}
                    size={22}
                    color={settings.hand !== 'both' ? Colors.primary : Colors.icon}
                  />
                </ToolbarSlot>
              )}

              {/* Key trigger — exercises that declare a key */}
              {showKey && (
                <ToolbarSlot ref={keyTriggerRef} onPress={() => togglePanel('key', keyTriggerRef)}>
                  <ValueTrigger
                    value={currentKeyLabel}
                    label={t('warmup.key')}
                    open={openPanel === 'key'}
                  />
                </ToolbarSlot>
              )}

              {/* Peak repeats trigger — exercises that declare it */}
              {showPeak && (
                <ToolbarSlot
                  ref={peakTriggerRef}
                  onPress={() => togglePanel('peak', peakTriggerRef)}
                >
                  <ValueTrigger
                    value={`×${settings.peakRepeats}`}
                    label={t('warmup.peak')}
                    open={openPanel === 'peak'}
                  />
                </ToolbarSlot>
              )}

              {/* Octave trigger — exercises that declare octaves */}
              {showOctave && (
                <ToolbarSlot
                  ref={octaveTriggerRef}
                  onPress={() => togglePanel('octave', octaveTriggerRef)}
                >
                  <ValueTrigger
                    value={effectiveOctaves}
                    label={t('warmup.octave', { count: effectiveOctaves })}
                    open={openPanel === 'octave'}
                  />
                </ToolbarSlot>
              )}

              {/* Note trigger — exercises that name an absolute pitch */}
              {showNoteName && (
                <ToolbarSlot
                  ref={noteNameTriggerRef}
                  onPress={() => togglePanel('noteName', noteNameTriggerRef)}
                >
                  <ValueTrigger
                    value={noteName}
                    label={t('warmup.note')}
                    open={openPanel === 'noteName'}
                  />
                </ToolbarSlot>
              )}

              {/* Note-octave trigger */}
              {showNoteOctave && (
                <ToolbarSlot
                  ref={noteOctaveTriggerRef}
                  onPress={() => togglePanel('noteOctave', noteOctaveTriggerRef)}
                >
                  <ValueTrigger
                    value={effectiveNoteOctave}
                    label={t('warmup.octave', { count: 1 })}
                    open={openPanel === 'noteOctave'}
                  />
                </ToolbarSlot>
              )}

              {/* Hold-length trigger */}
              {showLongMeasures && (
                <ToolbarSlot
                  ref={longMeasuresTriggerRef}
                  onPress={() => togglePanel('longNoteMeasures', longMeasuresTriggerRef)}
                >
                  <ValueTrigger
                    value={longNoteMeasures}
                    label={t('warmup.hold')}
                    open={openPanel === 'longNoteMeasures'}
                  />
                </ToolbarSlot>
              )}

              {/* Repeat-count trigger */}
              {showLongRepeats && (
                <ToolbarSlot
                  ref={longRepeatsTriggerRef}
                  onPress={() => togglePanel('longNoteRepeats', longRepeatsTriggerRef)}
                >
                  <ValueTrigger
                    value={`×${longNoteRepeats}`}
                    label={t('warmup.repeats')}
                    open={openPanel === 'longNoteRepeats'}
                  />
                </ToolbarSlot>
              )}
            </ToolbarShell>
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

/**
 * A text-valued toolbar button: the current value over a small caption, teal while its
 * panel is open.
 */
function ValueTrigger({
  value,
  label,
  open,
}: {
  value: string | number;
  label: string;
  open: boolean;
}) {
  return (
    <>
      <Text
        className="text-base font-semibold"
        style={{ color: open ? Colors.primary : Colors.icon }}
      >
        {value}
      </Text>
      <Text className="text-[9px] text-black mt-0.5">{label}</Text>
    </>
  );
}
