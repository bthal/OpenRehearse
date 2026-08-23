import { mdiClose } from '@mdi/js';
import { TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { Colors } from '@theme/colors';

interface BitModeButtonsProps {
  /** Disarm the bit and return to ordinary play view. */
  onLeave: () => void;
}

/**
 * What replaces Back and the loop button while a bit is armed.
 *
 * Only the top of the toolbar swaps: metronome, hand and speed stay where they are, and
 * stay live, because a bit owns those settings and changing one inside a bit writes back
 * to it. There is deliberately no Back button — leaving the bit is the way out, and one
 * extra tap to the Dashboard is cheaper than a control that abandons a bit silently.
 *
 * Deleting is not here either. A toolbar button could only ever reach the *armed* bit,
 * while the marker strip shows every one of them; deletion lives on a long press of the
 * marker, where the finger is already on the bit it means. So this is one button today —
 * kept as its own component because it is the seam the bit-mode toolbar is tested through.
 */
export function BitModeButtons({ onLeave }: BitModeButtonsProps) {
  const { t } = useTranslation();

  return (
    <View className="items-center gap-4">
      <TouchableOpacity
        onPress={onLeave}
        hitSlop={12}
        className="p-1"
        accessibilityRole="button"
        accessibilityLabel={t('playView.leaveBit')}
      >
        <AppIcon path={mdiClose} size={24} color={Colors.icon} />
      </TouchableOpacity>
    </View>
  );
}
