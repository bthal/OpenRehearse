import { useEffect, useState } from 'react';

import { pieceRepository } from '@data/index';
import type { Piece } from '@domain/piece';
import { parseMeasureMap, type MeasureMap } from '@domain/measureMap';

/**
 * Loads the printed-measure map for a piece, on demand.
 *
 * The section editor needs to turn measure numbers the user types into array indices,
 * and there is no formula for that (see `domain/measureMap.ts`) — it has to read the
 * score. Nothing else in the app holds a measure list, and the dashboard, which owns
 * the edit modal, has no WebView to ask.
 *
 * Deliberately gated on `enabled` rather than running when the modal opens: parsing is
 * synchronous, so a large score would block the JS thread. Paying that only when the
 * user actually expands the Sections block keeps the cost off the common path, and the
 * awaited file read yields first, so the block paints its spinner before the parse.
 *
 * The result is kept in state and keyed by piece, so collapsing and re-expanding does
 * not re-parse. `status` is derived during render rather than assigned in the effect —
 * the effect's only job is to fetch, which keeps it to a single state write.
 */
export type MeasureMapState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; map: MeasureMap }
  /** Unreadable score — score-timewise, opus, or malformed. Drives the degraded editor. */
  | { status: 'unavailable' };

export function useMeasureMap(piece: Piece, enabled: boolean): MeasureMapState {
  // null map = read or parse failed. Distinct from "not loaded yet", which is `null` here.
  const [result, setResult] = useState<{ pieceId: string; map: MeasureMap | null } | null>(null);

  useEffect(() => {
    if (!enabled || result?.pieceId === piece.id) return;

    let cancelled = false;
    void (async () => {
      let map: MeasureMap | null = null;
      try {
        const xml = await pieceRepository.readXml(piece);
        if (cancelled) return;
        map = parseMeasureMap(xml);
      } catch {
        // An unreadable file is the same outcome as an unparseable one: the editor
        // degrades to rename and recolor rather than failing the whole modal.
        map = null;
      }
      if (!cancelled) setResult({ pieceId: piece.id, map });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, piece, result]);

  if (!enabled) return { status: 'idle' };
  if (result?.pieceId !== piece.id) return { status: 'loading' };
  return result.map ? { status: 'ready', map: result.map } : { status: 'unavailable' };
}
