import { WeeklyHeatMap } from '@symbiot.dev/react-native-heatmap';
import {
  addDays,
  differenceInCalendarWeeks,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type LayoutChangeEvent, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { practiceDayDuration, practiceDayKey, practiceStreaks } from '@domain/practiceTime';
import { usePracticeStore } from '@state/practiceStore';
import { Colors, HeatmapColors } from '@theme/colors';

/**
 * The dashboard's Stats section: two streak figures over a
 * GitHub-contributions-style grid of daily practice time, one cell per day.
 *
 * The visible window is sized to the screen so the grid never needs horizontal
 * scrolling inside the dashboard's vertical scroll view: we fit as many trailing
 * weeks as the available width allows and start on a week boundary.
 *
 * One day is always selected — today unless the user taps another — and its date
 * and total are spelled out beside the legend, since a colour band alone can't
 * say which day a cell is or how long it was.
 */

/** Monday-first weeks, matching how practice weeks are usually planned. */
const WEEK_STARTS_ON = 1;
/** Big enough to hit: the library hit-tests by coordinate, with no slop. */
const CELL_SIZE = 16;
const CELL_GAP = 3;
const CELL_RADIUS = 3;
const ADJUSTED_CELL = CELL_SIZE + CELL_GAP;
/** Days per column — the library always lays out a full Sunday–Saturday week. */
const DAYS_PER_WEEK = 7;
const HEADER_TEXT_FONT_SIZE = 10;
const HEADER_BOTTOM_SPACE = 4;
/**
 * Starting guess at how far the month labels push the grid down, used until the
 * first layout pass measures the real value. It is only a guess because the
 * label's line box is not its rendered height — Android adds font padding — so
 * the ring corrects itself once `onLayout` reports the truth.
 */
const ESTIMATED_HEADER_HEIGHT = HEADER_TEXT_FONT_SIZE + HEADER_BOTTOM_SPACE;
/** Thickness of the ring drawn around the selected day. */
const RING_WIDTH = 2;
/** Legend swatches are their own size: cells are now too big to mirror. */
const LEGEND_SWATCH = 12;
/** Dashboard content padding (`px-6`) plus the max content width it centres in. */
const CONTENT_PADDING = 24 * 2;
const MAX_CONTENT_WIDTH = 720;
const MIN_WEEKS = 8;
const MAX_WEEKS = 53;

/**
 * Practice minutes at which each ramp colour takes over. The library resolves a
 * cell's colour to the highest threshold that is ≤ its count, so a day with no
 * practice (0) matches nothing and falls back to the empty colour.
 */
const LEVEL_MINUTES = [1, 10, 25, 45] as const;

/**
 * How many trailing weeks of grid fit in `availableWidth`.
 *
 * Each week column occupies a cell plus the gap that follows it, except the
 * last: the library draws the grid one gap narrower than it reserves, so `n`
 * weeks paint `n * (CELL_SIZE + CELL_GAP) - CELL_GAP` wide.
 */
export function weeksThatFit(availableWidth: number): number {
  const weeks = Math.floor((availableWidth + CELL_GAP) / ADJUSTED_CELL);
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeks));
}

/**
 * The span of days the grid covers on a screen `windowWidth` wide: as many
 * trailing weeks as fit, starting on a week boundary and ending today.
 */
export function heatmapWindow(
  todayKey: string,
  windowWidth: number,
): { startDate: Date; endDate: Date } {
  const weeks = weeksThatFit(Math.min(windowWidth, MAX_CONTENT_WIDTH) - CONTENT_PADDING);
  // Explicit local midnight — a bare `YYYY-MM-DD` would parse as UTC.
  const today = new Date(`${todayKey}T00:00:00`);
  return {
    startDate: startOfWeek(subDays(today, (weeks - 1) * 7), { weekStartsOn: WEEK_STARTS_ON }),
    endDate: today,
  };
}

/**
 * Where the library draws `day`'s cell, relative to the grid's top-left corner
 * — the month labels above it excluded, which callers add separately.
 *
 * This mirrors the library's own layout maths, which it does not expose: there
 * is no selected-cell prop and no per-cell stroke, so the only way to mark a day
 * is to position our own ring over it. Note the row is the *raw* weekday index
 * with Sunday at 0 — the library ignores `weekStartsOn` when laying out rows,
 * even though it honours it when grouping columns.
 */
export function cellOffset(day: string, startDate: Date): { x: number; y: number } {
  // Explicit local midnight — a bare `YYYY-MM-DD` would parse as UTC.
  const date = new Date(`${day}T00:00:00`);
  return {
    x: differenceInCalendarWeeks(date, startDate, { weekStartsOn: WEEK_STARTS_ON }) * ADJUSTED_CELL,
    y: date.getDay() * ADJUSTED_CELL,
  };
}

