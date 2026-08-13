import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';

import { AppIcon } from './AppIcon';

interface SectionLabelProps {
  /** Display name — a score-given section name, or a "Section N" fallback. */
  name: string;
  /** Background color for this section, from `theme/colors.ts#SectionColors`. */
  color: string;
  /** Omitted when there is no previous section, or while navigation is unavailable. */
  onPrevious?: (() => void) | undefined;
  /** Omitted when there is no next section, or while navigation is unavailable. */
  onNext?: (() => void) | undefined;
}

// Every dimension is fixed. The arrows come and go with play/pause and with the
// position in the piece, and if their slots collapsed the name would slide sideways
// and the block would change height on every transition. The slots are always laid
// out; only their contents appear.
const LABEL_HEIGHT = 44;
const ARROW_SLOT_WIDTH = 36;

/** Text is always white — see the SectionColors note on why the palette stays dark. */
const TEXT_COLOR = '#FFFFFF';

export function SectionLabel({ name, color, onPrevious, onNext }: SectionLabelProps) {
  const { t } = useTranslation();

  return (
    // box-none so the label never swallows a tap meant for the score underneath —
    // only the arrows are interactive; the label itself is inert.
    <View
      pointerEvents="box-none"
      className="flex-row items-center"
      style={{ height: LABEL_HEIGHT, backgroundColor: color }}
    >
      <View style={{ width: ARROW_SLOT_WIDTH }} className="h-full items-center justify-center">
        {onPrevious && (
          <TouchableOpacity
            onPress={onPrevious}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('playView.previousSection')}
            className="h-full w-full items-center justify-center"
          >
            <AppIcon path={mdiChevronLeft} size={26} color={TEXT_COLOR} />
          </TouchableOpacity>
        )}
      </View>

      <Text
        numberOfLines={1}
        className="text-lg font-bold"
        style={{ color: TEXT_COLOR, maxWidth: 220 }}
      >
        {name}
      </Text>

      <View style={{ width: ARROW_SLOT_WIDTH }} className="h-full items-center justify-center">
        {onNext && (
          <TouchableOpacity
            onPress={onNext}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('playView.nextSection')}
            className="h-full w-full items-center justify-center"
          >
            <AppIcon path={mdiChevronRight} size={26} color={TEXT_COLOR} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
