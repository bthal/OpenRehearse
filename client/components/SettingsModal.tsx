import { mdiClose } from '@mdi/js';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { COUNT_IN_OPTIONS, type CountInMeasures } from '@domain/countIn';
import { Colors } from '@theme/colors';
import { useSettingsStore } from '@state/settingsStore';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * App settings. Visually matches PieceEditModal (same card, header, close
 * affordance). Unlike the piece editor there is no Save step — each control is a
 * single choice that persists to the settings store the moment it is tapped.
 */
export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const countInMeasures = useSettingsStore((s) => s.countInMeasures);
  const setCountInMeasures = useSettingsStore((s) => s.setCountInMeasures);

  const optionLabel = (m: CountInMeasures) =>
    m === 0 ? t('settings.countInNone') : t('settings.countInMeasures', { count: m });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View className="flex-1 items-center justify-center bg-slate-950/[0.4] p-6">
        {/* Tap-outside to close */}
        <Pressable className="absolute inset-0" onPress={onClose} />

        <View className="max-h-[90%] w-full max-w-[480px] rounded-xl border border-slate-500/35 bg-slate-100 p-5">
          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="flex-1 text-xl font-bold text-slate-950">{t('settings.heading')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="gap-2 pb-2" keyboardShouldPersistTaps="handled">
            {/* Count-in */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
                {t('settings.countInLabel')}
              </Text>
              <View className="flex-row gap-2">
                {COUNT_IN_OPTIONS.map((m) => {
                  const selected = countInMeasures === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setCountInMeasures(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-1 items-center rounded-lg border px-3 py-2.5 ${
                        selected
                          ? 'border-navy-600 bg-navy-600'
                          : 'border-slate-500/35 bg-slate-50 active:bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? 'text-slate-50' : 'text-slate-950'
                        }`}
                      >
                        {optionLabel(m)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mt-0.5 text-xs text-slate-400">
                {t('settings.countInDescription')}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
