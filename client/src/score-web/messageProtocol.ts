export type NativeToWebMessage =
  | { type: 'LOAD_XML'; payload: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'SET_TEMPO_BPM'; payload: number }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'TOGGLE_METRONOME' }
  | { type: 'SET_ACTIVE_HAND'; payload: 'both' | 'right' | 'left' };

export type WebToNativeMessage =
  | { type: 'LOADED' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DEBUG'; payload: string }
  | { type: 'SCORE_BPM'; payload: number }
  | { type: 'PLAYBACK_STATE'; payload: 'playing' | 'paused' | 'stopped' }
  | { type: 'PLAYBACK_END' }
  | { type: 'LOOP_STATE'; payload: boolean };
