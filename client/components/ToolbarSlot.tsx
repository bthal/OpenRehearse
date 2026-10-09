import { forwardRef, type ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { TOOLBAR_SLOT } from '@components/ToolbarShell';

interface ToolbarSlotProps {
  onPress: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}

/**
 * One fixed-size toolbar field — a button in the card, or an option in a fly-out panel.
 *
 * The forwarded ref reaches the outer view, which a screen `measureLayout`s to line a
 * panel up with the button that opened it.
 */
export const ToolbarSlot = forwardRef<View, ToolbarSlotProps>(function ToolbarSlot(
  { onPress, accessibilityLabel, children },
  ref,
) {
  return (
    <View ref={ref} style={{ width: TOOLBAR_SLOT, height: TOOLBAR_SLOT }}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
});
