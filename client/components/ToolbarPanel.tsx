import { Children, useEffect, useState, type ReactNode } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';

import {
  TOOLBAR_PAD_ACROSS,
  TOOLBAR_PAD_ALONG,
  TOOLBAR_SLOT,
  TOOLBAR_SLOT_GAP,
  toolbarCardStyle,
} from '@components/ToolbarShell';
import { Colors } from '@theme/colors';

/** A panel's height: one slot plus the card's padding across it — the card's own width. */
export const TOOLBAR_PANEL_HEIGHT = TOOLBAR_SLOT + 2 * TOOLBAR_PAD_ACROSS;

/**
 * A panel option's content is a size up from the toolbar's own: the toolbar labels share
 * a slot with a caption, while a panel option has the whole slot to itself.
 */
export const TOOLBAR_PANEL_TEXT_SIZE = 17;
export const TOOLBAR_PANEL_ICON_SIZE = 26;

/**
 * Where a panel's top goes so it is centred on the button that opened it, given that
 * button's `y` and `height` measured against the score area.
 */
export function panelTopFor(triggerY: number, triggerHeight: number): number {
  return triggerY + triggerHeight / 2 - TOOLBAR_PANEL_HEIGHT / 2;
}

interface ToolbarPanelProps {
  open: boolean;
  /** From `panelTopFor`. */
  top: number;
  /** Options beyond this many scroll rather than widen the panel. */
  maxVisible?: number;
  /** The options, each a `ToolbarSlot`. */
  children: ReactNode;
}

/**
 * A fly-out beside the toolbar: the card turned on its side. Same surface, same slots,
 * same padding rotated a quarter turn — so its height is the card's width and an option
 * is the same size as the button that opened it.
 *
 * Opening springs the width out from the card's edge. Render it through `ToolbarShell`'s
 * `panels`, which places it and carries it off screen with the toolbar.
 */
export function ToolbarPanel({ open, top, maxVisible, children }: ToolbarPanelProps) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, {
      toValue: open ? 1 : 0,
      // See ToolbarShell — a native-driven value falls back to a stale commit on release.
      useNativeDriver: false,
      bounciness: 4,
      speed: 18,
    }).start();
  }, [open, anim]);

  const count = Children.toArray(children).length;
  const visible = maxVisible === undefined ? count : Math.min(count, maxVisible);
  const width =
    visible * TOOLBAR_SLOT + Math.max(visible - 1, 0) * TOOLBAR_SLOT_GAP + 2 * TOOLBAR_PAD_ALONG;
  const scrolls = visible < count;

  const rowStyle = {
    flexDirection: 'row' as const,
    gap: TOOLBAR_SLOT_GAP,
    paddingVertical: TOOLBAR_PAD_ACROSS,
    paddingHorizontal: TOOLBAR_PAD_ALONG,
  };

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        toolbarCardStyle,
        {
          position: 'absolute',
          left: 0,
          top,
          height: TOOLBAR_PANEL_HEIGHT,
          width: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, width],
            extrapolate: 'clamp',
          }),
          overflow: 'hidden',
        },
      ]}
    >
      {/* The content keeps its full width while the panel grows, so options are revealed
        rather than squeezed. */}
      {scrolls ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width, flexGrow: 0 }}
          contentContainerStyle={rowStyle}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[rowStyle, { width }]}>{children}</View>
      )}
    </Animated.View>
  );
}

/** An option's text label, teal when it is the current value. */
export function ToolbarPanelText({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: TOOLBAR_PANEL_TEXT_SIZE,
        fontWeight: '600',
        color: active ? Colors.primary : Colors.iconMuted,
      }}
    >
      {children}
    </Text>
  );
}
