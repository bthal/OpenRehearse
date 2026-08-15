import { WeeklyHeatMap } from '@symbiot.dev/react-native-heatmap';
import { addDays, startOfDay, startOfWeek, subDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { practiceDayKey } from '@domain/practiceTime';
import { usePracticeStore } from '@state/practiceStore';
import { HeatmapColors } from '@theme/colors';

/**
 * GitHub-contributions-style grid of daily practice time, one cell per day.
 *
 * The visible window is sized to the screen so the grid never needs horizontal
 * scrolling inside the dashboard's vertical scroll view: we fit as many trailing
 * weeks as the available width allows and start on a week boundary.
 */

/** Monday-first weeks, matching how practice weeks are usually planned. */
const WEEK_STARTS_ON = 1;
const CELL_SIZE = 12;
const CELL_GAP = 3;
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
  const weeks = Math.floor((availableWidth + CELL_GAP) / (CELL_SIZE + CELL_GAP));
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeks));
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

  const weeks = weeksThatFit(Math.min(width, MAX_CONTENT_WIDTH) - CONTENT_PADDING);
  const todayKey = useTodayKey();

  const { startDate, endDate } = useMemo(() => {
    // Explicit local midnight — a bare `YYYY-MM-DD` would parse as UTC.
    const today = new Date(`${todayKey}T00:00:00`);
    const firstDay = subDays(today, (weeks - 1) * 7);
    return {
      startDate: startOfWeek(firstDay, { weekStartsOn: WEEK_STARTS_ON }),
      endDate: today,
    };
  }, [weeks, todayKey]);

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

  return (
    <View className="mt-8">
      <Text className="text-[22px] font-bold text-ash-grey-950">{t('dashboard.practice')}</Text>
      <Text className="mb-3 mt-1.5 text-xs text-ash-grey-400">{t('dashboard.practiceNote')}</Text>

      {/*
        `items-start` stops the library's own container — a centring flex row —
        from stretching to the section width and floating the grid in the
        leftover space; it hugs the grid instead, so the cells start at the
        section's left edge like the heading above them.
      */}
      <View className="items-start">
        <WeeklyHeatMap
          data={data}
          startDate={startDate}
          endDate={endDate}
          weekStartsOn={WEEK_STARTS_ON}
          cellSize={CELL_SIZE}
          cellGap={CELL_GAP}
          cellRadius={3}
          scrollable={false}
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
          headerTextFontSize={10}
        />
      </View>

      {/* Legend: same ramp, least → most practice. */}
      <View className="mt-2 flex-row items-center gap-1.5">
        <Text className="text-[10px] text-ash-grey-400">{t('dashboard.practiceLess')}</Text>
        <View
          className="rounded-[3px]"
          style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: HeatmapColors.empty }}
        />
        {HeatmapColors.ramp.map((color) => (
          <View
            key={color}
            className="rounded-[3px]"
            style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: color }}
          />
        ))}
        <Text className="text-[10px] text-ash-grey-400">{t('dashboard.practiceMore')}</Text>
      </View>
    </View>
  );
}
