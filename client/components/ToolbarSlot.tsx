import { forwardRef, type ReactNode } from 'react';
import { TouchableOpacity, View, type AccessibilityState } from 'react-native';

import { TOOLBAR_SLOT } from '@components/ToolbarShell';

interface ToolbarSlotProps {
  onPress: () => void;
  accessibilityLabel?: string;
  /** For toggles, e.g. `{ selected: muted }`. */
  accessibilityState?: AccessibilityState;
  children: ReactNode;
}

/**
 * One fixed-size toolbar field — a button in the card, or an option in a fly-out panel.
 *
 * The forwarded ref reaches the outer view, which a screen `measureLayout`s to line a
 * panel up with the button that opened it.
 */
export const ToolbarSlot = forwardRef<View, ToolbarSlotProps>(function ToolbarSlot(
  { onPress, accessibilityLabel, accessibilityState, children },
  ref,
) {
  return (
    <View ref={ref} style={{ width: TOOLBAR_SLOT, height: TOOLBAR_SLOT }}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
});