/** Minimal shape of `t` for helpers that live outside the component. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** The caption beside the legend: which day is selected, and how long it was. */
export function practiceDayCaption(t: TFn, day: string, seconds: number, todayKey: string): string {
  const date = new Date(`${day}T00:00:00`);
  // Today is the default selection, so naming it beats making the reader parse
  // a date to work out they are looking at the current day. No year on the
  // others: the grid never spans more than one, and the caption shares a row
  // with the legend, where a longer date would wrap.
  const label =
    day === todayKey
      ? t('dashboard.practiceDayToday', { date: format(date, 'd MMM') })
      : format(date, 'EEE, d MMM');

  const duration = practiceDayDuration(seconds);
  switch (duration.kind) {
    case 'none':
      return t('dashboard.practiceDayNone', { date: label });
    case 'underMinute':
      return t('dashboard.practiceDayUnderMinute', { date: label });
    case 'minutes':
      return t('dashboard.practiceDayMinutes', { date: label, count: duration.minutes });
    case 'hours':
      return duration.minutes === 0
        ? t('dashboard.practiceDayHoursOnly', { date: label, hours: duration.hours })
        : t('dashboard.practiceDayHours', {
            date: label,
            hours: duration.hours,
            minutes: duration.minutes,
          });
  }
}

const cellColor: Record<number, string> = Object.fromEntries(
  LEVEL_MINUTES.map((minutes, i) => [minutes, HeatmapColors.ramp[i] ?? HeatmapColors.empty]),
);

/**
 * Today's local day key, re-read at each local midnight.
 *
 * The dashboard is the root route and stays mounted, so a window pinned to the
 * day of first render would leave practice recorded after midnight with no cell
 * to land in — silently undoing the tracker's midnight split.
 */
function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => practiceDayKey(Date.now()));

  useEffect(() => {
    const now = Date.now();
    // A second past midnight, so a slightly early timer still reads the new day.
    const untilTomorrow = addDays(startOfDay(now), 1).getTime() - now + 1000;
    const timer = setTimeout(() => setTodayKey(practiceDayKey(Date.now())), untilTomorrow);
    return () => clearTimeout(timer);
  }, [todayKey]);

  return todayKey;
}

