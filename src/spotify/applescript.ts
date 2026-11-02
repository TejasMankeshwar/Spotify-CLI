import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackInfo, PlayerState } from './types.ts';

const execFileAsync = promisify(execFile);

const DELIMITER = '|||';

export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 5000,
    });
    return stdout.trim();
  } catch (error: any) {
    if (error.stderr) {
      throw new Error(error.stderr.trim());
    }
    throw error;
  }
}

export async function isSpotifyRunning(): Promise<boolean> {
  try {
    const res = await runAppleScript('application "Spotify" is running');
    return res === 'true';
  } catch {
    return false;
  }
}

export async function launchSpotify(): Promise<void> {
  await runAppleScript('tell application "Spotify" to activate');
}

export function formatTime(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function getTrackInfo(): Promise<TrackInfo | null> {
  const isRunning = await isSpotifyRunning();
  if (!isRunning) {
    return null;
  }

  // Single batch AppleScript query for maximum performance and atomic state
  const script = `
tell application "Spotify"
  if not (exists current track) then
    return "NO_TRACK"
  end if
  set pState to player state as string
  set pPos to player position as integer
  set pVol to sound volume as integer
  set pShuf to shuffling as boolean
  set pRep to repeating as boolean
  
  set tName to name of current track
  set tArtist to artist of current track
  set tAlbum to album of current track
  set tDuration to duration of current track
  set tUrl to spotify url of current track
  set tId to id of current track
  
  return pState & "${DELIMITER}" & pPos & "${DELIMITER}" & pVol & "${DELIMITER}" & pShuf & "${DELIMITER}" & pRep & "${DELIMITER}" & tName & "${DELIMITER}" & tArtist & "${DELIMITER}" & tAlbum & "${DELIMITER}" & tDuration & "${DELIMITER}" & tUrl & "${DELIMITER}" & tId
end tell
`;

  try {
    const raw = await runAppleScript(script);
    if (raw === 'NO_TRACK' || !raw.includes(DELIMITER)) {
      return null;
    }

    const parts = raw.split(DELIMITER);
    const stateStr = parts[0]?.toLowerCase() || 'stopped';
    const state: PlayerState =
      stateStr === 'playing' ? 'playing' : stateStr === 'paused' ? 'paused' : 'stopped';

    const positionSec = parseInt(parts[1], 10) || 0;
    const volume = parseInt(parts[2], 10) || 0;
    const isShuffling = parts[3] === 'true';
    const isRepeating = parts[4] === 'true';
    const name = parts[5] || 'Unknown Track';
    const artist = parts[6] || 'Unknown Artist';
    const album = parts[7] || 'Unknown Album';
    const durationMs = parseInt(parts[8], 10) || 0;
    const spotifyUrl = parts[9] || '';
    const id = parts[10] || '';

    const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
    const progressPercent = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0;

    return {
      id,
      name,
      artist,
      album,
      durationMs,
      durationFormatted: formatTime(durationSec),
      positionSec,
      positionFormatted: formatTime(positionSec),
      progressPercent,
      volume,
      state,
      isRepeating,
      isShuffling,
      spotifyUrl,
    };
  } catch (err: any) {
    return null;
  }
}

export async function play(): Promise<void> {
  await runAppleScript('tell application "Spotify" to play');
}

export async function pause(): Promise<void> {
  await runAppleScript('tell application "Spotify" to pause');
}

export async function togglePlay(): Promise<void> {
  await runAppleScript('tell application "Spotify" to playpause');
}

export async function next(): Promise<void> {
  await runAppleScript('tell application "Spotify" to next track');
}

export async function previous(): Promise<void> {
  await runAppleScript('tell application "Spotify" to previous track');
}

export async function setVolume(vol: number): Promise<number> {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)));
  await runAppleScript(`tell application "Spotify" to set sound volume to ${clamped}`);
  return clamped;
}

export async function adjustVolume(delta: number): Promise<number> {
  const info = await getTrackInfo();
  const currentVol = info?.volume ?? 50;
  return await setVolume(currentVol + delta);
}

export async function seek(seconds: number): Promise<void> {
  const pos = Math.max(0, Math.round(seconds));
  await runAppleScript(`tell application "Spotify" to set player position to ${pos}`);
}

export async function setShuffle(enabled?: boolean): Promise<boolean> {
  if (enabled === undefined) {
    const script = `
tell application "Spotify"
  set shuffling to not shuffling
  return shuffling
end tell`;
    const res = await runAppleScript(script);
    return res === 'true';
  } else {
    await runAppleScript(`tell application "Spotify" to set shuffling to ${enabled}`);
    return enabled;
  }
}

export async function setRepeat(enabled?: boolean): Promise<boolean> {
  if (enabled === undefined) {
    const script = `
tell application "Spotify"
  set repeating to not repeating
  return repeating
end tell`;
    const res = await runAppleScript(script);
    return res === 'true';
  } else {
    await runAppleScript(`tell application "Spotify" to set repeating to ${enabled}`);
    return enabled;
  }
}

export async function playUri(uri: string): Promise<void> {
  const cleanUri = uri.trim();
  await runAppleScript(`tell application "Spotify" to play track "${cleanUri}"`);
}

export async function playSearch(query: string): Promise<void> {
  const cleanQuery = query.trim().replace(/"/g, '\\"');
  await runAppleScript(`tell application "Spotify" to play track "spotify:search:${cleanQuery}"`);
}

