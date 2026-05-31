import { mdiMusicNote } from '@mdi/js';
import { Text, TouchableOpacity, View } from 'react-native';

import type { Piece } from '@domain/piece';
import { AppIcon } from './AppIcon';

interface PieceRowProps {
  piece: Piece;
  onPress: () => void;
}

export function PieceRow({ piece, onPress }: PieceRowProps) {
  const date = new Date(piece.importedAt).toLocaleDateString();

  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-100"
      activeOpacity={0.6}
    >
      <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center shrink-0">
        <AppIcon path={mdiMusicNote} size={22} color="#3B82F6" />
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {piece.title}
        </Text>
        {piece.composer !== null && (
          <Text className="text-sm text-gray-500 italic" numberOfLines={1}>
            {piece.composer}
          </Text>
        )}
      </View>

      <Text className="text-xs text-gray-400 shrink-0">{date}</Text>
    </TouchableOpacity>
  );
}