export function PracticeHeatmap() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const dailySeconds = usePracticeStore((s) => s.dailySeconds);

  const todayKey = useTodayKey();

  // A pick is remembered with the day it was made on, which lets the midnight
  // rollover expire it by derivation instead of by an effect: once `todayKey`
  // moves on, a selection made against the old one stops applying and the
  // caption falls back to the new today.
  const [pick, setPick] = useState<{ day: string; asOf: string } | null>(null);
  const selectedDay = pick?.asOf === todayKey ? pick.day : todayKey;

  // The selection is deliberately not durable: coming back to the dashboard
  // should always answer "how much have I played today?", not resume whatever
  // day was being inspected earlier. The dashboard is the root route and never
  // unmounts, so neither returning from a piece nor resuming the app remounts
  // this component — both need clearing by hand.
  const selectToday = useCallback(() => setPick(null), []);

  useFocusEffect(selectToday);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') selectToday();
    });
    return () => subscription.remove();
  }, [selectToday]);

  const { startDate, endDate } = useMemo(() => heatmapWindow(todayKey, width), [todayKey, width]);

  // Cell counts are whole minutes: minutes read naturally in the legend and keep
  // the level thresholds meaningful. Keys carry an explicit local midnight —
  // a bare `YYYY-MM-DD` would be parsed as UTC and land on the wrong day for
  // anyone west of UTC.
  const data = useMemo(() => {
    const firstKey = practiceDayKey(startDate.getTime());
    const counts: Record<string, number> = {};
    for (const [day, seconds] of Object.entries(dailySeconds)) {
      if (day < firstKey) continue; // outside the window; skip the per-cell scan
      const minutes = Math.round(seconds / 60);
      if (minutes > 0) counts[`${day}T00:00:00`] = minutes;
    }
    return counts;
  }, [dailySeconds, startDate]);

  const lastColumnX =
    differenceInCalendarWeeks(endDate, startDate, { weekStartsOn: WEEK_STARTS_ON }) * ADJUSTED_CELL;

  /**
   * Where the grid's top-left corner sits inside the wrapper.
   *
   * Measured rather than assumed. The horizontal origin is 0 by construction
   * (the wrapper hugs the grid and the library's indent is overridden away),
   * but the vertical one is whatever the month labels actually occupy, which
   * differs by platform: Android's font padding makes the header taller than
   * its line height, which would leave the ring a couple of pixels high.
   */
  const [headerHeight, setHeaderHeight] = useState(ESTIMATED_HEADER_HEIGHT);
  const measureGridOrigin = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    // Everything below the labels is the grid itself, and its height is known.
    const gridHeight = DAYS_PER_WEEK * ADJUSTED_CELL - CELL_GAP;
    setHeaderHeight(Math.max(0, nativeEvent.layout.height - gridHeight));
  }, []);

  const ring = useMemo(() => {
    const { x, y } = cellOffset(selectedDay, startDate);
    // A selection can only fall outside the window if the grid shrank under it.
    if (x < 0 || x > lastColumnX) return null;
    return { left: x - RING_WIDTH, top: headerHeight + y - RING_WIDTH };
  }, [selectedDay, startDate, lastColumnX, headerHeight]);

  const streaks = useMemo(() => practiceStreaks(dailySeconds, todayKey), [dailySeconds, todayKey]);

  return (
    <View className="mt-8">
      <Text className="text-[22px] font-bold text-ash-grey-950">{t('dashboard.stats')}</Text>

      {/* Headline numbers: the streaks are the reason to come back to this section. */}
      <View className="mb-5 mt-3 flex-row justify-center gap-12">
        <View className="items-center">
          <Text className="text-[28px] font-bold leading-[32px] text-seagrass-600">
            {streaks.current}
          </Text>
          <Text className="text-xs text-ash-grey-950">{t('dashboard.currentStreak')}</Text>
        </View>
        <View className="items-center">
          <Text className="text-[28px] font-bold leading-[32px] text-seagrass-600">
            {streaks.longest}
          </Text>
          <Text className="text-xs text-ash-grey-950">{t('dashboard.longestStreak')}</Text>
        </View>
      </View>

      {/*
        `items-start` stops the library's own container — a centring flex row —
        from stretching to the section width and floating the grid in the
        leftover space; it hugs the grid instead, so the cells start at the
        section's left edge like the heading above them. That also fixes the
        grid's origin, which is what lets the selection ring be positioned
        against it.
      */}
      <View className="items-start" onLayout={measureGridOrigin}>
        <WeeklyHeatMap
          data={data}
          startDate={startDate}
          endDate={endDate}
          weekStartsOn={WEEK_STARTS_ON}
          cellSize={CELL_SIZE}
          cellGap={CELL_GAP}
          cellRadius={CELL_RADIUS}
          scrollable={false}
          pressable
          onCellPress={({ date }) =>
            setPick({ day: practiceDayKey(date.getTime()), asOf: todayKey })
          }
          // The library insets its content by 8px but caps the surrounding
          // viewport at the bare grid width, so that inset overflows and — with
          // scrolling off — clips the trailing week. Drop it.
          scrollStyle={{ paddingLeft: 0 }}
          theme={{
            // Light mode only (see the non-negotiables) — pin the scheme so a
            // device in dark mode still gets the app's own palette.
            scheme: 'light',
            cellDefaultColor: HeatmapColors.empty,
            cellColor,
            headerTextColor: HeatmapColors.headerText,
          }}
          headerTextFontSize={HEADER_TEXT_FONT_SIZE}
          headerBottomSpace={HEADER_BOTTOM_SPACE}
        />

        {ring && (
          // Must not take touches: the library hit-tests taps by coordinate on a
          // single Pressable covering the whole grid, so a ring that swallowed
          // them would make the selected day the one cell you cannot re-select.
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: ring.left,
              top: ring.top,
              width: CELL_SIZE + RING_WIDTH * 2,
              height: CELL_SIZE + RING_WIDTH * 2,
              borderWidth: RING_WIDTH,
              borderRadius: CELL_RADIUS + RING_WIDTH,
              // Drawn in the gap around the cell rather than over it, so the
              // day keeps its own colour and the ring keeps its contrast
              // against the page whatever that colour is.
              borderColor: Colors.text,
            }}
          />
        )}
      </View>

      {/* Legend on the left, the selected day's total on the right. */}
      <View className="mt-2 flex-row items-center">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[10px] text-ash-grey-400">{t('dashboard.practiceLess')}</Text>
          <View
            className="rounded-[3px]"
            style={{
              width: LEGEND_SWATCH,
              height: LEGEND_SWATCH,
              backgroundColor: HeatmapColors.empty,
            }}
          />
          {HeatmapColors.ramp.map((color) => (
            <View
              key={color}
              className="rounded-[3px]"
              style={{ width: LEGEND_SWATCH, height: LEGEND_SWATCH, backgroundColor: color }}
            />
          ))}
          <Text className="text-[10px] text-ash-grey-400">{t('dashboard.practiceMore')}</Text>
        </View>

        {/* Takes the rest of the row so a long date can wrap rather than clip. */}
        <Text className="flex-1 text-right text-sm font-bold text-ash-grey-950">
          {practiceDayCaption(t, selectedDay, dailySeconds[selectedDay] ?? 0, todayKey)}
        </Text>
      </View>
    </View>
  );
}
