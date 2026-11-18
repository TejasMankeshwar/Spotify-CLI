import fs from 'node:fs';
import path from 'node:path';
import * as applescript from './applescript.ts';
import * as webPlayer from './web-player.ts';
import {
  isLibrespotInstalled,
  isDaemonRunning,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  getDaemonStatus,
  getLibrespotCacheDir,
  startLibrespotInteractiveAuth,
  startLibrespotOAuth,
} from './daemon.ts';
import { getValidUserToken, startInteractiveOAuthLogin, loadSavedAuth, clearSavedAuth } from './oauth.ts';
import { resolveSpotifyUri } from './search.ts';
import { loadLastSession, saveLastSession } from '../config.ts';
import type { TrackInfo } from './types.ts';

export type PlaybackEngine = 'applescript' | 'headless';

export interface PlayResult {
  success: boolean;
  state: 'already_playing' | 'resumed' | 'started' | 'no_track' | 'error';
  track?: TrackInfo | null;
  message: string;
}

export async function isSpotifyAppRunning(): Promise<boolean> {
  return applescript.isSpotifyRunning();
}

export const isSpotifyRunning = isSpotifyAppRunning;

/**
 * Checks whether playback is authenticated and ready to stream.
 * Requires valid Web API OAuth tokens or native runtime.
 */
export function isHeadlessReady(): boolean {
  // 1. Check for saved user OAuth tokens (Web API)
  const auth = loadSavedAuth();
  if (auth && (auth.accessToken || auth.refreshToken)) return true;

  // 2. On macOS, native runtime is always ready
  if (process.platform === 'darwin') return true;

  // 3. Otherwise check librespot credentials
  const cacheDir = getLibrespotCacheDir();
  const credsFile = path.join(cacheDir, 'system', 'credentials.json');
  return fs.existsSync(credsFile);
}

/**
 * Determines the active playback engine.
 * - If Spotify desktop app is running: uses 'applescript' (instant local control).
 * - If Spotify desktop app is closed: uses 'headless' (librespot or Web API daemon).
 */
export async function getActivePlaybackEngine(): Promise<PlaybackEngine> {
  const isRunning = await applescript.isSpotifyRunning();
  if (isRunning) {
    return 'applescript';
  }
  return 'headless';
}

export async function ensureHeadlessDaemonReady(): Promise<{ ready: boolean; error?: string }> {
  // If running on macOS, ensure background Spotify runtime is running
  if (process.platform === 'darwin') {
    try {
      const isAppRunning = await applescript.isSpotifyRunning();
      if (!isAppRunning) {
        await applescript.launchSpotify(true);
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch {}
    return { ready: true };
  }

  if (isDaemonRunning()) return { ready: true };
  if (!isLibrespotInstalled()) {
    return { ready: false, error: 'librespot is not installed. Install it with: brew install librespot' };
  }

  const cacheDir = getLibrespotCacheDir();
  const credsFile = path.join(cacheDir, 'system', 'credentials.json');
  if (!fs.existsSync(credsFile)) {
    return { ready: false, error: 'Spotify Premium authentication required for headless playback. Run /auth to link your account.' };
  }

  const res = startLibrespotDaemon();
  return { ready: res.success, error: res.message };
}

export async function getTrackInfo(): Promise<TrackInfo | null> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.getTrackInfo();
  }

  // Headless mode
  if (!isHeadlessReady()) {
    return null;
  }

  await ensureHeadlessDaemonReady();
  return webPlayer.getWebPlaybackState();
}

