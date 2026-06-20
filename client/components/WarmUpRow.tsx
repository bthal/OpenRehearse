import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface WarmUpRowProps {
  title: string;
  onPress: () => void;
}

export function WarmUpRow({ title, onPress }: WarmUpRowProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-ash-grey-500/35 py-3.5 pl-2 pr-1 active:bg-ash-grey-500/12"
    >
      <View className="flex-1">
        <Text className="text-lg font-semibold text-ash-grey-950" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-sm opacity-[0.85] text-ash-grey-950">
          {t('warmUpRow.description')}
        </Text>
      </View>
      <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-ash-grey-950">›</Text>
    </Pressable>
  );
}
