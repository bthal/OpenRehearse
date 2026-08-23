// Mirror of `src/score-web/messageProtocol.ts` for the bundled web side, which cannot
// use the app's tsconfig path aliases. Keep the two in sync — they have drifted before.
import type { Bit } from '../../src/domain/bits';

export type InboundMessage =
  | { type: 'LOAD_XML'; payload: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'SET_TEMPO_BPM'; payload: number }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'TOGGLE_METRONOME' }
  | { type: 'SET_ACTIVE_HAND'; payload: 'both' | 'right' | 'left' }
  | { type: 'SET_COUNT_IN'; payload: number }
  | { type: 'SET_SECTIONS'; payload: { measures: number[]; colors: string[] } }
  | { type: 'SEEK_SECTION'; payload: -1 | 1 }
  | { type: 'SET_BITS'; payload: Bit[] }
  | { type: 'CREATE_BIT'; payload: { id: string } }
  | { type: 'LEAVE_BIT' };

export type OutboundMessage =
  | { type: 'LOADED' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DEBUG'; payload: string }
  | { type: 'SCORE_BPM'; payload: number }
  | { type: 'PLAYBACK_STATE'; payload: 'playing' | 'paused' | 'stopped' }
  | { type: 'PLAYBACK_END' }
  | { type: 'LOOP_STATE'; payload: boolean }
  | { type: 'SECTION_INDEX'; payload: number | null }
  | { type: 'SCORE_MOTION'; payload: boolean }
  | { type: 'BIT_CREATED'; payload: { id: string; startTicks: number; endTicks: number } }
  | { type: 'BIT_ENTERED'; payload: { id: string } | null }
  | { type: 'BIT_LIMIT_REACHED' }
  | { type: 'BIT_LONG_PRESSED'; payload: { id: string } };
