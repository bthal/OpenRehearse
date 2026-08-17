import { mdiPlay } from '@mdi/js';
import { View } from 'react-native';

import { AppIcon } from './AppIcon';

interface CenterPlayButtonProps {
  /** False before the score has rendered: there is nothing to offer to play yet. */
  ready: boolean;
  /** True while the transport is running. */
  playing: boolean;
  /** True while the score is panned, coasting, gliding, or dragged by a loop handle. */
  scoreMoving: boolean;
}

const DISC = 76;

/**
 * The play affordance, sitting on the cursor in the middle of the screen.
 *
 * Decorative, not a button: `pointerEvents` is off, and the tap that starts playback is
 * the WebView's own tap-on-the-score handler underneath. That is deliberate — the
 * cursor is also where the score is dragged from, and a real button here would swallow
 * every pan that happened to start at the centre of the screen.
 *
 * It shows only when the score is at rest. Offering to play from a score that is still
 * coasting would be offering a position the user has not chosen yet, and the disc
 * sliding over moving notation reads as a bug. Playing hides it entirely, like a video
 * player: tap anywhere to pause and it comes back.
 *
 * Appears and disappears outright, with no fade. It answers a tap, or the moment a
 * glide lands, and either way a fade would put the button visibly behind the thing it
 * is responding to.
 */
export function CenterPlayButton({ ready, playing, scoreMoving }: CenterPlayButtonProps) {
  if (!ready || playing || scoreMoving) return null;

  return (
    <View
      // Never intercepts: every gesture here belongs to the score underneath.
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        // Android needs elevation as well as zIndex to lift a sibling above a native
        // WebView — the same constraint the section label runs into.
        elevation: 5,
      }}
    >
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          alignItems: 'center',
          justifyContent: 'center',
          // Translucent rather than solid, so the notes it covers stay readable and it
          // reads as an overlay on the score rather than a hole punched in it.
          backgroundColor: 'rgba(0, 0, 0, 0.38)',
        }}
      >
        {/* Nudged right: a triangle's visual centre sits left of its bounding box. */}
        <View style={{ marginLeft: 3 }}>
          <AppIcon path={mdiPlay} size={44} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}
