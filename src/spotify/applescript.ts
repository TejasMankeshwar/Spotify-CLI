import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackInfo, PlayerState } from './types.ts';
import { searchTracks, resolveSpotifyUri } from './search.ts';

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

  // Single atomic AppleScript query for maximum performance and reliability
  const script = `
tell application "Spotify"
  try
    set tName to name of current track
    set tArtist to artist of current track
    set tAlbum to album of current track
    set tDuration to duration of current track
    set tUrl to spotify url of current track
    set tId to id of current track
    set pState to player state as string
    set pPos to player position as integer
    set pVol to sound volume as integer
    set pShuf to shuffling as boolean
    set pRep to repeating as boolean
    return pState & "${DELIMITER}" & pPos & "${DELIMITER}" & pVol & "${DELIMITER}" & pShuf & "${DELIMITER}" & pRep & "${DELIMITER}" & tName & "${DELIMITER}" & tArtist & "${DELIMITER}" & tAlbum & "${DELIMITER}" & tDuration & "${DELIMITER}" & tUrl & "${DELIMITER}" & tId
  on error
    return "NO_TRACK"
  end try
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
  const script = `
tell application "Spotify"
  try
    if player state is paused then
      set curVol to sound volume
      set sound volume to (round (curVol / 2))
      play
      repeat with v from (round (curVol / 2)) to curVol by 10
        set sound volume to v
        delay 0.012
      end repeat
      set sound volume to curVol
    else
      play
    end if
  on error
    play
  end try
end tell`;
  await runAppleScript(script);
}

export async function pause(): Promise<void> {
  const script = `
tell application "Spotify"
  try
    if player state is playing then
      set curVol to sound volume
      repeat with v from (curVol - 20) to 0 by -20
        set sound volume to v
        delay 0.01
      end repeat
      pause
      set sound volume to curVol
    else
      pause
    end if
  on error
    pause
  end try
end tell`;
  await runAppleScript(script);
}

export async function togglePlay(): Promise<void> {
  const script = `
tell application "Spotify"
  try
    if player state is playing then
      set curVol to sound volume
      repeat with v from (curVol - 20) to 0 by -20
        set sound volume to v
        delay 0.01
      end repeat
      pause
      set sound volume to curVol
    else
      set curVol to sound volume
      set sound volume to (round (curVol / 2))
      play
      repeat with v from (round (curVol / 2)) to curVol by 10
        set sound volume to v
        delay 0.012
      end repeat
      set sound volume to curVol
    end if
  on error
    playpause
  end try
end tell`;
  await runAppleScript(script);
}

export async function next(): Promise<void> {
  const script = `
tell application "Spotify"
  try
    if player state is playing then
      set curVol to sound volume
      repeat with v from (curVol - 25) to 0 by -25
        set sound volume to v
        delay 0.01
      end repeat
      next track
      repeat with v from (round (curVol / 3)) to curVol by 15
        set sound volume to v
        delay 0.012
      end repeat
      set sound volume to curVol
    else
      next track
    end if
  on error
    next track
  end try
end tell`;
  await runAppleScript(script);
}

export async function previous(): Promise<void> {
  const script = `
tell application "Spotify"
  try
    if player state is playing then
      set curVol to sound volume
      repeat with v from (curVol - 25) to 0 by -25
        set sound volume to v
        delay 0.01
      end repeat
      previous track
      repeat with v from (round (curVol / 3)) to curVol by 15
        set sound volume to v
        delay 0.012
      end repeat
      set sound volume to curVol
    else
      previous track
    end if
  on error
    previous track
  end try
