import { MAX_XML_BYTES, scrapeMusicXmlMetadata, validateMusicXml } from '../musicxml';

// Minimal valid MusicXML wrapper — just enough structure for the parser.
function makeScore(version: string | null, root: string, inner = ''): string {
  const vAttr = version !== null ? ` version="${version}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}${vAttr}>${inner}</${root}>`;
}

function makeScoreWithMeta(opts: {
  workTitle?: string;
  movementTitle?: string;
  composer?: string;
  creatorType?: string;
}): string {
  const work = opts.workTitle ? `<work><work-title>${opts.workTitle}</work-title></work>` : '';
  const mv = opts.movementTitle ? `<movement-title>${opts.movementTitle}</movement-title>` : '';
  const creator =
    opts.composer !== undefined
      ? `<creator type="${opts.creatorType ?? 'composer'}">${opts.composer}</creator>`
      : '';
  const identification = creator ? `<identification>${creator}</identification>` : '';
  return makeScore('4.0', 'score-partwise', `${work}${mv}${identification}`);
}

// ── validateMusicXml ────────────────────────────────────────────────────────

describe('validateMusicXml', () => {
  test('valid MusicXML 4.0 score-partwise → null', () => {
    expect(validateMusicXml(makeScore('4.0', 'score-partwise'))).toBeNull();
  });

  test('valid MusicXML 2.0 score-partwise → null', () => {
    expect(validateMusicXml(makeScore('2.0', 'score-partwise'))).toBeNull();
  });

  test('valid MusicXML 3.1 score-timewise → null', () => {
    expect(validateMusicXml(makeScore('3.1', 'score-timewise'))).toBeNull();
  });

  test('valid opus root → null', () => {
    expect(validateMusicXml(makeScore('4.0', 'opus'))).toBeNull();
  });

  test('missing version attribute → null (permissive)', () => {
    expect(validateMusicXml(makeScore(null, 'score-partwise'))).toBeNull();
  });

  test('BOM-prefixed UTF-8 → null', () => {
    const bom = '﻿';
    expect(validateMusicXml(bom + makeScore('3.0', 'score-partwise'))).toBeNull();
  });

  test('file exceeds MAX_XML_BYTES → FILE_TOO_LARGE', () => {
    const big = 'x'.repeat(MAX_XML_BYTES + 1);
    expect(validateMusicXml(big)).toBe('FILE_TOO_LARGE');
  });

  test('non-XML string → NOT_XML', () => {
    expect(validateMusicXml('not xml at all')).toBe('NOT_XML');
  });

  test('malformed XML (unclosed tag) → NOT_XML', () => {
    expect(validateMusicXml('<score-partwise version="4.0"><unclosed>')).toBe('NOT_XML');
  });

  test('well-formed XML with wrong root → NOT_MUSICXML', () => {
    expect(validateMusicXml('<html><body>hello</body></html>')).toBe('NOT_MUSICXML');
  });

  test('version 1.0 → UNSUPPORTED_VERSION', () => {
    expect(validateMusicXml(makeScore('1.0', 'score-partwise'))).toBe('UNSUPPORTED_VERSION');
  });

  test('version 5.0 → UNSUPPORTED_VERSION', () => {
    expect(validateMusicXml(makeScore('5.0', 'score-partwise'))).toBe('UNSUPPORTED_VERSION');
  });

  test('version "2" (no minor) → null', () => {
    expect(validateMusicXml(makeScore('2', 'score-partwise'))).toBeNull();
  });
});

// ── scrapeMusicXmlMetadata ──────────────────────────────────────────────────

describe('scrapeMusicXmlMetadata', () => {
  test('work-title and composer present', () => {
    const xml = makeScoreWithMeta({ workTitle: 'Sonata No. 1', composer: 'Beethoven' });
    expect(scrapeMusicXmlMetadata(xml)).toEqual({ title: 'Sonata No. 1', composer: 'Beethoven' });
  });

  test('work-title wins over movement-title', () => {
    const xml = makeScoreWithMeta({ workTitle: 'Symphony', movementTitle: 'Allegro' });
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ title: 'Symphony' });
  });

  test('falls back to movement-title when no work-title', () => {
    const xml = makeScoreWithMeta({ movementTitle: 'Allegro' });
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ title: 'Allegro' });
  });

  test('no title elements → empty string', () => {
    const xml = makeScore('4.0', 'score-partwise');
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ title: '' });
  });

  test('no composer → null', () => {
    const xml = makeScoreWithMeta({ workTitle: 'Etude' });
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ composer: null });
  });

  test('creator with wrong type → composer null', () => {
    const xml = makeScoreWithMeta({ composer: 'Someone', creatorType: 'lyricist' });
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ composer: null });
  });

  test('BOM-prefixed → scrapes correctly', () => {
    const xml = '﻿' + makeScoreWithMeta({ workTitle: 'Prelude', composer: 'Bach' });
    expect(scrapeMusicXmlMetadata(xml)).toEqual({ title: 'Prelude', composer: 'Bach' });
  });
});
