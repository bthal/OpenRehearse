import { mdiImport, mdiMusicNoteOutline } from '@mdi/js';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@components/AppIcon';
import { PieceRow } from '@components/PieceRow';
import { pickXmlFile } from '@data/index';
import { usePiecesStore } from '@state/piecesStore';

export default function Dashboard() {
  const {
    pieceIds,
    piecesById,
    isLoading,
    importError,
    loadPieces,
    importPiece,
    clearImportError,
  } = usePiecesStore();

  useEffect(() => {
    loadPieces();
  }, [loadPieces]);

  useEffect(() => {
    if (importError) {
      Alert.alert('Import failed', importError, [{ text: 'OK', onPress: clearImportError }]);
    }
  }, [importError, clearImportError]);

  async function handleImport() {
    try {
      const file = await pickXmlFile();
      if (!file) return;
      const fallbackTitle = file.name.replace(/\.xml$/i, '');
      const newId = await importPiece(file, fallbackTitle);
      if (newId) {
        router.push({ pathname: '/piece/[id]', params: { id: newId } });
      }
    } catch (err) {
      console.error('[handleImport] unexpected error:', err);
      Alert.alert('Import failed', String(err instanceof Error ? err.message : err));
    }
  }

  const isEmpty = pieceIds.length === 0;
  const showSpinner = isLoading && isEmpty;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">My Pieces</Text>
        <TouchableOpacity
          onPress={handleImport}
          className="flex-row items-center gap-1.5 bg-blue-500 px-3 py-2 rounded-lg"
          disabled={isLoading}
        >
          <AppIcon path={mdiImport} size={18} color="#ffffff" />
          <Text className="text-sm font-semibold text-white">Import</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {showSpinner ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : isEmpty ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <AppIcon path={mdiMusicNoteOutline} size={64} color="#D1D5DB" />
          <Text className="text-xl font-semibold text-gray-900">No pieces yet</Text>
          <Text className="text-base text-gray-500 text-center">
            Import an uncompressed MusicXML (.xml) file to get started.
          </Text>
          <TouchableOpacity
            onPress={handleImport}
            className="mt-2 bg-blue-500 px-6 py-3 rounded-xl"
            disabled={isLoading}
          >
            <Text className="text-base font-semibold text-white">Import a piece</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={pieceIds}
          keyExtractor={(id) => id}
          renderItem={({ item: id }) => {
            const piece = piecesById[id];
            if (!piece) return null;
            return (
              <PieceRow
                piece={piece}
                onPress={() => router.push({ pathname: '/piece/[id]', params: { id } })}
              />
            );
          }}
          contentContainerClassName="pb-8"
        />
      )}
    </SafeAreaView>
  );
}
