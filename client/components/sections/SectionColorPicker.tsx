import { useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';

import { hexToOklch, hueRamp, rampColorAt } from '@domain/oklch';
import { Colors, SectionColors } from '@theme/colors';

/**
 * Hue-only color picker for a section.
 *
 * Two ways in, because they answer different questions. The preset row is "give me a
 * color that is obviously different from the others" — eight hand-spaced hues, one tap.
 * The ramp below is "I want *that* one", and sweeps the full circle.
 *
 * There is no saturation or lightness control and no alpha, and that is the point. The
 * label draws black text on this color, so lightness is not a free parameter; the ramp
 * holds it fixed (see `domain/oklch.ts`), which makes every reachable color legible by
 * construction rather than by validation. Alpha is meaningless against the score's
 * white page, so it is not offered.
 *
 * Built from react-native-svg and PanResponder rather than a picker library: every
 * mainstream one needs react-native-gesture-handler, which this app does not install,
 * and a hue strip is not worth a native dependency and an EAS rebuild.
 */

/** Enough steps that the strip reads as continuous under a finger, few enough to stay cheap. */
const RAMP_STEPS = 60;
const RAMP_HEIGHT = 36;
const SWATCH = 32;
const THUMB_WIDTH = 10;

export function SectionColorPicker({
  color,
  onPick,
}: {
  color: string;
  onPick: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const ramp = useMemo(() => hueRamp(RAMP_STEPS), []);
  const [width, setWidth] = useState(0);

  function emit(x: number) {
    if (width <= 0) return;
    onPick(rampColorAt(x / width));
  }

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const normalised = color.toUpperCase();
  // Where the current color sits on the ramp. Presets are not exactly on the ramp — they
  // are hand-tuned and sit at slightly different lightnesses — but their hue is still
  // the right place to point at, so the thumb tracks a preset choice too.
  const thumbPercent = ((hexToOklch(color)?.h ?? 0) / 360) * 100;

  return (
    <View className="gap-3 pt-1">
      <View className="gap-1">
        <Text className="text-[12px] text-ash-grey-500">{t('pieceEdit.sections.presets')}</Text>
        <View className="flex-row flex-wrap gap-2">
          {SectionColors.map((preset) => {
            const selected = preset.toUpperCase() === normalised;
            return (
              <Pressable
                key={preset}
                onPress={() => onPick(preset)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={preset}
                style={{
                  width: SWATCH,
                  height: SWATCH,
                  borderRadius: SWATCH / 2,
                  backgroundColor: preset,
                  // Selection reads as a ring rather than a border so the swatch does
                  // not change size and shuffle the row when the choice moves. Dark, not
                  // white: the presets are light enough that a white ring vanishes.
                  borderWidth: selected ? 3 : 0,
                  borderColor: Colors.text,
                  outlineWidth: selected ? 2 : 0,
                }}
              />
            );
          })}
        </View>
      </View>

      <View className="gap-1">
        <Text className="text-[12px] text-ash-grey-500">{t('pieceEdit.sections.hueRamp')}</Text>
        <View
          onLayout={onLayout}
          // The View's own responder props rather than PanResponder: these are plain
          // JSX props, so they always see the current onPick with no latest-value ref.
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          // Hold the gesture so the enclosing ScrollView cannot steal a horizontal drag.
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => emit(e.nativeEvent.locationX)}
          onResponderMove={(e) => emit(e.nativeEvent.locationX)}
          accessibilityRole="adjustable"
          accessibilityLabel={t('pieceEdit.sections.hueRamp')}
          className="overflow-hidden rounded-lg border border-ash-grey-500/35"
          style={{ height: RAMP_HEIGHT }}
        >
          <Svg width="100%" height={RAMP_HEIGHT} preserveAspectRatio="none" viewBox="0 0 100 1">
            {ramp.map((hex, i) => (
              // Discrete rects, not a LinearGradient: gradients interpolate in sRGB, and
              // the sRGB midpoint of two constant-lightness colors is not at that
              // lightness. Stepping keeps the contrast guarantee true of every pixel.
              <Rect
                key={hex + i}
                x={(i * 100) / RAMP_STEPS}
                y={0}
                // Overdraw slightly so rounding cannot leave hairlines between steps.
                width={100 / RAMP_STEPS + 0.15}
                height={1}
                fill={hex}
              />
            ))}
          </Svg>
          {/* Position indicator. Without it the strip shows what is available but not
              what is chosen, so the user has no way to tell where they are on it.
              Dark core inside a white ring so it stays visible over every hue. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${thumbPercent}%`,
              width: THUMB_WIDTH,
              marginLeft: -THUMB_WIDTH / 2,
              borderRadius: THUMB_WIDTH / 2,
              borderWidth: 2,
              borderColor: '#FFFFFF',
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          />
        </View>
      </View>
    </View>
  );
}
