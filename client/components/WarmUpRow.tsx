import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { InstrumentId } from '@domain/instrumentRegistry';
import { InstrumentBadge } from './InstrumentBadge';

interface WarmUpRowProps {
  title: string;
  /** The instrument this row is for — under "All" the same exercise appears twice. */
  instrument: InstrumentId;
  onPress: () => void;
}

export function WarmUpRow({ title, instrument, onPress }: WarmUpRowProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-slate-500/35 py-3.5 pl-2 pr-1 active:bg-slate-500/12"
    >
      <View className="flex-1">
        <Text className="text-lg font-semibold text-slate-950" numberOfLines={1}>
          {title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <InstrumentBadge instrument={instrument} />
          <Text className="flex-1 text-sm opacity-[0.85] text-slate-950">
            {t('warmUpRow.description')}
          </Text>
        </View>
      </View>
      <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-slate-950">›</Text>
    </Pressable>
  );
}
