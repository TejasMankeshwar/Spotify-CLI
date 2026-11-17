import * as applescript from './applescript.ts';
import * as webPlayer from './web-player.ts';
import {
  isLibrespotInstalled,
  isDaemonRunning,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  getDaemonStatus,
} from './daemon.ts';
import { getValidUserToken, startInteractiveOAuthLogin } from './oauth.ts';
import { resolveSpotifyUri } from './search.ts';
import type { TrackInfo } from './types.ts';

export type PlaybackEngine = 'applescript' | 'headless';

export async function isSpotifyAppRunning(): Promise<boolean> {
  return applescript.isSpotifyRunning();
}

export async function getActivePlaybackEngine(): Promise<PlaybackEngine> {
  if (await applescript.isSpotifyRunning()) {
    return 'applescript';
  }
  return 'headless';
}

export async function ensureHeadlessDaemonReady(): Promise<boolean> {
  if (isDaemonRunning()) return true;
  if (!isLibrespotInstalled()) return false;
  const res = startLibrespotDaemon();
  if (res.success) {
    // Give daemon 300ms to initialize audio sink and register
    await new Promise((r) => setTimeout(r, 300));
    return true;
  }
  return false;
}

export async function getTrackInfo(): Promise<TrackInfo | null> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.getTrackInfo();
  }

  // Headless mode
  await ensureHeadlessDaemonReady();
  const info = await webPlayer.getWebPlaybackState();
  if (info) return info;

  // Fallback to applescript if web player returned nothing
  return applescript.getTrackInfo();
}

export async function play(uri?: string): Promise<boolean> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.play(uri);
    return true;
  }

  await ensureHeadlessDaemonReady();
  return webPlayer.webPlay(uri);
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

export async function playUri(uri: string, inBackground = true, smooth = true): Promise<void> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    await applescript.playUri(uri, inBackground, smooth);
    return;
  }

  await ensureHeadlessDaemonReady();
  await webPlayer.webPlay(uri);
}

export async function playSearch(
  query: string,
  inBackground = true
): Promise<{ trackName: string; hasDirectUri: boolean }> {
  const engine = await getActivePlaybackEngine();
  if (engine === 'applescript') {
    return applescript.playSearch(query, inBackground);
  }

  await ensureHeadlessDaemonReady();
  const uri = await resolveSpotifyUri(query);
  if (uri) {
    await webPlayer.webPlay(uri);
    return { trackName: query, hasDirectUri: true };
  }

  return { trackName: query, hasDirectUri: false };
}

// Re-exports of common utility helpers
export {
  parseVolumeInput,
  parseSeekInput,
  formatTime,
  launchSpotify,
} from './applescript.ts';

export {
  isLibrespotInstalled,
  isDaemonRunning,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  getDaemonStatus,
} from './daemon.ts';

export {
  getValidUserToken,
  startInteractiveOAuthLogin,
  loadSavedAuth,
  clearSavedAuth,
} from './oauth.ts';
