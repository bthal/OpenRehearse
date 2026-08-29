import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { base64ToBytes, extractXmlFromMxl } from './mxlExtract';

export interface PickedFile {
  name: string;
  content: string;
}

const IMPORT_CACHE = FileSystem.cacheDirectory + 'xml-import/';

/**
 * Opens the system file picker filtered to MusicXML files (.xml and .mxl) and
 * returns the file name and UTF-8 XML content, or null if the user cancelled.
 *
 * For .mxl (compressed MusicXML / ZIP): reads the file as base64 and
 * decompresses it to plain XML before returning; the caller receives the same
 * PickedFile shape regardless of source format.
 *
 * Android strategy: document picker returns a content:// URI backed by the
 * Storage Access Framework. fetch() cannot handle content:// (wrong protocol),
 * and readAsStringAsync() with a content:// URI fails on SDK 56. The reliable
 * path is FileSystem.copyAsync(), which uses Android's ContentResolver under
 * the hood and respects the temporary SAF read grant. We copy to a UUID-named
 * temp file to avoid any path-encoding issues with the original filename.
 *
 * Web swap: replace this body with an <input type="file" accept=".xml,.mxl"> +
 * FileReader implementation; the PickedFile return type stays identical.
 */
export async function pickXmlFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'text/xml',
      'application/xml',
      'application/vnd.recordare.musicxml',
      'application/vnd.recordare.musicxml+xml',
      'application/zip',
      // Android has no MimeTypeMap entry for `mxl` (nor `musicxml`), so the Storage
      // Access Framework reports octet-stream and the picker greys the file out —
      // every .mxl on the device is unselectable without this. Widening the filter is
      // safe because the picker's answer was never trusted anyway: the magic-byte
      // sniff below decides how to decode, and validateMusicXml rejects the rest with
      // a message. A provider that reports some other type for .mxl would still be
      // greyed out; the escape hatch if that ever surfaces is `'*/*'`, at the cost of
      // listing every file on the device.
      'application/octet-stream',
    ],
    copyToCacheDirectory: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  console.log('[filePicker] picked uri:', asset.uri, 'name:', asset.name, 'mime:', asset.mimeType);

  await FileSystem.makeDirectoryAsync(IMPORT_CACHE, { intermediates: true });
  const tempPath = IMPORT_CACHE + Crypto.randomUUID();

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: tempPath });
    console.log('[filePicker] copied to temp:', tempPath);

    // Always read as base64 so we can inspect magic bytes before deciding how to decode.
    // Android SAF can return a display name that omits the extension, so we cannot rely
    // solely on asset.name to detect .mxl (ZIP) vs plain XML.
    const base64 = await FileSystem.readAsStringAsync(tempPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    let content: string;
    if (isZipBase64(base64) || asset.name.toLowerCase().endsWith('.mxl')) {
      content = extractXmlFromMxl(base64);
      console.log('[filePicker] extracted mxl, xml length:', content.length);
    } else {
      content = new TextDecoder('utf-8').decode(base64ToBytes(base64));
      console.log('[filePicker] decoded xml, length:', content.length);
    }

    return { name: asset.name, content };
  } finally {
    FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  }
}

/** Returns true when the base64 content starts with the ZIP magic bytes PK\x03\x04. */
function isZipBase64(base64: string): boolean {
  // atob + slice: decode just the first 4 bytes (8 base64 chars covers 6 bytes).
  const head = base64ToBytes(base64.slice(0, 8));
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}
