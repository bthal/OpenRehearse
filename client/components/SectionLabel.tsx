import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type {
  GestureResponderEvent,
  GestureResponderHandlers,
  PanResponderGestureState,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface SectionLabelProps {
  /** Display name — a score-given section name, or a "Section N" fallback. */
  name: string;
  /** Name of the section before this one, or null at the first section. */
  previousName: string | null;
  /** Name of the section after this one, or null at the last section. */
  nextName: string | null;
  /** Background color for this section, from `theme/colors.ts#SectionColors`. */
  color: string;
  /** Color of the previous section; unused when there is none. */
  previousColor: string;
  /** Color of the next section; unused when there is none. */
  nextColor: string;
  /** Which section is showing. Drives the reset after a committed swipe — an index
   *  rather than the name, because two sections can legitimately share a name. */
  sectionIndex: number;
  /** True while playing: the label rolls up to a bare strip with no text. */
  collapsed: boolean;
  /** False while playing or while a loop is armed: the swipe stands down. */
  canNavigate: boolean;
  /** Seek to the previous (-1) or next (+1) section. */
  onSeek: (direction: -1 | 1) => void;
}

// Fraction of the screen the label spans. One width for every section, because the
// label is a carousel: a box that resized to each name would reshape itself at the end
// of every swipe. It is a fraction rather than a constant only so the frame keeps the
// same proportions on any device — it is still fixed for the life of a layout.
const LABEL_WIDTH_RATIO = 0.5;
const LABEL_HEIGHT = 32;
/** Collapsed height: the label's own top edge, kept as a color strip. */
const COLLAPSED_HEIGHT = 10;

// Solid margin at each end, keeping the name clear of the fade, and how far the
// gradient ramp reaches in from each end. Both are fractions of the width so the ramps
// stay the same shape however wide the label ends up.
const PAD_RATIO = 30 / 240;
const FADE_STOP = 58 / 240;

const TRANSITION_MS = 200;
// The text has to be gone before the box has finished rolling up, or it is visibly
// sliced by the clip edge on the way down.
const CONTENT_FADE_MS = 110;

// Swipe: how far, or how fast, before a drag counts as a section change. Absolute
// rather than a fraction of the width — the gesture should cost the same effort
// whatever the label spans, and a fraction of a near-full-width label is a long drag.
const COMMIT_PX = 67;
const FLICK_VELOCITY = 0.35;
// Resistance past the first or last section — the label gives a little and springs
// back, which is the answer the missing arrow used to give.
const RUBBER_BAND = 0.25;
// A drag is only claimed once it is clearly horizontal, so a tap still falls through
// to the score underneath.
const CLAIM_THRESHOLD_PX = 6;
const SETTLE_MS = 180;
// If the seek never lands (the WebView disagrees, or the score reloaded under us),
// the label would sit permanently offset. Spring it back instead.
const COMMIT_TIMEOUT_MS = 700;

/**
 * Text is always white. On this light palette that is a soft 1.9–2.1:1 rather than a
 * legible ratio — chosen deliberately: black on these colors is perfectly readable but
 * reads heavy, and the name is a glance-level cue backed by the color itself, which is
 * what actually carries which section is running. See the SectionColors note.
 */
const TEXT_COLOR = '#FFFFFF';

const GRADIENT_PREFIX = 'sectionLabelFade';

type Interpolated = ReturnType<Animated.Value['interpolate']>;

/** One full-width layer of the label's ground, in a single section's color. */
function Ground({ color, id, opacity }: { color: string; id: string; opacity: Interpolated }) {
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity }}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset={FADE_STOP} stopColor={color} stopOpacity={1} />
            <Stop offset={1 - FADE_STOP} stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The section name across the top of the PlayView, centred over the score.
 *
 * Two states: expanded (paused) shows the name; collapsed (playing) keeps only the
 * label's top edge as a strip of the section color. Only the height moves, so it
 * reads as the same object rolling up rather than a swap.
 *
 * Swiping it horizontally moves one section, in either direction — a pager, so
 * dragging rightward brings the *earlier* section in from the left. Names travel
 * with the finger while the ground crossfades between the two sections' colors.
 * One swipe is one section: the neighbours are the only cells that exist, so the
 * gesture cannot be ridden past them.
 */
