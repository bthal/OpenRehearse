import { Path, Svg } from 'react-native-svg';

interface AppIconProps {
  /** MDI path data string from @mdi/js (e.g. mdiMusicNote) */
  path: string;
  size?: number;
  color?: string;
}

/** Renders a Material Design Icon using react-native-svg. All MDI icons share viewBox "0 0 24 24". */
export function AppIcon({ path, size = 24, color = '#000000' }: AppIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={path} />
    </Svg>
  );
}
