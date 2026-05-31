import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_XML_BYTES = 5 * 1024 * 1024; // 5 MB

/** Reasons a MusicXML file is rejected at import time. */
export type MusicXmlValidationError =
  | 'NOT_XML'
  | 'NOT_MUSICXML'
  | 'UNSUPPORTED_VERSION'
  | 'FILE_TOO_LARGE';

const VALID_ROOTS = new Set(['score-partwise', 'score-timewise', 'opus']);

/**
 * Returns null if the content is valid MusicXML 2.x–4.x; otherwise returns the
 * rejection reason. Missing version attribute is accepted (some older files omit it).
 */
export function validateMusicXml(content: string): MusicXmlValidationError | null {
  if (content.length > MAX_XML_BYTES) return 'FILE_TOO_LARGE';

  // Strip BOM if present
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  const wellFormed = XMLValidator.validate(stripped);
  if (wellFormed !== true) return 'NOT_XML';

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(stripped) as Record<string, unknown>;
  } catch {
    return 'NOT_XML';
  }

  // Find the root element (skip the `?xml` declaration key if present)
  const rootKey = Object.keys(parsed).find((k) => !k.startsWith('?'));
  if (!rootKey || !VALID_ROOTS.has(rootKey)) return 'NOT_MUSICXML';

  const root = parsed[rootKey] as Record<string, unknown> | undefined;
  const version = root?.['@_version'];
  if (typeof version === 'string' && version.trim() !== '') {
    const major = parseInt(version.split('.')[0] ?? '', 10);
    if (isNaN(major) || major < 2 || major > 4) return 'UNSUPPORTED_VERSION';
  }

  return null;
}

export interface MusicXmlMetadata {
  title: string;
  composer: string | null;
}

/**
 * Scrapes display metadata from a validated MusicXML string.
 * Call only after validateMusicXml returns null.
 */
export function scrapeMusicXmlMetadata(content: string): MusicXmlMetadata {
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'creator',
  });
  const parsed = parser.parse(stripped) as Record<string, unknown>;

  const rootKey = Object.keys(parsed).find((k) => !k.startsWith('?')) ?? '';
  const root = (parsed[rootKey] ?? {}) as Record<string, unknown>;

  // Title: work-title > movement-title > ''
  const work = root['work'] as Record<string, unknown> | undefined;
  const workTitle = typeof work?.['work-title'] === 'string' ? work['work-title'].trim() : '';
  const movementTitle =
    typeof root['movement-title'] === 'string' ? root['movement-title'].trim() : '';
  const title = workTitle || movementTitle;

  // Composer: first <creator type="composer"> inside <identification>
  const identification = root['identification'] as Record<string, unknown> | undefined;
  const creators = identification?.['creator'];
  let composer: string | null = null;
  if (Array.isArray(creators)) {
    for (const c of creators as Record<string, unknown>[]) {
      if (c['@_type'] === 'composer' && typeof c['#text'] === 'string') {
        composer = c['#text'].trim() || null;
        break;
      }
    }
  }

  return { title, composer };
}
