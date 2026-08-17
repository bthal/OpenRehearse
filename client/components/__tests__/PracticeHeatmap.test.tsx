import { fireEvent, render, screen } from '@testing-library/react-native';
import { subDays } from 'date-fns';
import { Dimensions, processColor, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import i18n from '../../src/i18n';
import { practiceDayKey } from '@domain/practiceTime';
import { usePracticeStore } from '@state/practiceStore';
import { Colors, HeatmapColors } from '@theme/colors';
import {
  cellOffset,
  heatmapWindow,
  practiceDayCaption,
  PracticeHeatmap,
  weeksThatFit,
} from '../PracticeHeatmap';

/**
 * The heatmap resets its selected day whenever the dashboard regains focus,
 * which means a real navigation tree. Standing one up would test expo-router
 * rather than the grid, so focus is stubbed as "fires once on mount" — which is
 * what focusing a freshly rendered screen does anyway.
 */
jest.mock('expo-router', () => ({
  // jest.mock factories are hoisted above the imports, so React cannot be
  // referenced from module scope and has to be pulled in right here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

/** Real translations, in the shape the caption helper expects. */
const t = (key: string, opts?: Record<string, unknown>): string => i18n.t(key, opts);

/**
 * The selection ring's position, found by the one style no other node carries.
 * It is an ordinary `View` layered over the grid — the library has no
 * selected-cell prop, so there is nothing in the SVG to assert against.
 */
function ringOffset(): { left: number; top: number } | null {
  const tree = screen.toJSON() as RenderedNode | null;
  const ring = findByType(tree, 'View').find(
    (node) =>
      (StyleSheet.flatten(node.props?.style as StyleProp<ViewStyle>) ?? {}).borderColor ===
      Colors.text,
  );
  if (!ring) return null;
  const { left, top } = StyleSheet.flatten(ring.props?.style as StyleProp<ViewStyle>);
  return { left: left as number, top: top as number };
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

describe('practiceDayCaption', () => {
  const TODAY = '2026-08-15';
  const EARLIER = '2026-08-08';

  it('names today instead of making the reader decode the date', () => {
    expect(practiceDayCaption(t, TODAY, 42 * 60, TODAY)).toBe('Today, 15 Aug · 42 min');
  });

  it('spells out the weekday for any other day', () => {
    expect(practiceDayCaption(t, EARLIER, 42 * 60, TODAY)).toBe('Sat, 8 Aug · 42 min');
  });

  it('tells an untouched day apart from one with seconds on it', () => {
    // Both render an empty-looking cell, so only the caption can separate them.
    expect(practiceDayCaption(t, EARLIER, 0, TODAY)).toBe('Sat, 8 Aug · no practice');
    expect(practiceDayCaption(t, EARLIER, 20, TODAY)).toBe('Sat, 8 Aug · under a minute');
  });

  it('drops the empty minutes from an exact hour', () => {
    expect(practiceDayCaption(t, EARLIER, 90 * 60, TODAY)).toBe('Sat, 8 Aug · 1 h 30 min');
    expect(practiceDayCaption(t, EARLIER, 120 * 60, TODAY)).toBe('Sat, 8 Aug · 2 h');
  });
});

describe('cellOffset', () => {
  // Windows always start on a Monday; this one is 3 August 2026.
  const start = new Date('2026-08-03T00:00:00');
  /** One cell plus its gap, taken from the grid rather than restated here. */
  const step = cellOffset('2026-08-10', start).x;

  it('gives each week its own column, in order', () => {
    expect(cellOffset('2026-08-03', start).x).toBe(0);
    expect(cellOffset('2026-08-09', start).x).toBe(0); // still week one: Sunday ends it
    expect(cellOffset('2026-08-10', start).x).toBe(step);
  });

  it('rows days by raw weekday, Sunday first, whatever the week starts on', () => {
    // The library honours `weekStartsOn` when grouping columns but ignores it
    // for rows, so a Monday-started week runs Sunday-first down the column.
    expect(cellOffset('2026-08-09', start).y).toBe(0); // Sunday
    expect(cellOffset('2026-08-03', start).y).toBe(step); // Monday
    expect(cellOffset('2026-08-08', start).y).toBe(6 * step); // Saturday
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

    expect(screen.getByText('Stats')).toBeTruthy();
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

    it('keeps the month header the height the ring first guesses at', () => {
      // The ring's vertical origin is measured on layout, but until the first
      // pass it uses the header's line height plus its bottom space. Keeping
      // that guess honest is what stops the ring flinching into place.
      const tree = render(<PracticeHeatmap />).toJSON() as RenderedNode | null;
      const header = findByType(tree, 'View').find(
        (node) =>
          (StyleSheet.flatten(node.props?.style as StyleProp<ViewStyle>) ?? {}).marginBottom !==
          undefined,
      );
      const label = findByType(header ?? null, 'Text')[0];

      const { marginBottom } = StyleSheet.flatten(header?.props?.style as StyleProp<ViewStyle>);
      const { lineHeight } = StyleSheet.flatten(
        label?.props?.style as StyleProp<{ lineHeight: number }>,
      );

      expect(lineHeight).toBe(10);
      expect(marginBottom).toBe(4);
    });
  });

  describe('streaks', () => {
    it('leads with the current and longest runs', () => {
      const days = {
        // A three-day run ending today, and a five-day run back in July.
        '2026-07-01': 60,
        '2026-07-02': 60,
        '2026-07-03': 60,
        '2026-07-04': 60,
        '2026-07-05': 60,
        [practiceDayKey(subDays(new Date(), 2).getTime())]: 60,
        [practiceDayKey(subDays(new Date(), 1).getTime())]: 60,
        [todayKey()]: 60,
      };
      usePracticeStore.setState({ dailySeconds: days });

      render(<PracticeHeatmap />);

      expect(screen.getByText('Current streak')).toBeTruthy();
      expect(screen.getByText('Longest streak')).toBeTruthy();
      expect(screen.getByText('3 days')).toBeTruthy();
      expect(screen.getByText('5 days')).toBeTruthy();
    });

    it('shows zeroes rather than blanks before anything is practised', () => {
      usePracticeStore.setState({ dailySeconds: {} });

      render(<PracticeHeatmap />);

      expect(screen.getAllByText('0 days')).toHaveLength(2);
    });
  });

  describe('day selection', () => {
    /** A day comfortably inside the window, whatever weekday today happens to be. */
    const earlier = () => practiceDayKey(subDays(new Date(), 8).getTime());

    /**
     * Taps the grid where `day`'s cell is drawn.
     *
     * The library hit-tests by coordinate against a single `Pressable` wrapping
     * the SVG — nothing per cell — so a press has to carry the point itself.
     * That also makes this a check on `cellOffset`: the library resolves the
     * point through its own layout maths, so a formula that disagreed would
     * select a different day and the caption would name it.
     */
    function pressDay(day: string): void {
      const { startDate } = heatmapWindow(
        practiceDayKey(Date.now()),
        Dimensions.get('window').width,
      );
      const { x, y } = cellOffset(day, startDate);
      // Pressing the SVG itself: the library's Pressable wraps it, and the press
      // travels up to that handler.
      const [svg] = screen.UNSAFE_root.findAll(
        (node: { type: unknown }) => node.type === 'RNSVGSvgView',
      );
      fireEvent.press(svg, {
        // A point inside the cell rather than on its edge, which two cells share.
        nativeEvent: { locationX: x + 1, locationY: y + 1 },
      });
    }

    it('starts on today, so the caption always says something', () => {
      usePracticeStore.setState({ dailySeconds: { [todayKey()]: 42 * 60 } });

      render(<PracticeHeatmap />);

      expect(screen.getByText(practiceDayCaption(t, todayKey(), 42 * 60, todayKey()))).toBeTruthy();
    });

    it('describes the day whose cell was tapped', () => {
      const day = earlier();
      usePracticeStore.setState({ dailySeconds: { [todayKey()]: 42 * 60, [day]: 70 * 60 } });
      render(<PracticeHeatmap />);

      pressDay(day);

      expect(screen.getByText(practiceDayCaption(t, day, 70 * 60, todayKey()))).toBeTruthy();
    });

    it('reports a tapped day the grid left out for rounding to nothing', () => {
      // Sub-minute days are omitted from the grid, so this cell renders empty —
      // the caption is the only place the seconds can surface.
      const day = earlier();
      usePracticeStore.setState({ dailySeconds: { [day]: 20 } });
      render(<PracticeHeatmap />);

      pressDay(day);

      expect(screen.getByText(/under a minute/)).toBeTruthy();
    });

    it('moves the ring by exactly the distance between the two cells', () => {
      // The ring is the only thing marking the selection, so it has to track the
      // cell exactly: an offset that drifted would frame the wrong day.
      const day = earlier();
      usePracticeStore.setState({ dailySeconds: {} });
      const { startDate } = heatmapWindow(todayKey(), Dimensions.get('window').width);
      render(<PracticeHeatmap />);

      const before = ringOffset();
      pressDay(day);
      const after = ringOffset();

      expect(before).not.toBeNull();
      expect(after!.left - before!.left).toBe(
        cellOffset(day, startDate).x - cellOffset(todayKey(), startDate).x,
      );
      expect(after!.top - before!.top).toBe(
        cellOffset(day, startDate).y - cellOffset(todayKey(), startDate).y,
      );
    });
  });
});
