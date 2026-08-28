import { mdiCheck, mdiClose } from '@mdi/js';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { INSTRUMENT_REGISTRY } from '@domain/instrumentRegistry';
import { ALL_INSTRUMENTS, INSTRUMENT_SCOPES, type InstrumentScope } from '@domain/instrumentScope';
import { Colors } from '@theme/colors';

interface InstrumentScopeModalProps {
  visible: boolean;
  scope: InstrumentScope;
  onSelect: (scope: InstrumentScope) => void;
  onClose: () => void;
}

/** The full display name of a scope — "All", or the instrument's own name. */
export function scopeLabelKey(scope: InstrumentScope): string {
  return scope === ALL_INSTRUMENTS ? 'dashboard.scopeAll' : INSTRUMENT_REGISTRY[scope].labelKey;
}

/** The same, shortened for the dashboard's own trigger and for row badges. */
export function scopeShortLabelKey(scope: InstrumentScope): string {
  return scope === ALL_INSTRUMENTS
    ? 'dashboard.scopeAll'
    : INSTRUMENT_REGISTRY[scope].shortLabelKey;
}

/**
 * Chooses which instrument's material the dashboard lists.
 *
 * A modal rather than a segmented row in the header: the header already carries the
 * brand lockup and two icons, and a third control competing for that width would
 * shrink as the registry grows. Selecting applies immediately and closes — like the
 * settings modal, there is nothing here to save.
 */
export function InstrumentScopeModal({
  visible,
  scope,
  onSelect,
  onClose,
}: InstrumentScopeModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View className="flex-1 items-center justify-center bg-slate-950/[0.4] p-6">
        <Pressable className="absolute inset-0" onPress={onClose} />

        <View className="w-full max-w-[480px] rounded-xl border border-slate-500/35 bg-slate-100 p-5">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="flex-1 text-xl font-bold text-slate-950">
              {t('dashboard.scopeHeading')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('common.cancel')}>
              <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
            </Pressable>
          </View>

          <View className="gap-2">
            {INSTRUMENT_SCOPES.map((option) => {
              const selected = scope === option;
              return (
                <Pressable
                  key={option}
                  className={`flex-row items-center justify-between rounded-lg border px-4 py-3 ${
                    selected ? 'border-navy-600 bg-navy-50' : 'border-slate-500/35 bg-slate-50'
                  }`}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                >
                  <Text
                    className={`text-base ${selected ? 'font-semibold text-navy-600' : 'text-slate-950'}`}
                  >
                    {t(scopeLabelKey(option))}
                  </Text>
                  {selected ? <AppIcon path={mdiCheck} size={18} color={Colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text className="mt-3 text-[12px] text-slate-500">{t('dashboard.scopeHint')}</Text>
        </View>
      </View>
    </Modal>
  );
}
