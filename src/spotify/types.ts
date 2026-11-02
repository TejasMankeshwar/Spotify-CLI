export type PlayerState = 'playing' | 'paused' | 'stopped' | 'not_running';

export interface TrackInfo {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  durationFormatted: string;
  positionSec: number;
  positionFormatted: string;
  progressPercent: number;
  volume: number;
  state: PlayerState;
  isRepeating: boolean;
  isShuffling: boolean;
  spotifyUrl?: string;
  artworkUrl?: string;
}

export interface SearchItem {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  uri: string;
}

export interface LyricLine {
  timeSec: number;
  timeFormatted: string;
  text: string;
}

export interface LyricsResult {
  trackName: string;
  artistName: string;
  synced: boolean;
  lines: LyricLine[];
}

