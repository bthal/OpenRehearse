import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_XML_BYTES = 5 * 1024 * 1024; // 5 MB

/** Reasons a MusicXML file is rejected at import time. */
export type MusicXmlValidationError =
  | 'NOT_XML'
  | 'NOT_MUSICXML'
  | 'UNSUPPORTED_VERSION'
  | 'FILE_TOO_LARGE';

const VALID_ROOTS = new Set(['score-partwise', 'score-timewise', 'opus']);

// The three helpers below are shared with domain/sections.ts — MusicXML parsing
// quirks (BOMs, fast-xml-parser's string|number|#text union) are the same wherever
// a score is read, so they live here rather than being duplicated per module.

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function textFrom(node: unknown): string | undefined {
  if (typeof node === 'number' && Number.isFinite(node)) return String(node);
  if (typeof node === 'string') {
    const t = node.trim();
    return t.length > 0 ? t : undefined;
  }
  if (isRecord(node) && typeof node['#text'] === 'string') {
    const t = node['#text'].trim();
    return t.length > 0 ? t : undefined;
  }
  return undefined;
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = firstString(item);
      if (s) return s;
    }
  }
  if (isRecord(v)) return firstString(Object.values(v)[0]);
  return undefined;
}

/**
 * Returns null if the content is valid MusicXML 2.x–4.x; otherwise returns the
 * rejection reason. Missing version attribute is accepted (some older files omit it).
 */
export function validateMusicXml(content: string): MusicXmlValidationError | null {
  if (content.length > MAX_XML_BYTES) return 'FILE_TOO_LARGE';

  const stripped = stripBom(content);

  const wellFormed = XMLValidator.validate(stripped);
  if (wellFormed !== true) return 'NOT_XML';

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    trimValues: true,
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(stripped) as Record<string, unknown>;
  } catch {
    return 'NOT_XML';
  }

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

type CreditWord = {
  creditType?: string;
  justify: string;
  valign: string;
  fontSize: number;
  text: string;
};

function collectCreditWords(root: Record<string, unknown>): CreditWord[] {
  const credits = root['credit'];
  const creditList = Array.isArray(credits) ? credits : credits != null ? [credits] : [];
  const out: CreditWord[] = [];

  for (const credit of creditList) {
    if (!isRecord(credit)) continue;
    const creditType =
      typeof credit['credit-type'] === 'string'
        ? credit['credit-type'].trim().toLowerCase()
        : undefined;
    const words = credit['credit-words'];
    const wordList = Array.isArray(words) ? words : words != null ? [words] : [];

    for (const w of wordList) {
      const text = textFrom(w);
      if (!text) continue;
      const justify =
        isRecord(w) && typeof w['@_justify'] === 'string'
          ? w['@_justify'].trim().toLowerCase()
          : 'center';
      const valign =
        isRecord(w) && typeof w['@_valign'] === 'string'
          ? w['@_valign'].trim().toLowerCase()
          : 'top';
      const fontSizeRaw = isRecord(w) ? w['@_font-size'] : undefined;
      const fontSize =
        typeof fontSizeRaw === 'number'
          ? fontSizeRaw
          : typeof fontSizeRaw === 'string'
            ? parseFloat(fontSizeRaw) || 0
            : 0;
      out.push({ creditType, justify, valign, fontSize, text });
    }
  }

  return out;
}

function titleFromCredits(words: CreditWord[]): string | undefined {
  // Prefer explicit credit-type="title"
  const explicit = words.find((w) => w.creditType === 'title');
  if (explicit) return explicit.text;

  // Fall back to heuristic: centered, top-aligned, largest font
  const candidates = words.filter(
    (w) => w.justify === 'center' && (w.valign === 'top' || w.valign === 'middle'),
  );
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.fontSize - a.fontSize);
  return candidates[0]?.text;
}

function composerFromCredits(words: CreditWord[]): string | undefined {
  // Prefer explicit credit-type="composer"
  const explicit = words.find((w) => w.creditType === 'composer');
  if (explicit) return explicit.text;

  // Fall back to heuristic: right-aligned, top or bottom
  return words.find((w) => w.justify === 'right')?.text;
}

/**
 * Scrapes display metadata from a validated MusicXML string.
 * Checks <work-title>, <identification>/<creator>, and <credit> blocks.
 * MuseScore exports typically only populate <credit> — not <work-title>.
 */
export function scrapeMusicXmlMetadata(content: string): MusicXmlMetadata {
  const stripped = stripBom(content);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    trimValues: true,
    isArray: (name) => name === 'creator' || name === 'credit' || name === 'credit-words',
  });
  const parsed = parser.parse(stripped) as Record<string, unknown>;

  const rootKey = Object.keys(parsed).find((k) => !k.startsWith('?')) ?? '';
  const root = (parsed[rootKey] ?? {}) as Record<string, unknown>;

  // 1. Work elements (classical MusicXML 2/3/4 notation editors)
  const work = isRecord(root['work']) ? root['work'] : undefined;
  const workTitle = firstString(work?.['work-title']) ?? firstString(work?.['movement-title']);
  const movementTitle = firstString(root['movement-title']);

  // 2. Identification creators
  const identification = isRecord(root['identification']) ? root['identification'] : undefined;
  const creators = identification?.['creator'];
  const creatorList = Array.isArray(creators) ? creators : [];
  let creatorComposer: string | undefined;
  for (const c of creatorList as Record<string, unknown>[]) {
    if (c['@_type'] === 'composer') {
      creatorComposer = textFrom(c) ?? undefined;
      if (creatorComposer) break;
    }
  }

  // 3. Credit blocks (MuseScore and many engraving tools)
  const creditWords = collectCreditWords(root);
  const creditTitle = titleFromCredits(creditWords);
  const creditComposer = composerFromCredits(creditWords);

  const title = workTitle ?? creditTitle ?? movementTitle ?? '';
  const composer = creatorComposer ?? creditComposer ?? null;

  return { title, composer };
}

