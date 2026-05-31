import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export interface PickedFile {
  name: string;
  content: string;
}

const IMPORT_CACHE = FileSystem.cacheDirectory + 'xml-import/';

/**
 * Opens the system file picker filtered to XML files and returns the file name
 * and UTF-8 content, or null if the user cancelled.
 *
 * Android strategy: document picker returns a content:// URI backed by the
 * Storage Access Framework. fetch() cannot handle content:// (wrong protocol),
 * and readAsStringAsync() with a content:// URI fails on SDK 56. The reliable
 * path is FileSystem.copyAsync(), which uses Android's ContentResolver under
 * the hood and respects the temporary SAF read grant. We copy to a UUID-named
 * temp file to avoid any path-encoding issues with the original filename.
 *
 * Web swap: replace this body with an <input type="file" accept=".xml"> +
 * FileReader implementation; the PickedFile return type stays identical.
 */
export async function pickXmlFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/xml', 'application/xml'],
    copyToCacheDirectory: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  console.log('[filePicker] picked uri:', asset.uri, 'name:', asset.name);

  await FileSystem.makeDirectoryAsync(IMPORT_CACHE, { intermediates: true });
  const tempPath = IMPORT_CACHE + Crypto.randomUUID() + '.xml';

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: tempPath });
    console.log('[filePicker] copied to temp:', tempPath);

    const content = await FileSystem.readAsStringAsync(tempPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log('[filePicker] read', content.length, 'chars');

    return { name: asset.name, content };
  } finally {
    FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  }
}
