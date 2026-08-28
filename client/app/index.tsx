import { mdiCogOutline, mdiDelete, mdiInformation, mdiPencil, mdiPlus } from '@mdi/js';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { BrandMark } from '@components/BrandMark';
import { INSTRUMENT_IDS, INSTRUMENT_REGISTRY, exercisesFor } from '@domain/instrumentRegistry';
import { WARM_UP_REGISTRY } from '@domain/warmupRegistry';
import { useWarmUpStore } from '@state/warmupStore';
import { PieceEditModal, type PieceEditMode } from '@components/PieceEditModal';
import { isPieceComplete } from '@domain/piece';
import { PieceRow, PieceRowSkeleton } from '@components/PieceRow';
import { PracticeHeatmap } from '@components/PracticeHeatmap';
import { RoutineRow } from '@components/RoutineRow';
import { SettingsModal } from '@components/SettingsModal';
import { WarmUpRow } from '@components/WarmUpRow';
import { pickXmlFile } from '@data/index';
import { seedDemoDataIfNeeded } from '@data/seedDemoData';
import { Colors } from '@theme/colors';
import { usePiecesStore } from '@state/piecesStore';
import { usePracticeStore } from '@state/practiceStore';
import { useRoutinesStore } from '@state/routinesStore';
import { useSettingsStore } from '@state/settingsStore';