end tell`;
  await runAppleScript(script);
}

export type VolumeInstruction = { type: 'set'; value: number } | { type: 'adjust'; delta: number };

export function parseVolumeInput(input: string): VolumeInstruction {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { type: 'set', value: 50 };
  if (trimmed === 'mute') return { type: 'set', value: 0 };
  if (trimmed === 'max') return { type: 'set', value: 100 };

  const tokens = trimmed.split(/\s+/);
  let totalDelta = 0;
  let hasDelta = false;

  for (const token of tokens) {
    if (/^\++$/.test(token)) {
      totalDelta += token.length * 5;
      hasDelta = true;
    } else if (/^-+$/.test(token)) {
      totalDelta -= token.length * 5;
      hasDelta = true;
    } else if (token === 'up') {
      totalDelta += 5;
      hasDelta = true;
    } else if (token === 'down') {
      totalDelta -= 5;
      hasDelta = true;
    } else if (token.startsWith('+') || token.startsWith('-')) {
      const num = parseInt(token, 10);
      if (!isNaN(num)) {
        totalDelta += num;
        hasDelta = true;
      }
    }
  }

  if (hasDelta) {
    return { type: 'adjust', delta: totalDelta };
  }

  const absolute = parseInt(tokens[0], 10);
  return { type: 'set', value: isNaN(absolute) ? 50 : absolute };
}

let volumeQueue = Promise.resolve(0);

export async function setVolume(vol: number): Promise<number> {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)));
  volumeQueue = volumeQueue.then(async () => {
    await runAppleScript(`tell application "Spotify" to set sound volume to ${clamped}`);
    return clamped;
  }).catch(() => clamped);
  return volumeQueue;
}

export async function adjustVolume(delta: number): Promise<number> {
  const step = Math.round(delta);
  volumeQueue = volumeQueue.then(async () => {
    const script = `
tell application "Spotify"
  set curVol to sound volume
  set newVol to curVol + (${step})
  if newVol > 100 then set newVol to 100
  if newVol < 0 then set newVol to 0
  set sound volume to newVol
  return newVol
end tell`;
    const res = await runAppleScript(script);
    return parseInt(res, 10) || 0;
  }).catch(() => 0);
  return volumeQueue;
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

export async function playUri(uri: string, inBackground = true, smooth = true): Promise<void> {
  const cleanUri = uri.trim();
  if (smooth) {
    const script = `
tell application "Spotify"
  set isPl to false
  try
    if player state is playing then set isPl to true
  end try
  if isPl then
    set curVol to sound volume
    set stepOut to round (curVol / 5)
    if stepOut < 1 then set stepOut to 1
    repeat with v from (curVol - stepOut) to 0 by (-stepOut)
      set sound volume to v
      delay 0.012
    end repeat
    set sound volume to 0
    play track "${cleanUri}"
    try
      tell application "System Events" to set visible of process "Spotify" to false
    end try
    set stepIn to round (curVol / 6)
    if stepIn < 1 then set stepIn to 1
    repeat with v from stepIn to curVol by stepIn
      set sound volume to v
      delay 0.015
    end repeat
    set sound volume to curVol
  else
    play track "${cleanUri}"
    try
      tell application "System Events" to set visible of process "Spotify" to false
    end try
  end if
end tell`;
    await runAppleScript(script);
  } else if (inBackground) {
    const script = `
tell application "Spotify" to play track "${cleanUri}"
try
  tell application "System Events" to set visible of process "Spotify" to false
end try`;
    await runAppleScript(script);
  } else {
    await runAppleScript(`tell application "Spotify" to play track "${cleanUri}"`);
  }
}

export interface PlaySearchResult {
  success: boolean;
  trackName: string;
  hasDirectUri: boolean;
}

export async function playSearch(query: string): Promise<PlaySearchResult> {
  const cleanQuery = query.trim();

  // 1. Try fast direct resolution (cache + Genius + Spotify API)
  try {
    const directUri = await resolveSpotifyUri(cleanQuery);
    if (directUri) {
      await playUri(directUri, true);
      return {
        success: true,
        trackName: cleanQuery,
        hasDirectUri: true,
      };
    }
  } catch {}

  // 2. Structured catalog search (Deezer/iTunes -> Spotify URI)
  try {
    const results = await searchTracks(cleanQuery, 1);
    if (results.length > 0) {
      let targetUri = results[0].uri;
      if (!targetUri) {
        targetUri = (await resolveSpotifyUri(results[0].name, results[0].artist, results[0].isrc)) || '';
      }
      if (targetUri) {
        await playUri(targetUri, true);
        return {
          success: true,
          trackName: `${results[0].name} by ${results[0].artist}`,
          hasDirectUri: true,
        };
      }
    }
  } catch {}

  // 3. Fallback to Spotify URI search in background with URL-encoded query so spaces are preserved
  const encodedQuery = encodeURIComponent(cleanQuery);
  const fallbackScript = `
tell application "Spotify" to play track "spotify:search:${encodedQuery}"
try
  tell application "System Events" to set visible of process "Spotify" to false
end try`;
  await runAppleScript(fallbackScript);
  return {
    success: false,
    trackName: cleanQuery,
    hasDirectUri: false,
  };
}

