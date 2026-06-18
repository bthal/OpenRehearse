import { strToU8, zipSync } from 'fflate';

import { extractXmlFromMxl } from '../mxlExtract';

// atob/btoa are browser/RN globals; polyfill for Jest (Node < 16) environments.
// Cast through unknown to avoid TS complaining about re-assigning DOM globals.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g['atob'] !== 'function') {
  g['atob'] = (b64: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const idx = (ch: string | undefined): number => chars.indexOf(ch ?? '');
    const str = b64.replace(/=+$/, '');
    let output = '';
    for (let i = 0; i < str.length; i += 4) {
      const a = idx(str[i]);
      const b = idx(str[i + 1]);
      const c = idx(str[i + 2]);
      const d = idx(str[i + 3]);
      output += String.fromCharCode(
        (a << 2) | (b >> 4),
        ((b & 0xf) << 4) | (c >> 2),
        ((c & 0x3) << 6) | d,
      );
    }
    if (b64.endsWith('==')) return output.slice(0, -2);
    if (b64.endsWith('=')) return output.slice(0, -1);
    return output;
  };
}
if (typeof g['btoa'] !== 'function') {
  g['btoa'] = (binary: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const c = (n: number): string => chars[n] ?? '';
    let output = '';
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i);
      const b = binary.charCodeAt(i + 1);
      const cc = binary.charCodeAt(i + 2);
      output +=
        c(a >> 2) +
        c(((a & 3) << 4) | (b >> 4)) +
        (i + 1 < binary.length ? c(((b & 0xf) << 2) | (cc >> 6)) : '=') +
        (i + 2 < binary.length ? c(cc & 0x3f) : '=');
    }
    return output;
  };
}

const SCORE_XML = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"></score-partwise>`;

/** Convert Uint8Array → base64 without Buffer (works in RN/browser/Node). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function makeMxlBase64(rootFilePath: string, xml: string): string {
  const containerXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<container><rootfiles>` +
    `<rootfile full-path="${rootFilePath}" media-type="application/vnd.recordare.musicxml+xml"/>` +
    `</rootfiles></container>`;

  const zipped = zipSync({
    'META-INF/container.xml': strToU8(containerXml),
    [rootFilePath]: strToU8(xml),
  });

  return uint8ToBase64(zipped);
}

describe('extractXmlFromMxl', () => {
  it('extracts the rootfile XML from a well-formed .mxl archive', () => {
    const base64 = makeMxlBase64('score.xml', SCORE_XML);
    expect(extractXmlFromMxl(base64)).toBe(SCORE_XML);
  });

  it('works when the rootfile path is nested (e.g. "score/score.xml")', () => {
    const base64 = makeMxlBase64('score/score.xml', SCORE_XML);
    expect(extractXmlFromMxl(base64)).toBe(SCORE_XML);
  });

  it('throws if META-INF/container.xml is absent', () => {
    const zipped = zipSync({ 'score.xml': strToU8(SCORE_XML) });
    const base64 = uint8ToBase64(zipped);
    expect(() => extractXmlFromMxl(base64)).toThrow('missing META-INF/container.xml');
  });

  it('throws if container.xml has no full-path attribute', () => {
    const containerXml = `<?xml version="1.0"?><container><rootfiles><rootfile/></rootfiles></container>`;
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(containerXml),
      'score.xml': strToU8(SCORE_XML),
    });
    const base64 = uint8ToBase64(zipped);
    expect(() => extractXmlFromMxl(base64)).toThrow('no rootfile full-path');
  });

  it('throws if the rootfile listed in container.xml is absent from the archive', () => {
    const containerXml =
      `<?xml version="1.0"?><container><rootfiles>` +
      `<rootfile full-path="missing.xml"/>` +
      `</rootfiles></container>`;
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(containerXml),
    });
    const base64 = uint8ToBase64(zipped);
    expect(() => extractXmlFromMxl(base64)).toThrow('rootfile "missing.xml" not found');
  });
});
