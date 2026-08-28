/**
 * The dashboard's instrument scope: which instrument's practice material the home
 * screen is showing.
 *
 * A pure view filter over warm-ups, routines and pieces, and nothing else. It does not
 * touch the PlayView, the practice heatmap, or what a new import may become — a piece
 * belongs to the instrument its score is for, never to whatever the dashboard happened
 * to be showing when it was imported. That is what makes the filter safe to leave on:
 * turning it off restores exactly the library that was always there.
 *
 * `'all'` is a first-class scope rather than an absent one, because it has to persist
 * and to be chosen back: an install that has never touched the control shows
 * everything, and so does one that has deliberately returned to everything.
 */
import {
  INSTRUMENT_IDS,
  isInstrumentId,
  supportsExercise,
  type InstrumentId,
} from './instrumentRegistry';
import { WARM_UP_TYPES, type WarmUpType } from './warmupRegistry';

export const ALL_INSTRUMENTS = 'all';

export type InstrumentScope = InstrumentId | typeof ALL_INSTRUMENTS;

/** Display order for the scope picker: everything first, then the registry's order. */
export const INSTRUMENT_SCOPES: readonly InstrumentScope[] = [ALL_INSTRUMENTS, ...INSTRUMENT_IDS];

export const DEFAULT_INSTRUMENT_SCOPE: InstrumentScope = ALL_INSTRUMENTS;

export function isInstrumentScope(value: unknown): value is InstrumentScope {
  return value === ALL_INSTRUMENTS || isInstrumentId(value);
}

/**
 * Forces a value read off disk into a scope, the way `normaliseInstrumentId` does for
 * an instrument. A fresh install and a rotted setting both show everything, which is
 * the state that hides nothing from the user.
 */
export function normaliseInstrumentScope(raw: unknown): InstrumentScope {
  return isInstrumentScope(raw) ? raw : DEFAULT_INSTRUMENT_SCOPE;
}

/** Whether a row belonging to `instrument` is visible under `scope`. */
export function scopeIncludes(scope: InstrumentScope, instrument: InstrumentId): boolean {
  return scope === ALL_INSTRUMENTS || scope === instrument;
}

/**
 * The instrument the scope names, or `null` under "All".
 *
 * `null` is what tells a new routine's editor that the user still has to choose: the
 * dashboard scope is a pre-selection, and "everything" pre-selects nothing.
 */
export function scopeInstrument(scope: InstrumentScope): InstrumentId | null {
  return scope === ALL_INSTRUMENTS ? null : scope;
}

/** Keeps only the rows the scope shows, preserving order. */
export function filterByInstrument<T extends { instrument: InstrumentId }>(
  items: readonly T[],
  scope: InstrumentScope,
): T[] {
  return items.filter((item) => scopeIncludes(scope, item.instrument));
}

/** One warm-up row: an exercise, practised on a particular instrument. */
export interface WarmUpRowSpec {
  type: WarmUpType;
  instrument: InstrumentId;
}

/**
 * The warm-up rows a scope shows, in display order.
 *
 * Under "All" an exercise appears once per instrument that has it, **grouped by
 * exercise** — Scales (Piano), Scales (Clarinet), Chromatic (Piano), Chromatic
 * (Clarinet). Grouping by instrument instead would bury the second copy of Scales far
 * below the first, and the question a warming-up player asks is "where are my scales",
 * not "where is my clarinet".
 *
 * A row carries its instrument so tapping it can pass that along without the scope
 * having to change: the dashboard filter is a filter, not a mode.
 */
export function warmUpRowsForScope(scope: InstrumentScope): WarmUpRowSpec[] {
  const instruments = scope === ALL_INSTRUMENTS ? INSTRUMENT_IDS : [scope];
  const rows: WarmUpRowSpec[] = [];
  for (const type of WARM_UP_TYPES) {
    for (const instrument of instruments) {
      if (supportsExercise(instrument, type)) rows.push({ type, instrument });
    }
  }
  return rows;
}