export async function play(uri?: string): Promise<PlayResult> {
  const engine = await getActivePlaybackEngine();

  // 1. Explicit URI requested: play it directly
  if (uri) {
    if (engine === 'applescript') {
      await applescript.playUri(uri);
      await new Promise((r) => setTimeout(r, 400));
      const track = await applescript.getTrackInfo();
      return {
        success: true,
        state: 'started',
        track,
        message: track ? `Playing: ${track.name} by ${track.artist}` : `Playing track`,
      };
    }

    if (!isHeadlessReady()) {
      return {
        success: false,
        state: 'error',
        message: 'Headless mode requires Spotify Premium authentication. Run /auth or spotify auth.',
      };
    }

    const daemonStatus = await ensureHeadlessDaemonReady();
    if (!daemonStatus.ready) {
      return {
        success: false,
        state: 'error',
        message: daemonStatus.error || 'Failed to initialize headless audio daemon.',
      };
    }

    const playRes = await webPlayer.webPlayDetailed(uri);
    let track: TrackInfo | null = null;
    if (playRes.success) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 250));
        track = await webPlayer.getWebPlaybackState();
        if (track && track.state === 'playing') break;
      }
    }
    return {
      success: playRes.success,
      state: playRes.success ? 'started' : 'error',
      track,
      message: playRes.success
        ? (track ? `Playing: ${track.name} by ${track.artist}` : 'Playing track')
        : (playRes.error || 'Failed to start playback on headless player.'),
    };
  }

  // 2. No URI: smart resume
  // A. Check if track is currently playing
  const current = await getTrackInfo();
  if (current && current.state === 'playing') {
    return {
      success: true,
      state: 'already_playing',
      track: current,
      message: `Already playing: ${current.name} by ${current.artist}`,
    };
  }

  // B. Check if a track is currently paused in memory
  if (current && current.state === 'paused') {
    if (engine === 'applescript') {
      try {
        await applescript.play();
      } catch {}
    } else {
      await webPlayer.webPlayDetailed();
    }

    let after: TrackInfo | null = null;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 200));
      after = await getTrackInfo();
      if (after && after.state === 'playing') break;
    }

    if (after && after.state === 'playing') {
      return {
        success: true,
        state: 'resumed',
        track: after,
        message: `Resumed: ${after.name} by ${after.artist}`,
      };
    }
  }

  // C. Spotify is closed or idle: restore from saved session (track + playlist context + seek position)
  const session = loadLastSession();
  if (session && session.trackUri) {
    if (process.platform === 'darwin') {
      try {
        const isRunning = await applescript.isSpotifyRunning();
        if (!isRunning) {
          await applescript.launchSpotify(true);
          await new Promise((r) => setTimeout(r, 600));
        }

        const positionSec = Math.floor(session.positionMs / 1000);
        await applescript.playInContext(session.trackUri, session.contextUri, positionSec, true);

        let after: TrackInfo | null = null;
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 200));
          after = await applescript.getTrackInfo();
          if (after && after.state === 'playing') break;
        }

        // If AppleScript didn't start playing, fallback to Web API
        if (!after || after.state !== 'playing') {
          await webPlayer.webPlayDetailed({
            uri: session.trackUri,
            contextUri: session.contextUri,
            positionMs: session.positionMs,
          });
          for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 200));
            after = await getTrackInfo();
            if (after && after.state === 'playing') break;
          }
        }

        if (after && positionSec > 2 && Math.abs(after.positionSec - positionSec) > 3) {
          try {
            await applescript.seek(positionSec);
            after.positionSec = positionSec;
            after.positionFormatted = applescript.formatTime(positionSec);
          } catch {}
        }

        const track = after || {
          id: session.trackUri,
          name: session.trackName,
          artist: session.artist,
          album: session.album,
          durationMs: session.durationMs,
          durationFormatted: applescript.formatTime(session.durationMs / 1000),
          positionSec,
          positionFormatted: applescript.formatTime(positionSec),
          progressPercent: session.durationMs > 0 ? (session.positionMs / session.durationMs) * 100 : 0,
          volume: 75,
          state: 'playing',
          isRepeating: false,
          isShuffling: false,
          contextUri: session.contextUri,
        };

        return {
          success: true,
          state: 'resumed',
          track,
          message: `Resumed: ${session.trackName} by ${session.artist}`,
        };
      } catch {}
    } else {
      // Non-macOS headless
      if (isHeadlessReady()) {
        await ensureHeadlessDaemonReady();
        const playRes = await webPlayer.webPlayDetailed({
          uri: session.trackUri,
          contextUri: session.contextUri,
          positionMs: session.positionMs,
        });

        if (playRes.success) {
          let after: TrackInfo | null = null;
          for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 250));
            after = await webPlayer.getWebPlaybackState();
            if (after && after.state === 'playing') break;
          }
          return {
            success: true,
            state: 'resumed',
            track: after,
            message: `Resumed: ${session.trackName} by ${session.artist}`,
          };
        }
      }
    }
  }

  // D. No track or session to resume
  return {
    success: false,
    state: 'no_track',
    message: 'No previous track to resume. Use: /play <song title>',
  };
}

export async function pause(): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.pause();
    return true;
  }

  return webPlayer.webPause();
}

export async function togglePlay(): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.togglePlay();
    return true;
  }

  if (!isHeadlessReady()) {
    await applescript.togglePlay();
    return true;
  }

  await ensureHeadlessDaemonReady();
  return webPlayer.webTogglePlay();
}

export async function next(): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.next();
    return true;
  }

  return webPlayer.webNext();
}

export async function previous(): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.previous();
    return true;
  }

  return webPlayer.webPrevious();
}

export async function setVolume(volume: number): Promise<number> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.setVolume(volume);
  }

  const clamped = Math.min(100, Math.max(0, volume));
  await webPlayer.webSetVolume(clamped);
  return clamped;
}

export async function adjustVolume(delta: number): Promise<number> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.adjustVolume(delta);
  }

  const current = await webPlayer.getWebPlaybackState();
  const curVol = current?.volume ?? 50;
  const newVol = Math.min(100, Math.max(0, curVol + delta));
  await webPlayer.webSetVolume(newVol);
  return newVol;
}

