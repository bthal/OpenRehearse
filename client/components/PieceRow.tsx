import { mdiCheckCircle, mdiCircleOutline } from '@mdi/js';
import { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import type { Piece } from '@domain/piece';
import { Colors } from '@theme/colors';
import { AppIcon } from './AppIcon';

interface PieceRowProps {
  piece: Piece;
  isSelected: boolean;
  isSelectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export function PieceRowSkeleton() {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View className="flex-row items-center border-b border-ash-grey-500/35 py-3.5 pl-2 pr-1">
      <Animated.View style={{ flex: 1, gap: 8, opacity }}>
        <View className="h-[19px] w-3/4 rounded bg-ash-grey-200" />
        <View className="h-3.5 w-2/5 rounded bg-ash-grey-200" />
      </Animated.View>
      <Text className="pl-3 pr-4 text-[28px] opacity-[0.15] text-ash-grey-950">›</Text>
    </View>
  );
}

export function PieceRow({
  piece,
  isSelected,
  isSelectionMode,
  onPress,
  onLongPress,
}: PieceRowProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className={`flex-row items-center border-b border-ash-grey-500/35 py-3.5 pl-2 pr-1 active:bg-ash-grey-500/12 ${isSelected ? 'bg-seagrass-500/20' : ''}`}
    >
      {isSelectionMode ? (
        <View className="mr-3">
          <AppIcon
            path={isSelected ? mdiCheckCircle : mdiCircleOutline}
            size={22}
            color={isSelected ? Colors.primary : Colors.tabIconDefault}
          />
        </View>
      ) : null}

      <View className="flex-1">
        <Text className="text-lg font-semibold text-ash-grey-950" numberOfLines={2}>
          {piece.title}
        </Text>
        {piece.composer ? (
          <Text className="mt-0.5 text-sm opacity-[0.85] text-ash-grey-950" numberOfLines={1}>
            {piece.composer}
          </Text>
        ) : null}
      </View>

      {!isSelectionMode ? (
        <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-ash-grey-950">›</Text>
      ) : null}
    </Pressable>
  );
}
