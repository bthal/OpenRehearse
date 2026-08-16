import { mdiCheckCircle, mdiCircleOutline } from '@mdi/js';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Routine } from '@domain/routine';
import { estimateRoutineSeconds } from '@domain/routineMusicXml';
import { Colors } from '@theme/colors';
import { AppIcon } from './AppIcon';

interface RoutineRowProps {
  routine: Routine;
  isSelected: boolean;
  isSelectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export function RoutineRow({
  routine,
  isSelected,
  isSelectionMode,
  onPress,
  onLongPress,
}: RoutineRowProps) {
  const { t } = useTranslation();

  const exerciseCount = routine.blocks.filter((b) => b.type !== 'pause').length;
  const totalSeconds = estimateRoutineSeconds(routine);
  const minutes = Math.round(totalSeconds / 60);
  const durationStr =
    minutes < 1 ? '< 1 minute' : minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const exerciseStr = t('routineRow.exercise', { count: exerciseCount });
  const subtitle = `Routine — ${exerciseStr} • ${durationStr}`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className={`flex-row items-center border-b border-slate-500/35 py-3.5 pl-2 pr-1 active:bg-slate-500/12 ${isSelected ? 'bg-navy-500/20' : ''}`}
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
        <Text className="text-lg font-semibold text-slate-950" numberOfLines={1}>
          {routine.title || t('routineEdit.newTitle')}
        </Text>
        <Text className="mt-0.5 text-sm opacity-[0.85] text-slate-950" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {!isSelectionMode ? (
        <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-slate-950">›</Text>
      ) : null}
    </Pressable>
  );
}
