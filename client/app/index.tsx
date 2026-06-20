import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { PieceEditModal } from '@components/PieceEditModal';
import { PieceRow, PieceRowSkeleton } from '@components/PieceRow';
import { WarmUpRow } from '@components/WarmUpRow';
import { pickXmlFile } from '@data/index';
import { Colors } from '@theme/colors';
import { usePiecesStore } from '@state/piecesStore';

export default function Dashboard() {
  const { t } = useTranslation();
  const pieceIds = usePiecesStore((s) => s.pieceIds);
  const piecesById = usePiecesStore((s) => s.piecesById);
  const isLoading = usePiecesStore((s) => s.isLoading);
  const importError = usePiecesStore((s) => s.importError);
  const loadPieces = usePiecesStore((s) => s.loadPieces);
  const importPiece = usePiecesStore((s) => s.importPiece);
  const deletePiece = usePiecesStore((s) => s.deletePiece);
  const clearImportError = usePiecesStore((s) => s.clearImportError);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSelectionMode = selectedIds.length > 0;

  useFocusEffect(
    useCallback(() => {
      void loadPieces();
    }, [loadPieces]),
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleRowPress(id: string) {
    if (isSelectionMode) {
      toggleSelect(id);
    } else {
      router.push({ pathname: '/piece/[id]', params: { id } });
    }
  }

  function handleEdit() {
    const id = selectedIds[0] ?? null;
    setSelectedIds([]);
    setEditingId(id);
  }

  function handleRemove() {
    const count = selectedIds.length;
    const firstId = selectedIds[0];
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
          setIsDeleting(true);
          try {
            await Promise.all(selectedIds.map((id) => deletePiece(id)));
            setSelectedIds([]);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  }

  const isEmpty = pieceIds.length === 0;

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait' }} />
      <SafeAreaView className="flex-1 bg-ash-grey-50 px-6 pb-6">
        <View className="w-full max-w-[720px] flex-1 self-center">
          {/* Brand header */}
          <View className="items-center pb-2 pt-10">
            <Text className="font-brand text-4xl font-semibold italic tracking-wide text-mauve-shadow-500">
              OpenRehearse
            </Text>
          </View>

          {/* Warm-ups section */}
          <View className="mb-6 mt-4">
            <Text className="mb-2 text-[22px] font-bold text-ash-grey-950">
              {t('dashboard.warmUps')}
            </Text>
            <WarmUpRow title={t('dashboard.hanon')} onPress={() => router.push('/warmup/hanon')} />
            <WarmUpRow
              title={t('dashboard.scales')}
              onPress={() => router.push('/warmup/scales')}
            />
          </View>

          {/* Header */}
          <View className="mb-2 mt-2 flex-row items-center justify-between">
            <Text className="text-[22px] font-bold text-ash-grey-950">{t('dashboard.pieces')}</Text>

            {isSelectionMode ? (
              <View className="flex-row gap-2">
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-lg border border-mauve-shadow-600 bg-white px-3 py-2 active:bg-ash-grey-100"
                  onPress={handleRemove}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
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
                {selectedIds.length === 1 ? (
                  <Pressable
                    className="flex-row items-center gap-1.5 rounded-lg border border-seagrass-600 bg-white px-3 py-2 active:bg-seagrass-50"
                    onPress={handleEdit}
                  >
                    <AppIcon path={mdiPencil} size={14} color={Colors.primary} />
                    <Text className="text-sm font-semibold text-seagrass-600">
                      {t('common.edit')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Pressable
                className="flex-row items-center gap-2 rounded-lg border border-seagrass-600 bg-white px-4 py-2 active:bg-seagrass-50"
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
            )}
          </View>

          {/* Privacy note */}
          <Text className="mb-3 text-xs text-ash-grey-400">{t('dashboard.privacyNote')}</Text>

          {/* Content */}
          {isEmpty && !isLoading ? (
            <Text className="py-4 text-center text-sm text-ash-grey-400">
              {t('dashboard.emptyTitle')}
            </Text>
          ) : (
            <FlatList
              className="flex-1"
              data={pieceIds}
              keyExtractor={(id) => id}
              contentContainerClassName="pb-10"
              renderItem={({ item: id }) => {
                const piece = piecesById[id];
                if (!piece) return null;
                return (
                  <PieceRow
                    piece={piece}
                    isSelected={selectedIds.includes(id)}
                    isSelectionMode={isSelectionMode}
                    onPress={() => handleRowPress(id)}
                    onLongPress={() => {
                      if (!isSelectionMode) Vibration.vibrate(40);
                      toggleSelect(id);
                    }}
                  />
                );
              }}
              ListFooterComponent={isLoading ? <PieceRowSkeleton /> : null}
            />
          )}
        </View>

        <PieceEditModal pieceId={editingId} onClose={() => setEditingId(null)} />
      </SafeAreaView>
    </>
  );
}