export function SectionLabel({
  name,
  previousName,
  nextName,
  color,
  previousColor,
  nextColor,
  sectionIndex,
  collapsed,
  canNavigate,
  onSeek,
}: SectionLabelProps) {
  const { t } = useTranslation();

  const labelWidth = Math.round(useWindowDimensions().width * LABEL_WIDTH_RATIO);
  const padPx = Math.round(labelWidth * PAD_RATIO);

  const [height] = useState(() => new Animated.Value(collapsed ? COLLAPSED_HEIGHT : LABEL_HEIGHT));
  const [contentOpacity] = useState(() => new Animated.Value(collapsed ? 0 : 1));
  const [dragX] = useState(() => new Animated.Value(0));

  // The mounted state is not a transition — animating into it would make the label
  // unroll every time the screen opens.
  const settled = useRef(false);

  // In-flight swipe state: which way a committed swipe went, and the fallback that
  // undoes it if the seek never lands. Touched only from effects and gesture
  // callbacks, never during render.
  const pending = useRef<{
    direction: -1 | 1 | null;
    timeout: ReturnType<typeof setTimeout> | null;
  }>({ direction: null, timeout: null });

  // The gesture is assembled in an effect rather than during render: its callbacks
  // read and write `pending`, and a ref must not be reached into while rendering.
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers | null>(null);

  const hasPrevious = previousName !== null;
  const hasNext = nextName !== null;

  useEffect(() => {
    const duration = settled.current ? TRANSITION_MS : 0;
    settled.current = true;

    Animated.parallel([
      Animated.timing(height, {
        toValue: collapsed ? COLLAPSED_HEIGHT : LABEL_HEIGHT,
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(contentOpacity, {
        toValue: collapsed ? 0 : 1,
        duration: Math.min(duration, CONTENT_FADE_MS),
        // Fade out first, fade in last: the contents are only ever shown against a
        // box tall enough to hold them.
        delay: collapsed || duration === 0 ? 0 : TRANSITION_MS - CONTENT_FADE_MS,
        useNativeDriver: false,
      }),
    ]).start();
  }, [collapsed, height, contentOpacity]);

  // The seek landed: the neighbour cell the swipe pushed into view is now the centre
  // cell, so dropping the offset is invisible. Snapping back before this point would
  // flick the old name back for the length of the WebView round trip.
  useEffect(() => {
    if (pending.current.timeout !== null) clearTimeout(pending.current.timeout);
    pending.current.timeout = null;
    pending.current.direction = null;
    dragX.setValue(0);
  }, [sectionIndex, dragX]);

  useEffect(() => {
    const settleBack = () => {
      pending.current.direction = null;
      Animated.timing(dragX, { toValue: 0, duration: SETTLE_MS, useNativeDriver: false }).start();
    };

    const responder = PanResponder.create({
      // Never claim the touch outright — a tap has to reach the score below.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        canNavigate && Math.abs(g.dx) > CLAIM_THRESHOLD_PX && Math.abs(g.dx) > Math.abs(g.dy),

      onPanResponderMove: (_e, g) => {
        // Rightward reaches back for the previous section, leftward for the next.
        const reachable = g.dx > 0 ? hasPrevious : hasNext;
        const clamped = Math.max(-labelWidth, Math.min(labelWidth, g.dx));
        dragX.setValue(reachable ? clamped : clamped * RUBBER_BAND);
      },

      onPanResponderRelease: (_e, g) => {
        const direction: -1 | 1 = g.dx > 0 ? -1 : 1;
        const reachable = direction === -1 ? hasPrevious : hasNext;
        const committed =
          reachable && (Math.abs(g.dx) > COMMIT_PX || Math.abs(g.vx) > FLICK_VELOCITY);

        if (!committed) {
          settleBack();
          return;
        }

        pending.current.direction = direction;
        Animated.timing(dragX, {
          toValue: direction === -1 ? labelWidth : -labelWidth,
          duration: SETTLE_MS,
          useNativeDriver: false,
        }).start(() => {
          if (pending.current.direction === null) return; // the new index already arrived
          pending.current.timeout = setTimeout(() => {
            if (pending.current.direction !== null) settleBack();
          }, COMMIT_TIMEOUT_MS);
        });
        onSeek(direction);
      },

      onPanResponderTerminate: settleBack,
    });

    setPanHandlers(responder.panHandlers);
  }, [canNavigate, hasPrevious, hasNext, onSeek, dragX, labelWidth]);

  useEffect(() => {
    const box = pending.current;
    return () => {
      if (box.timeout !== null) clearTimeout(box.timeout);
    };
  }, []);

  // Ground layers crossfade in place while the names travel. The neighbour underneath
  // is switched on abruptly at zero and the current one fades off it, so the two never
  // both sit at partial opacity — which would make the label go translucent mid-swipe.
  const previousGround = dragX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nextGround = dragX.interpolate({
    inputRange: [-1, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const currentGround = dragX.interpolate({
    inputRange: [-labelWidth, 0, labelWidth],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  const cell = (text: string | null, offset: number) =>
    text === null ? null : (
      <View
        style={{
          position: 'absolute',
          left: offset,
          top: 0,
          width: labelWidth,
          height: LABEL_HEIGHT,
          paddingHorizontal: padPx,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text numberOfLines={1} className="text-xl font-bold" style={{ color: TEXT_COLOR }}>
          {text}
        </Text>
      </View>
    );

  return (
    <Animated.View
      {...(panHandlers ?? {})}
      accessible={true}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: name }}
      accessibilityActions={[
        { name: 'decrement', label: t('playView.previousSection') },
        { name: 'increment', label: t('playView.nextSection') },
      ]}
      onAccessibilityAction={(event) => {
        if (!canNavigate) return;
        if (event.nativeEvent.actionName === 'decrement' && previousName !== null) onSeek(-1);
        if (event.nativeEvent.actionName === 'increment' && nextName !== null) onSeek(1);
      }}
      style={{ width: labelWidth, height, overflow: 'hidden' }}
    >
      <Ground color={previousColor} id={`${GRADIENT_PREFIX}Prev`} opacity={previousGround} />
      <Ground color={nextColor} id={`${GRADIENT_PREFIX}Next`} opacity={nextGround} />
      <Ground color={color} id={`${GRADIENT_PREFIX}Current`} opacity={currentGround} />

      {/* The names ride on one strip: the neighbours sit a full width out to each
          side, so a swipe can bring in exactly one of them and nothing beyond. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: labelWidth,
          height: LABEL_HEIGHT,
          opacity: contentOpacity,
          transform: [{ translateX: dragX }],
        }}
      >
        {cell(previousName, -labelWidth)}
        {cell(name, 0)}
        {cell(nextName, labelWidth)}
      </Animated.View>
    </Animated.View>
  );
}
