import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { scrapeMusicXmlMetadata, scrapeTempoBpm } from '@domain/musicxml';
import { pieceRepository } from './index';
import { extractXmlFromMxl } from './mxlExtract';

// Stable ID so we can check existence without a marker file.
// Do NOT change this after shipping — it is stored in the SQLite DB.
export const DEMO_PIECE_ID = 'demo-bach-prelude-c-major-bwv846';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEMO_MXL_ASSET = require('../../assets/demo/bach-prelude-c-major-bwv846.mxl') as number;

/**
 * Imports the bundled demo piece on first install.
 * Idempotent: does nothing if the piece already exists in the DB.
 * Silently swallowed on error — a missing demo piece is non-fatal.
 */
export async function seedDemoDataIfNeeded(): Promise<void> {
  try {
    const existing = await pieceRepository.get(DEMO_PIECE_ID);
    if (existing) return;

    const [asset] = await Asset.loadAsync(DEMO_MXL_ASSET);
    if (!asset?.localUri) return;

    const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const xmlContent = extractXmlFromMxl(base64);
    const metadata = scrapeMusicXmlMetadata(xmlContent);
    const importedBpm = scrapeTempoBpm(xmlContent);

    await pieceRepository.save(
      {
        id: DEMO_PIECE_ID,
        title: metadata.title || 'Prelude I in C major',
        composer: metadata.composer,
        xmlFilename: DEMO_PIECE_ID + '.xml',
        // Fixed timestamp so the demo piece always sorts last (oldest)
        importedAt: '2026-01-01T00:00:00.000Z',
        // The bundled Bach prelude declares no tempo, so importedBpm stays
        // undefined — do not fabricate an imported speed. Ship a curated target
        // of 80 BPM so the demo plays at a musical tempo out of the box.
        ...(importedBpm != null ? { importedBpm } : {}),
        targetBpm: 80,
      },
      xmlContent,
    );
  } catch (err) {
    console.warn('[seedDemoData] seeding failed (non-fatal):', err);
  }
}
