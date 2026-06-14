export type InboundMessage = { type: 'LOAD_XML'; payload: string };

export type OutboundMessage =
  | { type: 'LOADED' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DEBUG'; payload: string };
