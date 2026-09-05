import * as DocumentPicker from 'expo-document-picker';

import { pickXmlFile } from '../filePicker';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  EncodingType: { Base64: 'base64' },
}));

const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;

/**
 * What Android's MediaStore reports for each extension. `.mxl` has no entry in
 * Android's MimeTypeMap, so the Storage Access Framework falls back to
 * octet-stream — verified on-device against the real MediaStore.
 */
const ANDROID_MIME = {
  '.mxl': 'application/octet-stream',
  '.xml': 'text/xml',
  '.zip': 'application/zip',
};

/** Whether a picker `type` filter would let the user select a file of this MIME. */
function accepts(filter: string | string[] | undefined, mime: string): boolean {
  const types = filter === undefined ? ['*/*'] : Array.isArray(filter) ? filter : [filter];
  return types.some((t) => {
    if (t === '*/*') return true;
    if (t.endsWith('/*')) return mime.startsWith(t.slice(0, -1));
    return t === mime;
  });
}

describe('pickXmlFile document type filter', () => {
  beforeEach(() => {
    getDocumentAsync.mockReset();
    getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  });

  async function requestedFilter(): Promise<string | string[] | undefined> {
    await pickXmlFile();
    return getDocumentAsync.mock.calls[0]?.[0]?.type;
  }

  it('accepts .mxl files, which Android reports as application/octet-stream', async () => {
    expect(accepts(await requestedFilter(), ANDROID_MIME['.mxl'])).toBe(true);
  });

  it('still accepts plain .xml files', async () => {
    expect(accepts(await requestedFilter(), ANDROID_MIME['.xml'])).toBe(true);
  });

  it('still accepts .mxl files renamed to .zip', async () => {
    expect(accepts(await requestedFilter(), ANDROID_MIME['.zip'])).toBe(true);
  });
});
