import { Circle, G, Path, Svg } from 'react-native-svg';

import { BrandColors } from '@theme/colors';

/**
 * The piano octave, printed as a negative: white is the ink and the navy ground
 * reads through where the white keys would be.
 *
 * This is a hand-port of `assets/brand/mark-circle.svg` — the SVG file cannot be
 * imported directly, because the app has no SVG transformer configured and adding
 * one to move a single asset is not worth the build surface. The path data and the
 * placement transform below are copied verbatim from that file and must stay in
 * step with it; `scripts/brand/gen_marks.py` is the source of both.
 *
 * The piano sits at 0.55 of the circle's diameter. That is a measured choice, not a
 * taste one: a square inscribed in a circle tops out at 1/sqrt(2) of the diameter,
 * so anything above ~0.60 crowds the arc. See `specs/brand.md`.
 */
const PIANO_PATH =
  'M60,0H4C1.789,0,0,1.789,0,4v56c0,2.211,1.789,4,4,4h56c2.211,0,4-1.789,4-4V4C64,1.789,62.211,0,60,0z ' +
  'M15,62H4c-1.104,0-2-0.896-2-2V4c0-1.104,0.641-2,2-2h7v39c0,0.553,0.447,1,1,1h3V62z ' +
  'M31,62H17V42h3c0.553,0,1-0.447,1-1V2h6v39c0,0.553,0.447,1,1,1h3V62z ' +
  'M47,62H33V42h3c0.553,0,1-0.447,1-1V2h6v39c0,0.553,0.447,1,1,1h3V62z ' +
  'M62,60c0,1.104-0.896,2-2,2H49V42h3c0.553,0,1-0.447,1-1V2h7c1.016,0,2,0.896,2,2V60z';

/** Places the 64-unit reference path at 0.55 scale, centred in the 512 viewBox. */
const PIANO_TRANSFORM = 'translate(115.2,115.2) scale(4.4)';

interface BrandMarkProps {
  /** Rendered width and height in px. The mark is square. */
  size?: number;
}

/**
 * The circle logo. Decorative by default: every place it appears, the word
 * "OpenRehearse" is already next to it, so announcing the mark too would read the
 * app's name twice to a screen reader.
 */
export function BrandMark({ size = 60 }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessibilityElementsHidden>
      <Circle cx={256} cy={256} r={256} fill={BrandColors.navy} />
      <G transform={PIANO_TRANSFORM}>
        <Path d={PIANO_PATH} fill={BrandColors.ink} />
      </G>
    </Svg>
  );
}
