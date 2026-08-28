import {
  MAX_XML_BYTES,
  scrapeMusicXmlMetadata,
  scrapeTempoBpm,
  scrapePartPolyphony,
  scrapePartTranspose,
  scrapeScoreParts,
  isPartMonophonic,
  validateMusicXml,
} from '../musicxml';

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

  // Credit-based scraping (MuseScore and most engraving tools)

  test('explicit credit-type title and composer', () => {
    const xml = makeScore(
      '4.0',
      'score-partwise',
      `<credit page="1"><credit-type>title</credit-type>` +
        `<credit-words justify="center" valign="top" font-size="24">Turkish March</credit-words></credit>` +
        `<credit page="1"><credit-type>composer</credit-type>` +
        `<credit-words justify="right" valign="bottom" font-size="12">W.A. Mozart</credit-words></credit>`,
    );
    expect(scrapeMusicXmlMetadata(xml)).toEqual({
      title: 'Turkish March',
      composer: 'W.A. Mozart',
    });
  });

  test('credit heuristic: center/top = title, right = composer (no credit-type)', () => {
    const xml = makeScore(
      '3.1',
      'score-partwise',
      `<credit page="1"><credit-words justify="center" valign="top" font-size="24">Prelude I</credit-words></credit>` +
        `<credit page="1"><credit-words justify="right" valign="top" font-size="12">J.S. Bach</credit-words></credit>`,
    );
    expect(scrapeMusicXmlMetadata(xml)).toEqual({ title: 'Prelude I', composer: 'J.S. Bach' });
  });

  test('work-title wins over credit title', () => {
    const xml = makeScore(
      '4.0',
      'score-partwise',
      `<work><work-title>From Work Tag</work-title></work>` +
        `<credit page="1"><credit-type>title</credit-type>` +
        `<credit-words justify="center" valign="top" font-size="24">From Credit</credit-words></credit>`,
    );
    expect(scrapeMusicXmlMetadata(xml)).toMatchObject({ title: 'From Work Tag' });
  });

  test('no metadata at all → empty title, null composer', () => {
    const xml = makeScore('2.0', 'score-partwise');
    expect(scrapeMusicXmlMetadata(xml)).toEqual({ title: '', composer: null });
  });
});

// ── scrapeTempoBpm ──────────────────────────────────────────────────────────

function metronome(beatUnit: string, perMinute: number, dotted = false): string {
  const dot = dotted ? '<beat-unit-dot/>' : '';
  return (
    `<direction><direction-type><metronome>` +
    `<beat-unit>${beatUnit}</beat-unit>${dot}<per-minute>${perMinute}</per-minute>` +
    `</metronome></direction-type></direction>`
  );
}

describe('scrapeTempoBpm', () => {
  test('reads an explicit <sound tempo>', () => {
    const xml = makeScore('4.0', 'score-partwise', '<sound tempo="100"/>');
    expect(scrapeTempoBpm(xml)).toBe(100);
  });

  test('rounds a fractional <sound tempo>', () => {
    const xml = makeScore('4.0', 'score-partwise', '<sound tempo="92.5"/>');
    expect(scrapeTempoBpm(xml)).toBe(93);
  });

  test('reads a quarter-note metronome mark directly', () => {
    const xml = makeScore('4.0', 'score-partwise', metronome('quarter', 90));
    expect(scrapeTempoBpm(xml)).toBe(90);
  });

  test('converts a half-note metronome mark to quarter-note BPM', () => {
    const xml = makeScore('4.0', 'score-partwise', metronome('half', 60));
    expect(scrapeTempoBpm(xml)).toBe(120);
  });

  test('applies the dot to a dotted metronome mark', () => {
    const xml = makeScore('4.0', 'score-partwise', metronome('quarter', 80, true));
    expect(scrapeTempoBpm(xml)).toBe(120);
  });

  test('<sound tempo> wins over a metronome mark regardless of order', () => {
    const xml = makeScore(
      '4.0',
      'score-partwise',
      metronome('quarter', 60) + '<sound tempo="100"/>',
    );
    expect(scrapeTempoBpm(xml)).toBe(100);
  });

  test('no tempo → null (not a fabricated default)', () => {
    expect(scrapeTempoBpm(makeScore('4.0', 'score-partwise'))).toBeNull();
  });

  test('out-of-range <sound tempo> is ignored → null', () => {
    const xml = makeScore('4.0', 'score-partwise', '<sound tempo="500"/>');
    expect(scrapeTempoBpm(xml)).toBeNull();
  });

  test('handles a BOM-prefixed document', () => {
    const xml = '﻿' + makeScore('4.0', 'score-partwise', '<sound tempo="72"/>');
    expect(scrapeTempoBpm(xml)).toBe(72);
  });
});

