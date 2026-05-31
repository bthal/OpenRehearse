import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function Dashboard() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-gray-900">My Pieces</Text>
        <Text className="mt-2 text-base text-gray-500">
          No pieces yet. Import a MusicXML file to get started.
        </Text>
      </View>
    </SafeAreaView>
  );
}
