import { mdiArrowLeft, mdiMusicNoteOutline } from '@mdi/js';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@components/AppIcon';
import { usePiecesStore } from '@state/piecesStore';

export default function PlayView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const piece = usePiecesStore((s) => (id ? s.piecesById[id] : undefined));

  if (!piece) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-base text-gray-500">Piece not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-blue-500 text-base">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <AppIcon path={mdiArrowLeft} size={24} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1 min-w-0">
          <Text className="text-lg font-semibold text-gray-900" numberOfLines={1}>
            {piece.title}
          </Text>
          {piece.composer && (
            <Text className="text-sm text-gray-500 italic" numberOfLines={1}>
              {piece.composer}
            </Text>
          )}
        </View>
      </View>

      {/* Placeholder body — replaced in Phase 2 with OSMD WebView */}
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <AppIcon path={mdiMusicNoteOutline} size={64} color="#D1D5DB" />
        <Text className="text-base text-gray-400 text-center">Score view coming in Phase 2.</Text>
      </View>
    </SafeAreaView>
  );
}
