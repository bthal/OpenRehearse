import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { INSTRUMENT_REGISTRY, type InstrumentId } from '@domain/instrumentRegistry';

/**
 * The instrument a dashboard row belongs to, as a small text chip.
 *
 * Text rather than an icon, deliberately: two icons that must be told apart at a
 * glance is a legend the app would have to teach, and "Clarinet" teaches itself. It
 * shows under a filtered scope too — the scope is a filter, not a promise, and a row
 * should say what it is without the reader having to remember what is selected.
 */
export function InstrumentBadge({ instrument }: { instrument: InstrumentId }) {
  const { t } = useTranslation();
  return (
    <View className="self-start rounded-md border border-slate-500/35 bg-slate-500/12 px-1.5 py-0.5">
      <Text className="text-[11px] font-semibold text-slate-500">
        {t(INSTRUMENT_REGISTRY[instrument].shortLabelKey)}
      </Text>
    </View>
  );
}
