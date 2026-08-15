import { render, screen } from '@testing-library/react-native';
import { processColor } from 'react-native';

import '../../src/i18n';
import { usePracticeStore } from '@state/practiceStore';
import { HeatmapColors } from '@theme/colors';
import { PracticeHeatmap, weeksThatFit } from '../PracticeHeatmap';

/**
 * The heatmap resets its selected day whenever the dashboard regains focus,
 * which means a real navigation tree. Standing one up would test expo-router
 * rather than the grid, so focus is stubbed as "fires once on mount" — which is
 * what focusing a freshly rendered screen does anyway.
 */
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

/**
 * The slice of the rendered tree these tests walk. Declared locally because
 * react-test-renderer ships no types.
 */
interface RenderedNode {
  type?: string;
  props?: { fill?: { payload?: unknown } };
  children?: (RenderedNode | string)[] | null;
}

/**
 * Fills of the rendered grid cells. react-native-svg turns a colour string into
 * `{ type, payload }` with an ARGB payload, so colours are compared as the ints
 * `processColor` produces rather than as CSS strings.
 */
function cellFills(node: RenderedNode | RenderedNode[] | null): number[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap(cellFills);
  const fill = node.props?.fill;
  const own = node.type === 'RNSVGRect' && typeof fill?.payload === 'number' ? [fill.payload] : [];
  const children = (node.children ?? []).filter(
    (child): child is RenderedNode => typeof child === 'object' && child !== null,
  );
  return [...own, ...children.flatMap(cellFills)];
}

/** Renders the heatmap and returns its cell fills as ARGB ints. */
function renderCellFills(): number[] {
  return cellFills(render(<PracticeHeatmap />).toJSON() as RenderedNode | null);
}

const asFill = (color: string): number => processColor(color) as number;

describe('weeksThatFit', () => {
  it('fits more weeks as the width grows', () => {
    expect(weeksThatFit(312)).toBeLessThan(weeksThatFit(672));
  });

  it('clamps to a usable range on very narrow and very wide screens', () => {
    expect(weeksThatFit(40)).toBe(8); // minimum
    expect(weeksThatFit(5000)).toBe(53); // one year maximum
  });
});

describe('PracticeHeatmap', () => {
  /** Today's key in the same local-day format the tracker writes. */
  function todayKey(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }

  it('renders the practice grid with tracked data', () => {
    usePracticeStore.setState({ dailySeconds: { [todayKey()]: 30 * 60 } });

    render(<PracticeHeatmap />);

    expect(screen.getByText('Practice')).toBeTruthy();
    expect(screen.getByText('Less')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('colours cells from the app theme, by practice intensity', () => {
    // 30 minutes today sits in the third ramp step (thresholds 1/10/25/45 min).
    usePracticeStore.setState({ dailySeconds: { [todayKey()]: 30 * 60 } });

    const fills = renderCellFills();
    const themeFills = [HeatmapColors.empty, ...HeatmapColors.ramp].map(asFill);

    expect(fills).toContain(asFill(HeatmapColors.ramp[2]));
    expect(fills).toContain(asFill(HeatmapColors.empty)); // untouched days
    // No stray library defaults.
    expect(fills.every((f) => themeFills.includes(f))).toBe(true);
  });

  it('leaves every cell empty when nothing has been practised', () => {
    usePracticeStore.setState({ dailySeconds: {} });

    const fills = renderCellFills();

    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set([asFill(HeatmapColors.empty)]));
  });
});
