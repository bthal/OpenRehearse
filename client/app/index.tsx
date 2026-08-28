import {
  mdiCogOutline,
  mdiDelete,
  mdiInformation,
  mdiMusicClefTreble,
  mdiPencil,
  mdiPlus,
} from '@mdi/js';
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
import { INSTRUMENT_REGISTRY } from '@domain/instrumentRegistry';
import {
  filterByInstrument,
  scopeIncludes,
  scopeInstrument,
  warmUpRowsForScope,
  type InstrumentScope,
} from '@domain/instrumentScope';
import { WARM_UP_REGISTRY } from '@domain/warmupRegistry';
import { InstrumentScopeModal, scopeShortLabelKey } from '@components/InstrumentScopeModal';
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

  // Instrument scope — a persisted view filter over this screen and nothing else.
  const scope = useSettingsStore((s) => s.dashboardScope);
  const setDashboardScope = useSettingsStore((s) => s.setDashboardScope);
  const [scopeOpen, setScopeOpen] = useState(false);

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
      // Carries the dashboard's instrument scope, so the lists below cannot settle
      // until it resolves.
      void loadSettings();
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
    const piece = id ? piecesById[id] : undefined;
    // A piece whose import was interrupted before the instrument was settled is still
    // incomplete, and the instrument is only ever answered in import mode — so Edit
    // has to reopen that gate rather than a modal that can no longer ask.
    setEditTarget(id && piece ? { id, mode: isPieceComplete(piece) ? 'edit' : 'import' } : null);
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

  /**
   * The scope filters what this screen lists — warm-ups, routines and pieces — and
   * nothing beyond it. It never reaches the PlayView, the heatmap, or an import.
   */
  const scopedInstrument = scopeInstrument(scope);
  const visibleRoutines = filterByInstrument(routines, scope);
  const visiblePieceIds = pieceIds.filter((id) => {
    const piece = piecesById[id];
    return piece ? scopeIncludes(scope, piece.instrument) : false;
  });
  const isEmpty = visiblePieceIds.length === 0;

  /**
   * Changing the scope drops any selection: a bulk Delete must never act on rows that
   * have just left the screen, and there is no honest way to keep a selection whose
   * members are no longer visible.
   */
  function handleScopeChange(next: InstrumentScope) {
    setSelectedPieceIds([]);
    setSelectedRoutineIds([]);
    setDashboardScope(next);
  }

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

            {/* Scope + about + settings share one row so the header above can hold
                nothing but the centred lockup. No bottom margin: the Pressables' own
                p-2 already supplies the gap to the Warm-ups heading, and stacking a
                margin on top of it left a visible hole between the two. */}
            <View className="flex-row items-center justify-end">
              {/* Unlike its icon-only neighbours this one prints its value. A filter
                  that persists across launches has to advertise what it is hiding —
                  otherwise an empty-looking library is indistinguishable from a
                  filtered one. */}
              <Pressable
                className="mr-1 flex-row items-center gap-1.5 rounded-lg border border-slate-500/35 px-2.5 py-1.5 active:bg-slate-100"
                onPress={() => setScopeOpen(true)}
                accessibilityLabel={t('dashboard.scopeLabel')}
              >
                <AppIcon path={mdiMusicClefTreble} size={16} color={Colors.iconMuted} />
                <Text className="text-[13px] font-semibold text-slate-950">
                  {t(scopeShortLabelKey(scope))}
                </Text>
              </Pressable>
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

              {visibleRoutines.map((routine) => (
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

              {/* A section whose filtered list is empty keeps its heading and says so.
                Collapsing it would leave the user staring at a screen with no clue
                that a filter is the reason their routines are missing. */}
              {visibleRoutines.length === 0 ? (
                <Text className="py-3 text-sm text-slate-400">
                  {scopedInstrument
                    ? t('dashboard.emptyRoutinesScoped', {
                        instrument: t(INSTRUMENT_REGISTRY[scopedInstrument].shortLabelKey),
                      })
                    : t('dashboard.emptyRoutines')}
                </Text>
              ) : null}

              {/* Under "All" an exercise appears once per instrument that has it, and
                the row carries its own instrument to the warm-up screen — tapping
                "Scales (Clarinet)" must not re-point the dashboard's filter. */}
              {warmUpRowsForScope(scope).map((row) => (
                <WarmUpRow
                  key={`${row.type}-${row.instrument}`}
                  title={t(WARM_UP_REGISTRY[row.type].labelKey)}
                  instrument={row.instrument}
                  onPress={() =>
                    router.push({
                      pathname: '/warmup/[type]',
                      params: { type: row.type, instrument: row.instrument },
                    })
                  }
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
                {scopedInstrument
                  ? t('dashboard.emptyTitleScoped', {
                      instrument: t(INSTRUMENT_REGISTRY[scopedInstrument].shortLabelKey),
                    })
                  : t('dashboard.emptyTitle')}
              </Text>
            ) : (
              <>
                {(isLoading || isPicking) && <PieceRowSkeleton />}
                {visiblePieceIds.map((id) => {
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

        <InstrumentScopeModal
          visible={scopeOpen}
          scope={scope}
          onSelect={handleScopeChange}
          onClose={() => setScopeOpen(false)}
        />
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
