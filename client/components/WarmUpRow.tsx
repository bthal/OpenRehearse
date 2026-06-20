import { Pressable, Text, View } from 'react-native';

interface WarmUpRowProps {
  title: string;
  onPress: () => void;
}

export function WarmUpRow({ title, onPress }: WarmUpRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-ash-grey-500/35 py-3.5 pl-2 pr-1 active:bg-ash-grey-500/12"
    >
      <View className="flex-1">
        <Text className="text-lg font-semibold text-ash-grey-950" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-sm opacity-[0.85] text-ash-grey-950">Warm-up exercise</Text>
      </View>
      <Text className="pl-3 pr-4 text-[28px] opacity-[0.45] text-ash-grey-950">›</Text>
    </Pressable>
  );
}
