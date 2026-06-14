export type NativeToWebMessage = { type: 'LOAD_XML'; payload: string };

export type WebToNativeMessage =
  | { type: 'LOADED' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DEBUG'; payload: string };
