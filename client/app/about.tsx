import { mdiArrowLeft } from '@mdi/js';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { Colors } from '@theme/colors';

interface NoticeProps {
  name: string;
  license: string;
  copyright: string;
  /**
   * Extra line for licences whose terms are not satisfied by a credit alone.
   * The logo is CC BY, which obliges us to link the licence *and* state that the
   * work was modified — neither fits in the `license · copyright` line.
   */
  note?: string;
}

function NoticeRow({ name, license, copyright, note }: NoticeProps) {
  return (
    <View className="border-b border-slate-500/25 py-3">
      <Text className="text-sm font-semibold text-slate-950">{name}</Text>
      <Text className="mt-0.5 text-xs text-slate-500">
        {license} · {copyright}
      </Text>
      {note ? <Text className="mt-1 text-xs leading-relaxed text-slate-400">{note}</Text> : null}
    </View>
  );
}

export default function AboutScreen() {
  const { t } = useTranslation();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait' }} />
      <SafeAreaView className="flex-1 bg-slate-50">
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-500/25 px-4 py-3">
          <Pressable
            className="mr-3 p-1 active:opacity-60"
            onPress={() => router.back()}
            accessibilityLabel={t('common.goBack')}
          >
            <AppIcon path={mdiArrowLeft} size={22} color={Colors.primary} />
          </Pressable>
          <Text className="text-base font-semibold text-slate-950">{t('about.title')}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-6 pb-12 pt-6"
        >
          <View className="w-full max-w-[720px] self-center gap-8">
            {/* App identity */}
            <View className="items-center gap-1">
              <Text className="font-brand text-3xl tracking-tight text-navy-950">OpenRehearse</Text>
              <Text className="text-sm text-slate-400">{t('about.version', { version })}</Text>
            </View>

            {/* Privacy */}
            <View className="gap-2">
              <Text className="text-base font-bold text-slate-950">
                {t('about.privacyHeading')}
              </Text>
              <Text className="text-sm leading-relaxed text-slate-700">
                {t('about.privacyBody')}
              </Text>
            </View>

            {/* Demo piece */}
            <View className="gap-2">
              <Text className="text-base font-bold text-slate-950">{t('about.demoHeading')}</Text>
              <Text className="text-sm leading-relaxed text-slate-700">{t('about.demoBody')}</Text>
            </View>

            {/* Third-party licenses */}
            <View className="gap-2">
              <Text className="text-base font-bold text-slate-950">
                {t('about.licensesHeading')}
              </Text>
              <View>
                {/* First, because it is the one notice with active obligations:
                    CC BY requires both the licence link and the modification
                    statement to travel with the mark wherever it appears. */}
                <NoticeRow
                  name={t('about.logoNotice')}
                  license="CC BY 4.0"
                  copyright="© Pixel Bazaar, via SVG Repo"
                  note={t('about.logoModified')}
                />
                <NoticeRow
                  name={t('about.fontNotice')}
                  license="SIL OFL 1.1"
                  copyright="© Outfit Project Authors"
                />
                <NoticeRow
                  name="OpenSheetMusicDisplay (OSMD)"
                  license="BSD 3-Clause"
                  copyright="© 2019 PhonicScore"
                />
                <NoticeRow name="Tone.js" license="MIT" copyright="© 2014–2020 Yotam Mann" />
                <NoticeRow
                  name="Material Design Icons (@mdi/js)"
                  license="Apache 2.0"
                  copyright="© Austin Andrews & Pictogrammers"
                />
                <NoticeRow
                  name="React Native / Expo"
                  license="MIT"
                  copyright="© Meta Platforms, © Expo"
                />
                <NoticeRow
                  name="NativeWind, Zustand, i18next, fast-xml-parser, fflate"
                  license="MIT"
                  copyright="respective authors"
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