describe('scrapePartTranspose', () => {
  const wrap = (parts: string) => `<score-partwise version="4.0">${parts}</score-partwise>`;
  const part = (id: string, attributes: string) =>
    `<part id="${id}"><measure number="1"><attributes>${attributes}</attributes></measure></part>`;

  it('reads a Bb clarinet declaration', () => {
    const xml = wrap(
      part('P1', '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>'),
    );
    expect(scrapePartTranspose(xml)).toBe(-2);
  });

  it('returns null when the part declares no transposition', () => {
    // Not 0: "nobody said" is what tells a concert-pitch score apart from one already
    // written for its instrument. See defaultBaseTranspose.
    expect(scrapePartTranspose(wrap(part('P1', '<divisions>1</divisions>')))).toBeNull();
  });

  it('distinguishes an explicit zero from a missing element', () => {
    const xml = wrap(part('P1', '<transpose><chromatic>0</chromatic></transpose>'));
    expect(scrapePartTranspose(xml)).toBe(0);
  });

  it('counts octave-change, as a bass clarinet needs', () => {
    const xml = wrap(
      part(
        'P1',
        '<transpose><chromatic>-2</chromatic><octave-change>-1</octave-change></transpose>',
      ),
    );
    expect(scrapePartTranspose(xml)).toBe(-14);
  });

  it('reads the named part, not the first one', () => {
    const xml = wrap(
      part('P1', '<divisions>1</divisions>') +
        part('P2', '<transpose><chromatic>-2</chromatic></transpose>'),
    );
    expect(scrapePartTranspose(xml, 'P2')).toBe(-2);
    expect(scrapePartTranspose(xml, 'P1')).toBeNull();
    // Unscoped finds the first declaration anywhere.
    expect(scrapePartTranspose(xml)).toBe(-2);
  });

  it('reports nothing declared for a part id that is not in the file', () => {
    // Reading some other part's element would silently transpose the wrong line.
    const xml = wrap(part('P1', '<transpose><chromatic>-2</chromatic></transpose>'));
    expect(scrapePartTranspose(xml, 'P9')).toBeNull();
  });

  it('tolerates single quotes and extra attributes on the part element', () => {
    const xml = `<score-partwise><part id='P2' foo="bar"><measure><attributes><transpose><chromatic>-9</chromatic></transpose></attributes></measure></part></score-partwise>`;
    expect(scrapePartTranspose(xml, 'P2')).toBe(-9);
  });

  it('treats a childless transpose element as no declaration', () => {
    expect(scrapePartTranspose(wrap(part('P1', '<transpose></transpose>')))).toBeNull();
  });
});