export async function seek(positionSec: number): Promise<applescript.SeekResult> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.seek(positionSec);
  }

  await webPlayer.webSeek(Math.floor(positionSec * 1000));
  const current = await webPlayer.getWebPlaybackState();
  const durSec = current ? Math.floor(current.durationMs / 1000) : 0;
  return {
    positionSec,
    durationSec: durSec,
    positionFormatted: applescript.formatTime(positionSec),
    durationFormatted: applescript.formatTime(durSec),
  };
}

export async function seekRelative(deltaSec: number): Promise<applescript.SeekResult> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.seekRelative(deltaSec);
  }

  const current = await webPlayer.getWebPlaybackState();
  const curSec = current?.positionSec ?? 0;
  const durSec = current ? Math.floor(current.durationMs / 1000) : 0;
  const targetSec = Math.max(0, Math.min(durSec, curSec + deltaSec));

  await webPlayer.webSeek(Math.floor(targetSec * 1000));
  return {
    positionSec: targetSec,
    durationSec: durSec,
    positionFormatted: applescript.formatTime(targetSec),
    durationFormatted: applescript.formatTime(durSec),
  };
}

export async function setShuffle(enabled?: boolean): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.setShuffle(enabled);
  }

  return webPlayer.webSetShuffle(enabled);
}

export async function setRepeat(enabled?: boolean): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.setRepeat(enabled);
  }

  return webPlayer.webSetRepeat(enabled ? 'context' : 'off');
}

export async function playUriDetailed(
  uri: string,
  inBackground = true,
  smooth = true
): Promise<{ success: boolean; error?: string }> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.playUri(uri, inBackground, smooth);
    return { success: true };
  }

  if (!isHeadlessReady()) {
    return {
      success: false,
      error: 'Headless mode requires Spotify Premium authentication. Run /auth or spotify auth.',
    };
  }

  const daemonStatus = await ensureHeadlessDaemonReady();
  if (!daemonStatus.ready) {
    return {
      success: false,
      error: daemonStatus.error || 'Headless audio daemon failed to start.',
    };
  }

  const webRes = await webPlayer.webPlayDetailed(uri);
  return {
    success: webRes.success,
    error: webRes.error,
  };
}

export async function playUri(uri: string, inBackground = true, smooth = true): Promise<boolean> {
  const res = await playUriDetailed(uri, inBackground, smooth);
  return res.success;
}

export async function playSearch(
  query: string,
  inBackground = true
): Promise<{ trackName: string; hasDirectUri: boolean; success: boolean; track?: TrackInfo | null; error?: string }> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    const res = await applescript.playSearch(query);
    let track: TrackInfo | null = null;
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 200));
      track = await applescript.getTrackInfo();
      if (track && track.state === 'playing') break;
    }
    return {
      trackName: track ? `${track.name} by ${track.artist}` : res.trackName,
      hasDirectUri: res.hasDirectUri,
      success: res.success || res.hasDirectUri,
      track,
    };
  }

  if (!isHeadlessReady()) {
    return {
      trackName: query,
      hasDirectUri: false,
      success: false,
      error: 'Headless mode requires Spotify Premium authentication. Run /auth or spotify auth.',
    };
  }

  const daemonStatus = await ensureHeadlessDaemonReady();
  if (!daemonStatus.ready) {
    return {
      trackName: query,
      hasDirectUri: false,
      success: false,
      error: daemonStatus.error || 'Headless audio daemon failed to start.',
    };
  }

  const uri = await resolveSpotifyUri(query);
  if (uri) {
    const playRes = await webPlayer.webPlayDetailed(uri);
    let track: TrackInfo | null = null;
    if (playRes.success) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 250));
        track = await webPlayer.getWebPlaybackState();
        if (track && track.state === 'playing') break;
      }
    }
    return {
      trackName: track ? `${track.name} by ${track.artist}` : query,
      hasDirectUri: true,
      success: playRes.success,
      track,
      error: playRes.error,
    };
  }

  return {
    trackName: query,
    hasDirectUri: false,
    success: false,
    error: `Could not find a matching track for "${query}". Try: /search ${query}`,
  };
}

// Re-exports of common utility helpers
export {
  parseVolumeInput,
  parseSeekInput,
  formatTime,
  launchSpotify,
  playInContext,
} from './applescript.ts';

export {
  isLibrespotInstalled,
  isDaemonRunning,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  getDaemonStatus,
  getLibrespotCacheDir,
  startLibrespotInteractiveAuth,
  startLibrespotOAuth,
} from './daemon.ts';

export {
  getValidUserToken,
  startInteractiveOAuthLogin,
  loadSavedAuth,
  clearSavedAuth,
} from './oauth.ts';
