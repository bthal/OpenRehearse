import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToolbarShellProps {
  /** True while playing: the toolbar slides off the left edge of the screen. */
  hidden: boolean;
  /** The screen's own buttons, top to bottom — each one a `ToolbarSlot`. */
  children: ReactNode;
  /** The screen's fly-out `ToolbarPanel`s. Placed beside the card and slide with it. */
  panels?: ReactNode;
}

/**
 * One toolbar field. Every button in the card and every option in a fly-out panel is a
 * square of this size, so the card's width never depends on what a button happens to be
 * showing — the speed button swapping "×0.75" for a speedometer icon used to resize it.
 */
export const TOOLBAR_SLOT = 48;
/** Space between neighbouring slots, in the card and in a panel alike. */
export const TOOLBAR_SLOT_GAP = 4;
/** The card's padding: along the run of slots, and across it. */
export const TOOLBAR_PAD_ALONG = 12;
export const TOOLBAR_PAD_ACROSS = 8;
/** Space between the card's right edge and an open panel. */
const PANEL_GAP = 8;

/** The card's surface, shared with the panels so the two cannot drift apart. */
export const toolbarCardStyle: ViewStyle = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  elevation: 4,
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 6,
  shadowOffset: { width: 2, height: 0 },
};

const SLIDE_MS = 180;

/** Enough travel past the edge that the card's shadow clears it too. */
const SHADOW_SLACK_PX = 16;

/**
 * The floating toolbar's shell: where it sits, what it looks like, and how it leaves.
 *
 * Only the shell is shared. The play view and the warm-up screen hold different sets of
 * buttons and panels, so they stay in their screens and pass them in.
 *
 * Playing slides the whole card off the left edge, leaving nothing on screen but the
 * notation; pausing brings it back. Tapping the score is what pauses, so the toolbar is
 * always one tap away even while it is gone.
 *
 * Panels are rendered here, beside the card and inside the sliding wrapper, so an open
 * panel leaves with the toolbar instead of being stranded over the score. Their left edge
 * comes from the card's own layout, which already includes the cutout inset. Vertically
 * they are positioned by the screen (see `panelTopFor`), in the wrapper's coordinates —
 * which are the score area's, since the wrapper spans it top to bottom.
 *
 * The wrapper spans the full width too, with `box-none` so the score underneath still
 * gets its taps. That is not cosmetic: Android delivers no touches to a child drawn
 * outside its parent's bounds, so a wrapper only as wide as the card would leave every
 * panel visible but dead.
 */
export function ToolbarShell({ hidden, children, panels }: ToolbarShellProps) {
  // The play surfaces run edge to edge so the notation can use the whole screen, which
  // means `left: 0` here is the physical edge — including the strip beside a landscape
  // phone's camera. The toolbar keeps clear of that itself, by padding at rest and by
  // travelling the inset as well as its own width when it leaves. On a device with no
  // cutout the inset is zero and both terms vanish.
  const insets = useSafeAreaInsets();

  const [translateX] = useState(() => new Animated.Value(0));
  // Zero until the card has been laid out. There is no sensible distance to slide by
  // before then, so the first pass just holds still.
  const [card, setCard] = useState({ x: 0, width: 0 });
  // Arriving already hidden is not a transition — a screen opened mid-playback should
  // find the toolbar away, not watch it leave.
  const settled = useRef(false);

  useEffect(() => {
    if (card.width === 0) return;
    const to = hidden ? -(card.width + insets.left + SHADOW_SLACK_PX) : 0;

    if (!settled.current) {
      settled.current = true;
      translateX.setValue(to);
      return;
    }

    Animated.timing(translateX, {
      toValue: to,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      // Must not be the native driver, and the reason is not performance. Nothing
      // re-renders this component during the slide — measured — so React's committed
      // transform stays at the value it held when the slide began. A native animation
      // drives the view only while it is connected; when it finishes and releases, the
      // view falls back to that stale commit for a frame. Leaving, the card flashed
      // back at 0; arriving, it blinked to the hidden offset. A JS-driven value is the
      // same value React reads, so the two cannot disagree.
      useNativeDriver: false,
    }).start();
  }, [hidden, card.width, insets.left, translateX]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setCard({ x, width });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        paddingLeft: insets.left,
        justifyContent: 'center',
        alignItems: 'flex-start',
        transform: [{ translateX }],
      }}
    >
      <View
        onLayout={onLayout}
        style={[
          toolbarCardStyle,
          {
            paddingVertical: TOOLBAR_PAD_ALONG,
            paddingHorizontal: TOOLBAR_PAD_ACROSS,
            alignItems: 'center',
            gap: TOOLBAR_SLOT_GAP,
          },
        ]}
      >
        {children}
      </View>
      {panels && card.width > 0 ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: card.x + card.width + PANEL_GAP,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          {panels}
        </View>
      ) : null}
    </Animated.View>
  );
}