describe('scrapePartPolyphony', () => {
  const wrap = (parts: string, partList = '') =>
    `<score-partwise version="4.0">${partList}${parts}</score-partwise>`;
  const part = (id: string, body: string) =>
    `<part id="${id}"><measure number="1">${body}</measure></part>`;
  const note = (step: string, voice = '1', extra = '') =>
    `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>${voice}</voice></note>`;

  it('calls a plain single line monophonic', () => {
    const xml = wrap(part('P1', note('C') + note('D')));
    expect(scrapePartPolyphony(xml, 'P1')).toMatchObject({
      staffCount: 1,
      hasChords: false,
      voiceCount: 1,
      reason: null,
    });
    expect(isPartMonophonic(xml, 'P1')).toBe(true);
  });

  it('refuses a two-staff part', () => {
    const xml = wrap(part('P1', '<attributes><staves>2</staves></attributes>' + note('C')));
    expect(scrapePartPolyphony(xml, 'P1')?.reason).toBe('staves');
  });

  it('takes the largest staff count, so one two-staff passage disqualifies the part', () => {
    const xml = wrap(
      part(
        'P1',
        '<attributes><staves>1</staves></attributes>' +
          note('C') +
          '<attributes><staves>2</staves></attributes>',
      ),
    );
    expect(scrapePartPolyphony(xml, 'P1')).toMatchObject({ staffCount: 2, reason: 'staves' });
  });

  it('refuses a part containing chords', () => {
    const xml = wrap(part('P1', note('C') + note('E', '1', '<chord/>')));
    expect(scrapePartPolyphony(xml, 'P1')).toMatchObject({ hasChords: true, reason: 'chords' });
  });

  it('refuses a part with more than one voice', () => {
    const xml = wrap(part('P1', note('C', '1') + note('E', '2')));
    expect(scrapePartPolyphony(xml, 'P1')).toMatchObject({ voiceCount: 2, reason: 'voices' });
  });

  it('counts a part that writes no voice element at all as one voice', () => {
    const xml = wrap(part('P1', '<note><pitch><step>C</step><octave>4</octave></pitch></note>'));
    expect(scrapePartPolyphony(xml, 'P1')).toMatchObject({ voiceCount: 1, reason: null });
  });

  it('reports the staff count first, the way a reader would see it', () => {
    // A piano score fails all three at once; naming one is enough to explain itself.
    const xml = wrap(
      part(
        'P1',
        '<attributes><staves>2</staves></attributes>' + note('C', '1') + note('E', '5', '<chord/>'),
      ),
    );
    expect(scrapePartPolyphony(xml, 'P1')?.reason).toBe('staves');
  });

  it('judges the named part, not the whole document', () => {
    const xml = wrap(part('P1', note('C') + note('E', '1', '<chord/>')) + part('P2', note('G')));
    expect(scrapePartPolyphony(xml, 'P1')?.reason).toBe('chords');
    expect(scrapePartPolyphony(xml, 'P2')?.reason).toBeNull();
  });

  it('says nothing about a part it cannot find, rather than reading the document', () => {
    const xml = wrap(part('P1', '<attributes><staves>2</staves></attributes>'));
    expect(scrapePartPolyphony(xml, 'P9')).toBeNull();
    expect(isPartMonophonic(xml, 'P9')).toBeUndefined();
  });
});

describe('scrapeScoreParts', () => {
  const scorePart = (id: string, name: string) =>
    `<score-part id="${id}"><part-name>${name}</part-name></score-part>`;
  const part = (id: string, body: string) =>
    `<part id="${id}"><measure number="1">${body}</measure></part>`;
  const note = (step: string, voice = '1', extra = '') =>
    `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><voice>${voice}</voice></note>`;

  it('settles each part’s monophony at import, so nothing re-reads the score later', () => {
    const xml =
      `<score-partwise version="4.0"><part-list>${scorePart('P1', 'Piano')}${scorePart('P2', 'Clarinet')}</part-list>` +
      part('P1', '<attributes><staves>2</staves></attributes>' + note('C')) +
      part('P2', note('G')) +
      '</score-partwise>';
    expect(scrapeScoreParts(xml)).toEqual([
      { id: 'P1', name: 'Piano', monophonic: false, polyphonyReason: 'staves' },
      { id: 'P2', name: 'Clarinet', monophonic: true },
    ]);
  });

  it('leaves the flag absent when the part body is not there to read', () => {
    const xml = `<score-partwise version="4.0"><part-list>${scorePart('P1', 'Flute')}</part-list></score-partwise>`;
    expect(scrapeScoreParts(xml)).toEqual([{ id: 'P1', name: 'Flute' }]);
  });
});