// MusicXML <beat-unit> value → its length in quarter notes, for converting a
// metronome mark to the quarter-note BPM that OSMD/Tone use as the transport unit.
const BEAT_UNIT_QUARTERS: Record<string, number> = {
  long: 16,
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
};

/**
 * Reads the piece's initial tempo as quarter-note BPM, or `null` when the score
 * declares no tempo at all.
 *
 * Priority: an explicit `<sound tempo="…">` (already quarter-note BPM — what
 * MuseScore and most exporters write) wins; otherwise the first `<metronome>`
 * mark is converted from its beat-unit to quarter-note BPM. Values outside
 * (0, 400) are treated as absent, matching the WebView's own clamp.
 *
 * Returns `null` — not a default — when nothing is found, so callers can tell
 * "the file says 120" apart from "the file says nothing." Inventing a default
 * here would be wrong twice over: it would mislabel the imported speed, and (via
 * the PlayView target reference) it would override OSMD's own default tempo,
 * which is 100 rather than 120 for a tempo-less score.
 *
 * Deliberately uses targeted first-match extraction rather than structural
 * parsing: we only need the single earliest tempo in document order, and a full
 * traversal of the measure/direction tree to establish ordering would be far
 * more code for no gain. Input is already validated MusicXML.
 */
export function scrapeTempoBpm(content: string): number | null {
  const stripped = stripBom(content);

  const sound = stripped.match(/<sound\b[^>]*\btempo\s*=\s*"([\d.]+)"/i);
  if (sound) {
    const bpm = Number(sound[1]);
    if (bpm > 0 && bpm < 400) return Math.round(bpm);
  }

  const metronome = stripped.match(/<metronome\b[^>]*>([\s\S]*?)<\/metronome>/i);
  if (metronome) {
    const block = metronome[1] ?? '';
    const beatUnit = block.match(/<beat-unit>\s*([^<\s]+)\s*<\/beat-unit>/i)?.[1]?.toLowerCase();
    const dotted = /<beat-unit-dot\s*\/?>/i.test(block);
    const perMinute = Number(block.match(/<per-minute>\s*([\d.]+)\s*<\/per-minute>/i)?.[1]);
    const unitQuarters = beatUnit ? BEAT_UNIT_QUARTERS[beatUnit] : undefined;
    if (unitQuarters && perMinute > 0) {
      const bpm = perMinute * unitQuarters * (dotted ? 1.5 : 1);
      if (bpm > 0 && bpm < 400) return Math.round(bpm);
    }
  }

  return null;
}

/**
 * The `<transpose>` written into a part, in semitones, or `null` when the part
 * declares none.
 *
 * `null` and `0` are genuinely different answers, which is the whole reason this
 * returns a nullable rather than defaulting. A part carrying `<transpose>` — even an
 * explicit zero — is one whose engraver stated the relationship between what is
 * written and what sounds, so it is already in the key its player reads. A part with
 * no element at all said nothing, and for a transposing instrument that means the
 * score is at concert pitch and has to be moved. `defaultBaseTranspose` in
 * `instrumentRegistry.ts` is where that decision is made; this only reports the fact.
 *
 * `<octave-change>` counts: a bass clarinet is `chromatic -2` plus `octave-change -1`,
 * which is −14 semitones, not −2.
 *
 * Scoped to `partId` when given, because a multi-part score can hold several
 * transposing instruments and only the practised one's declaration is relevant.
 * Follows `scrapeTempoBpm` in using targeted extraction over structural parsing:
 * the input is already-validated MusicXML and we need one element, not a tree.
 */
export function scrapePartTranspose(content: string, partId?: string): number | null {
  const stripped = stripBom(content);

  let scope = stripped;
  if (partId != null && partId !== '') {
    // Attribute order and quoting vary between exporters, so match the id attribute
    // rather than assuming `<part id="P1">` verbatim.
    const escaped = partId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const part = stripped.match(
      new RegExp(`<part\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)</part>`, 'i'),
    );
    // A part id that is not in the file is a caller bug, not a silent concert-pitch
    // score: report "nothing declared" rather than reading a different part's element.
    if (!part) return null;
    scope = part[1] ?? '';
  }

  const block = scope.match(/<transpose\b[^>]*>([\s\S]*?)<\/transpose>/i);
  if (!block) return null;

  const body = block[1] ?? '';
  const chromatic = Number(body.match(/<chromatic>\s*(-?[\d.]+)\s*<\/chromatic>/i)?.[1]);
  const octaveChange = Number(body.match(/<octave-change>\s*(-?[\d.]+)\s*<\/octave-change>/i)?.[1]);

  const semitones =
    (Number.isFinite(chromatic) ? chromatic : 0) +
    (Number.isFinite(octaveChange) ? octaveChange * 12 : 0);

  // A <transpose> with neither child is malformed; treat it as no declaration at all
  // rather than as an explicit zero, which would suppress the concert-pitch default.
  if (!Number.isFinite(chromatic) && !Number.isFinite(octaveChange)) return null;
  return semitones;
}
