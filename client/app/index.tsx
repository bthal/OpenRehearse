import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js';
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
import { PieceEditModal } from '@components/PieceEditModal';
import { PieceRow, PieceRowSkeleton } from '@components/PieceRow';
import { RoutineRow } from '@components/RoutineRow';
import { WarmUpRow } from '@components/WarmUpRow';
import { pickXmlFile } from '@data/index';
import { Colors } from '@theme/colors';
import { usePiecesStore } from '@state/piecesStore';
import { useRoutinesStore } from '@state/routinesStore';

export default function Dashboard() {
  const { t } = useTranslation();

  // Pieces state
  const pieceIds = usePiecesStore((s) => s.pieceIds);
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

  // Piece selection
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [isDeletingPieces, setIsDeletingPieces] = useState(false);

  // Routine selection (mutually exclusive with piece selection)
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);
  const [isDeletingRoutines, setIsDeletingRoutines] = useState(false);

  const isPieceSelectionMode = selectedPieceIds.length > 0;
  const isRoutineSelectionMode = selectedRoutineIds.length > 0;

  useFocusEffect(
    useCallback(() => {
      void loadPieces();
      void loadRoutines();
    }, [loadPieces, loadRoutines]),
  );

  if (importError) {
    Alert.alert(t('dashboard.importFailed'), importError, [
      { text: t('common.ok'), onPress: clearImportError },
    ]);
  }

  async function handleImport() {
    try {
      const file = await pickXmlFile();
      if (!file) return;
      const fallbackTitle = file.name.replace(/\.(xml|mxl)$/i, '');
      await importPiece(file, fallbackTitle);
    } catch (err) {
      console.error('[handleImport] unexpected error:', err);
      Alert.alert(t('dashboard.importFailed'), String(err instanceof Error ? err.message : err));
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
    setEditingId(id);
  }

  function handleRemovePieces() {
    const count = selectedPieceIds.length;
    const firstId = selectedPieceIds[0];
    const title =
      count === 1 ? t('pieceEdit.deleteTitle') : t('pieceEdit.deleteMultipleTitle', { count });
    const message =
      count === 1
        ? t('pieceEdit.deleteMessage', { title: firstId ? (piecesById[firstId]?.title ?? '') : '' })
        : t('pieceEdit.deleteMultipleMessage', { count });
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pieceEdit.deleteConfirm'),
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
        ? t('dashboard.deleteRoutineTitle')
        : t('dashboard.deleteRoutinesTitle', { count });
    const message =
      count === 1
        ? t('dashboard.deleteRoutineMessage', { title: routine?.title ?? '' })
        : t('dashboard.deleteRoutinesMessage', { count });
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dashboard.deleteConfirm'),
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
      <SafeAreaView className="flex-1 bg-ash-grey-50">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-6 pb-12">
          <View className="w-full max-w-[720px] self-center">
            {/* Brand header */}
            <View className="items-center pb-2 pt-10">
              <Text className="font-brand text-4xl font-semibold italic tracking-wide text-mauve-shadow-500">
                OpenRehearse
              </Text>
            </View>

            {/* Warm-ups section (includes routines) */}
            <View className="mb-6 mt-4">
              <Text className="text-[22px] font-bold text-ash-grey-950">
                {t('dashboard.warmUps')}
              </Text>

              {isRoutineSelectionMode ? (
                <View className="mb-2 mt-1.5 flex-row justify-end gap-2">
                  <Pressable
                    className="flex-row items-center gap-1.5 rounded-lg border border-mauve-shadow-600 px-3 py-2 active:bg-ash-grey-100"
                    onPress={handleRemoveRoutines}
                    disabled={isDeletingRoutines}
                  >
                    {isDeletingRoutines ? (
                      <ActivityIndicator size="small" color={Colors.destructive} />
                    ) : (
                      <>
                        <AppIcon path={mdiDelete} size={14} color={Colors.destructive} />
                        <Text className="text-sm font-semibold text-mauve-shadow-600">
                          {t('common.remove')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {selectedRoutineIds.length === 1 ? (
                    <Pressable
                      className="flex-row items-center gap-1.5 rounded-lg border border-seagrass-600 px-3 py-2 active:bg-seagrass-50"
                      onPress={handleEditRoutine}
                    >
                      <AppIcon path={mdiPencil} size={14} color={Colors.primary} />
                      <Text className="text-sm font-semibold text-seagrass-600">
                        {t('common.edit')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View className="mb-2 mt-1.5 items-end">
                  <Pressable
                    className="flex-row items-center gap-2 rounded-lg border border-seagrass-600 px-4 py-2 active:bg-seagrass-50"
                    onPress={() => router.push('/routine/edit')}
                  >
                    <AppIcon path={mdiPlus} size={14} color={Colors.primary} />
                    <Text className="text-sm font-semibold text-seagrass-600">
                      {t('dashboard.newRoutine')}
                    </Text>
                  </Pressable>
                </View>
              )}

              <WarmUpRow
                title={t('dashboard.hanon')}
                onPress={() => router.push('/warmup/hanon')}
              />
              <WarmUpRow
                title={t('dashboard.scales')}
                onPress={() => router.push('/warmup/scales')}
              />

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
            </View>

            {/* Pieces header */}
            <View className="mt-2">
              <Text className="text-[22px] font-bold text-ash-grey-950">
                {t('dashboard.pieces')}
              </Text>
            </View>

            {/* Privacy note + action buttons on same row */}
            {isPieceSelectionMode ? (
              <View className="mb-3 mt-1.5 flex-row justify-end gap-2">
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-lg border border-mauve-shadow-600 px-3 py-2 active:bg-ash-grey-100"
                  onPress={handleRemovePieces}
                  disabled={isDeletingPieces}
                >
                  {isDeletingPieces ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <AppIcon path={mdiDelete} size={14} color={Colors.destructive} />
                      <Text className="text-sm font-semibold text-mauve-shadow-600">
                        {t('common.remove')}
                      </Text>
                    </>
                  )}
                </Pressable>
                {selectedPieceIds.length === 1 ? (
                  <Pressable
                    className="flex-row items-center gap-1.5 rounded-lg border border-seagrass-600 px-3 py-2 active:bg-seagrass-50"
                    onPress={handleEditPiece}
                  >
                    <AppIcon path={mdiPencil} size={14} color={Colors.primary} />
                    <Text className="text-sm font-semibold text-seagrass-600">
                      {t('common.edit')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="mb-3 mt-1.5 flex-row items-center gap-3">
                <Text className="flex-1 text-xs text-ash-grey-400">
                  {t('dashboard.privacyNote')}
                </Text>
                <Pressable
                  className="flex-row items-center gap-2 rounded-lg border border-seagrass-600 px-4 py-2 active:bg-seagrass-50"
                  onPress={handleImport}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <AppIcon path={mdiPlus} size={14} color={Colors.primary} />
                      <Text className="text-sm font-semibold text-seagrass-600">
                        {t('dashboard.importMxl')}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {/* Pieces list */}
            {isEmpty && !isLoading ? (
              <Text className="py-4 text-center text-sm text-ash-grey-400">
                {t('dashboard.emptyTitle')}
              </Text>
            ) : (
              <>
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
                {isLoading && <PieceRowSkeleton />}
              </>
            )}
          </View>
        </ScrollView>

        <PieceEditModal pieceId={editingId} onClose={() => setEditingId(null)} />
      </SafeAreaView>
    </>
  );
}
