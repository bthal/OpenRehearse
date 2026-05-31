import { mdiPencil } from '@mdi/js';
import { Pressable, Text, View } from 'react-native';

import type { Piece } from '@domain/piece';
import { Colors } from '@theme/colors';
import { AppIcon } from './AppIcon';

interface PieceRowProps {
  piece: Piece;
  onPress: () => void;
  onEdit: () => void;
}

export function PieceRow({ piece, onPress, onEdit }: PieceRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-ash-grey-500/35 py-3.5 pl-2 pr-1 active:bg-ash-grey-500/12"
    >
      <View className="flex-1">
        {/* Title row + edit pencil */}
        <View className="flex-row items-center gap-1.5 self-start">
          <Text className="shrink text-lg font-semibold text-ash-grey-950" numberOfLines={2}>
            {piece.title}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onEdit();
            }}
            hitSlop={6}
            className="p-0.5"
          >
            <AppIcon path={mdiPencil} size={14} color={Colors.tabIconDefault} />
          </Pressable>
        </View>

        {/* Composer */}
        {piece.composer ? (
          <Text className="mt-0.5 text-sm opacity-[0.85] text-ash-grey-950" numberOfLines={1}>
            {piece.composer}
          </Text>
        ) : null}
      </View>

      {/* Chevron */}
      <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-ash-grey-950">›</Text>
    </Pressable>
  );
}