export default function Dashboard() {
  const { t } = useTranslation();

  // Pieces state
  const pieceIds = usePiecesStore((s) => s.pieceIds);
  const warmUpInstrument = useWarmUpStore((s) => s.instrument);
  const setWarmUpInstrument = useWarmUpStore((s) => s.setInstrument);
  const initWarmUpSettings = useWarmUpStore((s) => s.initSettings);
  const piecesById = usePiecesStore((s) => s.piecesById);
  const isLoading = usePiecesStore((s) => s.isLoading);
  const importError = usePiecesStore((s) => s.importError);
  const loadPieces = usePiecesStore((s) => s.loadPieces);
  const importPiece = usePiecesStore((s) => s.importPiece);
  const deletePiece = usePiecesStore((s) => s.deletePiece);
  const clearImportError = usePiecesStore((s) => s.clearImportError);

  // Routines state
  const routines = useRoutinesStore((s) => s.routines);
  const loadRoutines = useRoutinesStore((s) => s.loadRoutines);
  const deleteRoutines = useRoutinesStore((s) => s.deleteRoutines);

  // Practice history (heatmap)
  const loadPracticeHistory = usePracticeStore((s) => s.loadPracticeHistory);

  // Settings
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Piece selection
  const [editTarget, setEditTarget] = useState<{ id: string; mode: PieceEditMode } | null>(null);
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [isDeletingPieces, setIsDeletingPieces] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  // Routine selection (mutually exclusive with piece selection)
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);
  const [isDeletingRoutines, setIsDeletingRoutines] = useState(false);

  const isPieceSelectionMode = selectedPieceIds.length > 0;
  const isRoutineSelectionMode = selectedRoutineIds.length > 0;

  useFocusEffect(
    useCallback(() => {
      void seedDemoDataIfNeeded().then(() => loadPieces());
      void loadRoutines();
      void loadSettings();
      // The warm-up section's instrument is remembered across launches, so the section
      // cannot render its rows until this resolves.
      void initWarmUpSettings();
      // Re-read on focus so time practised in the play view shows up on return.
      void loadPracticeHistory();
    }, [loadPieces, loadRoutines, loadSettings, loadPracticeHistory, initWarmUpSettings]),
  );

  if (importError) {
    Alert.alert(t('dashboard.importFailed'), importError, [
      { text: t('common.ok'), onPress: clearImportError },
    ]);
  }

  async function handleImport() {
    setIsPicking(true);
    try {
      const file = await pickXmlFile();
      if (!file) return;
      const fallbackTitle = file.name.replace(/\.(xml|mxl)$/i, '');
      const id = await importPiece(file, fallbackTitle);
      if (id) {
        // If the file lacked a title, composer, or tempo, force the user to
        // supply them before the piece is usable (non-dismissable "Input needed").
        const piece = usePiecesStore.getState().piecesById[id];
        if (piece && !isPieceComplete(piece)) {
          setEditTarget({ id, mode: 'import' });
        }
      }
    } catch (err) {
      console.error('[handleImport] unexpected error:', err);
      Alert.alert(t('dashboard.importFailed'), String(err instanceof Error ? err.message : err));
    } finally {
      setIsPicking(false);
    }
  }

  // ─── Piece selection handlers ────────────────────────────────────────────────

  function togglePieceSelect(id: string) {
    setSelectedRoutineIds([]); // clear routine selection
    setSelectedPieceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handlePieceRowPress(id: string) {
    if (isPieceSelectionMode) {
      togglePieceSelect(id);
    } else {
      router.push({ pathname: '/piece/[id]', params: { id } });
    }
  }

  function handleEditPiece() {
    const id = selectedPieceIds[0] ?? null;
    setSelectedPieceIds([]);
    setEditTarget(id ? { id, mode: 'edit' } : null);
  }

  function handleRemovePieces() {
    const count = selectedPieceIds.length;
    const firstId = selectedPieceIds[0];
    const title =
      count === 1 ? t('pieceEdit.removeTitle') : t('pieceEdit.removeMultipleTitle', { count });
    const message =
      count === 1
        ? t('pieceEdit.removeMessage', { title: firstId ? (piecesById[firstId]?.title ?? '') : '' })
        : t('pieceEdit.removeMultipleMessage', { count });
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          setIsDeletingPieces(true);
          try {
            await Promise.all(selectedPieceIds.map((id) => deletePiece(id)));
            setSelectedPieceIds([]);
          } finally {
            setIsDeletingPieces(false);
          }
        },
      },
    ]);
  }

  // ─── Routine selection handlers ──────────────────────────────────────────────

  function toggleRoutineSelect(id: string) {
    setSelectedPieceIds([]); // clear piece selection
    setSelectedRoutineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleRoutineRowPress(id: string) {
    if (isRoutineSelectionMode) {
      toggleRoutineSelect(id);
    } else {
      router.push({ pathname: '/routine/[id]', params: { id } });
    }
  }

  function handleEditRoutine() {
    const id = selectedRoutineIds[0] ?? null;
    setSelectedRoutineIds([]);
    if (id) router.push({ pathname: '/routine/edit', params: { id } });
  }

  function handleRemoveRoutines() {
    const count = selectedRoutineIds.length;
    const firstId = selectedRoutineIds[0];
    const routine = routines.find((r) => r.id === firstId);
    const title =
      count === 1
        ? t('dashboard.removeRoutineTitle')
        : t('dashboard.removeRoutinesTitle', { count });
    const message =
      count === 1
        ? t('dashboard.removeRoutineMessage', { title: routine?.title ?? '' })
        : t('dashboard.removeRoutinesMessage', { count });
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          setIsDeletingRoutines(true);
          try {
            await deleteRoutines(selectedRoutineIds);
            setSelectedRoutineIds([]);
          } finally {
            setIsDeletingRoutines(false);
          }
        },
      },
    ]);
  }

  const isEmpty = pieceIds.length === 0;

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait' }} />
      <SafeAreaView className="flex-1 bg-slate-50">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-6 pb-12">
          <View className="w-full max-w-[720px] self-center">
            {/* Brand header — the horizontal lockup from specs/brand.md, centred.
                The 50px mark and 14px gap are that spec's geometry solved for the
                30px (text-3xl) wordmark: mark = size / 0.60, gap = 0.28 x mark.
                Change one and the other has to follow.

                30px rather than the 36px this started at, because the lockup has
                to survive a 360dp phone: at 36px it measures 308px against 312px
                of content width and clips the final letter. Nothing goes in this
                row but the lockup, for the same reason. */}
            <View className="flex-row items-center justify-center pt-12 pb-4">
              <BrandMark size={50} />
              <Text className="ml-[14px] font-brand text-3xl tracking-tight text-navy-950">
                {t('dashboard.title')}
              </Text>
            </View>

            {/* About + settings share one row so the header above can hold nothing
                but the centred lockup. No bottom margin: the Pressables' own p-2
                already supplies the gap to the Warm-ups heading, and stacking a
                margin on top of it left a visible hole between the two. */}
            <View className="flex-row justify-end">
              <Pressable
                className="p-2 active:opacity-60"
                onPress={() => router.push('/about')}
                accessibilityLabel={t('about.title')}
              >
                <AppIcon path={mdiInformation} size={22} color={Colors.iconMuted} />
              </Pressable>
              <Pressable
                className="p-2 active:opacity-60"
                onPress={() => setSettingsOpen(true)}
                accessibilityLabel={t('settings.heading')}
              >
                <AppIcon path={mdiCogOutline} size={22} color={Colors.iconMuted} />
              </Pressable>
            </View>

            {/* Warm-ups section (includes routines) */}
            <View className="mb-6">
              <Text className="text-[22px] font-bold text-slate-950">{t('dashboard.warmUps')}</Text>

              {/* Instrument scope for this section only — the piece list is never
                filtered by instrument. This is the honest way to show that Hanon does
                not exist for a clarinet, without a mixed list or duplicated rows. */}
              <View className="mt-2 flex-row flex-wrap gap-2">
                {INSTRUMENT_IDS.map((id) => {
                  const selected = warmUpInstrument === id;
                  return (
                    <Pressable
                      key={id}
                      className={`rounded-lg border px-3 py-1.5 ${
                        selected
                          ? 'border-slate-950 bg-slate-950'
                          : 'border-slate-500/35 bg-slate-50'
                      }`}
                      onPress={() => setWarmUpInstrument(id)}
                    >
                      <Text className={`text-[13px] ${selected ? 'text-white' : 'text-slate-950'}`}>
                        {t(INSTRUMENT_REGISTRY[id].labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isRoutineSelectionMode ? (
                <View className="mb-2 mt-1.5 flex-row justify-end gap-2">
                  <Pressable
                    className="flex-row items-center gap-1.5 rounded-lg border border-error-600 px-3 py-2 active:bg-slate-100"
                    onPress={handleRemoveRoutines}
                    disabled={isDeletingRoutines}
                  >
                    {isDeletingRoutines ? (
                      <ActivityIndicator size="small" color={Colors.destructive} />
                    ) : (
                      <>
                        <AppIcon path={mdiDelete} size={14} color={Colors.destructive} />
                        <Text className="text-sm font-semibold text-error-600">
                          {t('common.remove')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {selectedRoutineIds.length === 1 ? (
                    <Pressable
                      className="flex-row items-center gap-1.5 rounded-lg border border-navy-600 px-3 py-2 active:bg-navy-50"
                      onPress={handleEditRoutine}
                    >
                      <AppIcon path={mdiPencil} size={14} color={Colors.primary} />
                      <Text className="text-sm font-semibold text-navy-600">
                        {t('common.edit')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View className="mb-2 mt-1.5 flex-row items-center gap-3">
                  <Text className="flex-1 text-xs text-slate-400">
                    {t('dashboard.warmUpsNote')}
                  </Text>
                  <Pressable
                    className="flex-row items-center gap-2 rounded-lg border border-navy-600 px-4 py-2 active:bg-navy-50"
                    onPress={() => router.push('/routine/edit')}
                  >
                    <AppIcon path={mdiPlus} size={14} color={Colors.primary} />
                    <Text className="text-sm font-semibold text-navy-600">
                      {t('dashboard.newRoutine')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {routines.map((routine) => (
                <RoutineRow
                  key={routine.id}
                  routine={routine}
                  isSelected={selectedRoutineIds.includes(routine.id)}
                  isSelectionMode={isRoutineSelectionMode}
                  onPress={() => handleRoutineRowPress(routine.id)}
                  onLongPress={() => {
                    if (!isRoutineSelectionMode) Vibration.vibrate(40);
                    toggleRoutineSelect(routine.id);
                  }}
                />
              ))}

              {exercisesFor(warmUpInstrument).map((warmUpType) => (
                <WarmUpRow
                  key={warmUpType}
                  title={t(WARM_UP_REGISTRY[warmUpType].labelKey)}
                  onPress={() => router.push(`/warmup/${warmUpType}`)}
                />
              ))}
            </View>

            {/* Pieces header */}
            <View className="mt-2">
              <Text className="text-[22px] font-bold text-slate-950">{t('dashboard.pieces')}</Text>
            </View>

            {/* Privacy note + action buttons on same row */}
            {isPieceSelectionMode ? (
              <View className="mb-3 mt-1.5 flex-row justify-end gap-2">
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-lg border border-error-600 px-3 py-2 active:bg-slate-100"
                  onPress={handleRemovePieces}
                  disabled={isDeletingPieces}
                >
                  {isDeletingPieces ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <AppIcon path={mdiDelete} size={14} color={Colors.destructive} />
                      <Text className="text-sm font-semibold text-error-600">
                        {t('common.remove')}
                      </Text>
                    </>
                  )}
                </Pressable>
                {selectedPieceIds.length === 1 ? (
                  <Pressable
                    className="flex-row items-center gap-1.5 rounded-lg border border-navy-600 px-3 py-2 active:bg-navy-50"
                    onPress={handleEditPiece}
                  >
                    <AppIcon path={mdiPencil} size={14} color={Colors.primary} />
                    <Text className="text-sm font-semibold text-navy-600">{t('common.edit')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="mb-3 mt-1.5 flex-row items-center gap-3">
                <Text className="flex-1 text-xs text-slate-400">{t('dashboard.privacyNote')}</Text>
                <Pressable
                  className="flex-row items-center gap-2 rounded-lg border border-navy-600 px-4 py-2 active:bg-navy-50"
                  onPress={handleImport}
                  disabled={isLoading || isPicking}
                >
                  {isLoading || isPicking ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <AppIcon path={mdiPlus} size={14} color={Colors.primary} />
                      <Text className="text-sm font-semibold text-navy-600">
                        {t('dashboard.importMxl')}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {/* Pieces list */}
            {isEmpty && !isLoading && !isPicking ? (
              <Text className="py-4 text-center text-sm text-slate-400">
                {t('dashboard.emptyTitle')}
              </Text>
            ) : (
              <>
                {(isLoading || isPicking) && <PieceRowSkeleton />}
                {pieceIds.map((id) => {
                  const piece = piecesById[id];
                  if (!piece) return null;
                  return (
                    <PieceRow
                      key={id}
                      piece={piece}
                      isSelected={selectedPieceIds.includes(id)}
                      isSelectionMode={isPieceSelectionMode}
                      onPress={() => handlePieceRowPress(id)}
                      onLongPress={() => {
                        if (!isPieceSelectionMode) Vibration.vibrate(40);
                        togglePieceSelect(id);
                      }}
                    />
                  );
                })}
              </>
            )}

            {/* Practice history — bottom of the dashboard */}
            <PracticeHeatmap />
          </View>
        </ScrollView>

        <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <PieceEditModal
          pieceId={editTarget?.id ?? null}
          mode={editTarget?.mode ?? 'edit'}
          onClose={() => setEditTarget(null)}
          onCancelImport={() => {
            const id = editTarget?.id;
            setEditTarget(null);
            if (id) void deletePiece(id); // discard the incomplete piece
          }}
        />
      </SafeAreaView>
    </>
  );
}
