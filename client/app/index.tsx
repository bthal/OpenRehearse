import { mdiMusicNote, mdiPlus } from '@mdi/js';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { PieceEditModal } from '@components/PieceEditModal';
import { PieceRow } from '@components/PieceRow';
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
  const clearImportError = usePiecesStore((s) => s.clearImportError);

  const [editingId, setEditingId] = useState<string | null>(null);

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

  const isEmpty = pieceIds.length === 0;
  const showSpinner = isLoading && isEmpty;

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait' }} />
      <SafeAreaView className="flex-1 bg-ash-grey-50 px-6 pb-6">
        <View className="w-full max-w-[720px] flex-1 self-center">
          {/* Warm-ups section */}
          <View className="mb-4 pt-2">
            <Text className="mb-2 text-[22px] font-bold text-ash-grey-950">{t('dashboard.warmUps')}</Text>
            <WarmUpRow title={t('dashboard.hanon')} onPress={() => router.push('/warmup/hanon')} />
            <WarmUpRow title={t('dashboard.scales')} onPress={() => router.push('/warmup/scales')} />
          </View>

          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-[22px] font-bold text-ash-grey-950">{t('dashboard.pieces')}</Text>
            {!isEmpty ? (
              <Pressable
                className="h-9 w-9 items-center justify-center rounded-lg bg-seagrass-600 active:bg-seagrass-700"
                onPress={handleImport}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={Colors.primaryForeground} />
                ) : (
                  <AppIcon path={mdiPlus} size={16} color={Colors.primaryForeground} />
                )}
              </Pressable>
            ) : null}
          </View>

          {/* Content */}
          {showSpinner ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : isEmpty ? (
            <View className="flex-1 items-center justify-center py-6">
              <View className="w-full max-w-[400px] items-center gap-3 rounded-xl border border-ash-grey-500/35 bg-ash-grey-100 px-7 py-9">
                <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-seagrass-500/20">
                  <AppIcon path={mdiMusicNote} size={32} color={Colors.primary} />
                </View>
                <Text className="text-center text-xl font-semibold text-ash-grey-950">
                  {t('dashboard.emptyTitle')}
                </Text>
                <Text className="mb-2 text-center text-[15px] leading-[22px] opacity-[0.88] text-ash-grey-950">
                  {t('dashboard.emptyDescription')}
                </Text>
                <Pressable
                  className="min-w-[160px] flex-row items-center justify-center gap-2 rounded-lg bg-seagrass-600 px-5 py-3 active:bg-seagrass-700"
                  onPress={handleImport}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.primaryForeground} />
                  ) : (
                    <>
                      <AppIcon path={mdiPlus} size={14} color={Colors.primaryForeground} />
                      <Text className="text-base font-semibold text-ash-grey-50">{t('dashboard.importScore')}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
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
                    onPress={() => router.push({ pathname: '/piece/[id]', params: { id } })}
                    onEdit={() => setEditingId(id)}
                  />
                );
              }}
            />
          )}
        </View>

        <PieceEditModal pieceId={editingId} onClose={() => setEditingId(null)} />
      </SafeAreaView>
    </>
  );
}
