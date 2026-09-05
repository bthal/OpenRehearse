import { Path, Svg } from 'react-native-svg';

interface AppIconProps {
  /** MDI path data string from @mdi/js (e.g. mdiMusicNote) */
  path: string;
  size?: number;
  color?: string;
  /**
   * Mirror the icon. `'vertical'` flips it about the vertical axis (left ↔ right),
   * `'horizontal'` about the horizontal one (top ↔ bottom).
   */
  flip?: 'vertical' | 'horizontal';
}

/** Renders a Material Design Icon using react-native-svg. All MDI icons share viewBox "0 0 24 24". */
export function AppIcon({ path, size = 24, color = '#000000', flip }: AppIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={
        flip === 'vertical'
          ? { transform: [{ scaleX: -1 }] }
          : flip === 'horizontal'
            ? { transform: [{ scaleY: -1 }] }
            : undefined
      }
    >
      <Path d={path} />
    </Svg>
  );
}
