import { mdiChevronDown, mdiChevronUp } from '@mdi/js';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Colors } from '@theme/colors';
import { AppIcon } from './AppIcon';

interface ExerciseGroupToggleProps {
  /** How many exercise rows the group holds under the current scope. */
  count: number;
  expanded: boolean;
  /** Inert while routines are being selected — see `specs/features/dashboard.md`. */
  disabled?: boolean;
  onPress: () => void;
}

/**
 * The one row the built-in exercises fold behind on the dashboard. It names a count rather
 * than an instrument: the count already follows the scope filter, so collapsing never hides
 * how much the filter is holding back.
 */
export function ExerciseGroupToggle({
  count,
  expanded,
  disabled = false,
  onPress,
}: ExerciseGroupToggleProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ expanded, disabled }}
      className={`flex-row items-center border-b border-slate-500/35 py-3.5 pl-2 pr-1 active:bg-slate-500/12 ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="flex-1">
        <Text className="text-lg font-semibold text-slate-950" numberOfLines={1}>
          {t('dashboard.exercises')}
        </Text>
        <Text className="mt-0.5 text-sm opacity-[0.85] text-slate-950">
          {t('dashboard.exerciseCount', { count })}
        </Text>
      </View>
      <View className="pl-3 pr-3">
        <AppIcon
          path={expanded ? mdiChevronUp : mdiChevronDown}
          size={28}
          color={Colors.iconMuted}
        />
      </View>
    </Pressable>
  );
}
