import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToolbarShellProps {
  /** True while playing: the toolbar slides off the left edge of the screen. */
  hidden: boolean;
  /** The screen's own buttons, top to bottom. */
  children: ReactNode;
}

const SLIDE_MS = 180;

/** Enough travel past the edge that the card's shadow clears it too. */
const SHADOW_SLACK_PX = 16;

/**
 * The floating toolbar's shell: where it sits, what it looks like, and how it leaves.
 *
 * Only the shell is shared. The play view and the warm-up screen hold different sets of
 * buttons and anchor different fly-out panels, and pulling those together would be a
 * refactor of working code rather than the visual change this is — so they stay in
 * their screens and pass them in.
 *
 * Playing slides the whole card off the left edge, leaving nothing on screen but the
 * notation; pausing brings it back. Tapping the score is what pauses, so the toolbar is
 * always one tap away even while it is gone.
 *
 * The forwarded ref reaches the card itself, which both screens `measureLayout` to
 * anchor their panels. The transform lives on the wrapper above it, not the card, so
 * that measurement keeps returning layout coordinates — and panels only ever open while
 * paused, i.e. at rest with the card at its resting position.
 */
export const ToolbarShell = forwardRef<View, ToolbarShellProps>(function ToolbarShell(
  { hidden, children },
  ref,
) {
  // The play surfaces run edge to edge so the notation can use the whole screen, which
  // means `left: 0` here is the physical edge — including the strip beside a landscape
  // phone's camera. The toolbar keeps clear of that itself, by padding at rest and by
  // travelling the inset as well as its own width when it leaves. On a device with no
  // cutout the inset is zero and both terms vanish.
  const insets = useSafeAreaInsets();

  const [translateX] = useState(() => new Animated.Value(0));
  // Zero until the card has been laid out. There is no sensible distance to slide by
  // before then, so the first pass just holds still.
  const [width, setWidth] = useState(0);
  // Arriving already hidden is not a transition — a screen opened mid-playback should
  // find the toolbar away, not watch it leave.
  const settled = useRef(false);

  useEffect(() => {
    if (width === 0) return;
    const to = hidden ? -(width + insets.left + SHADOW_SLACK_PX) : 0;

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
  }, [hidden, width, insets.left, translateX]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        paddingLeft: insets.left,
        justifyContent: 'center',
        transform: [{ translateX }],
      }}
    >
      <View
        ref={ref}
        onLayout={onLayout}
        className="bg-white rounded-xl py-3 px-2 items-center gap-4"
        style={{
          elevation: 4,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 2, height: 0 },
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
});
