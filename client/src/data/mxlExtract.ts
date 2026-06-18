import { strFromU8, unzipSync } from 'fflate';

/**
 * Decodes a base64 string to bytes using the globally available `atob`.
 * Buffer is a Node.js-only global and is not available in Hermes/React Native.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decompresses a .mxl (compressed MusicXML) file given as a base64 string and
 * returns the inner MusicXML as a UTF-8 string.
 *
 * MXL structure (MusicXML 2.0 compressed format spec):
 *   META-INF/container.xml  — manifest; full-path attribute names the rootfile
 *   <rootfile>              — the actual MusicXML (score-partwise or similar)
 *
 * Throws with a descriptive message if the archive is malformed.
 */
export function extractXmlFromMxl(base64Content: string): string {
  const bytes = base64ToBytes(base64Content);
  const files = unzipSync(bytes);

  const containerBytes = files['META-INF/container.xml'];
  if (!containerBytes) throw new Error('Invalid .mxl: missing META-INF/container.xml');

  const containerXml = strFromU8(containerBytes);
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match?.[1]) throw new Error('Invalid .mxl: no rootfile full-path in container.xml');

  const rootPath = match[1];
  const rootBytes = files[rootPath];
  if (!rootBytes) throw new Error(`Invalid .mxl: rootfile "${rootPath}" not found in archive`);

  return strFromU8(rootBytes);
}
