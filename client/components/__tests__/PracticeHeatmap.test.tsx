import { render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

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
  props?: {
    fill?: { payload?: unknown };
    width?: number;
    style?: unknown;
    contentContainerStyle?: unknown;
  };
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

/**
 * The grid's own geometry, read off the library's internal scroll view.
 *
 * `WeeklyHeatMap` paints into a non-scrolling horizontal `ScrollView`: the
 * viewport is capped at `maxWidth`, the cells live in an `Svg` inside the
 * content container, and the content container carries the left inset. Anything
 * wider than the viewport is silently clipped, so these three numbers are what
 * decide whether the last week is whole.
 */
function gridGeometry(): { viewport: number; leftInset: number; content: number } {
  const tree = render(<PracticeHeatmap />).toJSON() as RenderedNode | null;

  const scroll = onlyNode(tree, 'RCTScrollView');
  const svg = onlyNode(tree, 'RNSVGSvgView');
  const viewport = (scroll.props?.style as { maxWidth: number }).maxWidth;
  const leftInset = StyleSheet.flatten(scroll.props?.contentContainerStyle as StyleProp<ViewStyle>)
    .paddingLeft as number;

  return { viewport, leftInset, content: leftInset + (svg.props?.width as number) };
}

/** The single node of `type` in the tree; the grid renders exactly one of each. */
function onlyNode(tree: RenderedNode | null, type: string): RenderedNode {
  const [node, ...rest] = findByType(tree, type);
  if (!node || rest.length)
    throw new Error(`expected exactly one <${type}>, got ${rest.length + 1}`);
  return node;
}

function findByType(
  node: RenderedNode | RenderedNode[] | null,
  type: string,
  acc: RenderedNode[] = [],
): RenderedNode[] {
  if (node === null) return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => findByType(n, type, acc));
    return acc;
  }
  if (node.type === type) acc.push(node);
  (node.children ?? [])
    .filter((child): child is RenderedNode => typeof child === 'object' && child !== null)
    .forEach((child) => findByType(child, type, acc));
  return acc;
}

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

  /**
   * The grid is not scrollable, so anything the library lays out beyond its own
   * viewport is lost rather than reachable. Its default 8px content inset sits
   * outside that viewport cap, which clipped the trailing week and pushed the
   * grid out of line with the heading above it.
   */
  describe('layout', () => {
    it('fits the whole grid inside the viewport, so no week is clipped', () => {
      const { content, viewport } = gridGeometry();

      expect(content).toBeLessThanOrEqual(viewport);
    });

    it('starts the grid flush left, in line with the rest of the section', () => {
      expect(gridGeometry().leftInset).toBe(0);
    });
  });
});
