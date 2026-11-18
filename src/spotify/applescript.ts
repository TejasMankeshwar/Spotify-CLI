import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackInfo, PlayerState } from './types.ts';
import { searchTracks, resolveSpotifyUri } from './search.ts';
import { saveLastSession, loadLastSession } from '../config.ts';

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

let lastRunningCheck = 0;
let lastRunningResult = false;

export async function isSpotifyRunning(): Promise<boolean> {
  const now = Date.now();
  if (now - lastRunningCheck < 350) {
    return lastRunningResult;
  }

  try {
    const res = await runAppleScript(`
tell application "System Events"
  set isRunning to (exists (processes where name is "Spotify"))
  if isRunning then return "true"
end tell
try
  if application "Spotify" is running then return "true"
end try
return "false"`);
    lastRunningResult = res.toLowerCase().includes('true');
  } catch {
    lastRunningResult = false;
  }
  lastRunningCheck = Date.now();
  return lastRunningResult;
}

export async function dismissSpotifyWindow(): Promise<void> {
  try {
    await runAppleScript(`
tell application "System Events"
  tell process "Spotify"
    try
      click button 1 of window 1
    end try
  end tell
end tell`);
  } catch {}
}

export async function getSpotifyWindowCount(): Promise<number> {
  try {
    const res = await runAppleScript(`
tell application "System Events"
  if exists (processes where name is "Spotify") then
    return count of windows of process "Spotify"
  end if
  return "0"
end tell`);
    return parseInt(res, 10) || 0;
  } catch {
    return 0;
  }
}

export async function launchSpotify(hidden = true): Promise<void> {
  try {
    if (hidden) {
      try {
        await execFileAsync('open', ['-j', '-g', '-a', '/Applications/Spotify.app', '--args', '--minimized']);
      } catch {
        await runAppleScript('tell application "Spotify" to launch');
      }
      await new Promise((r) => setTimeout(r, 450));
      await dismissSpotifyWindow();
    } else {
      await runAppleScript('tell application "Spotify" to activate');
    }
  } catch {}
}

export function formatTime(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function getTrackInfo(): Promise<TrackInfo | null> {
  // Single atomic AppleScript query with zero separate running-check overhead
  const script = `
tell application "System Events"
  set isRunning to (exists (processes where name is "Spotify"))
  if not isRunning then return "NOT_RUNNING"
end tell

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
    if (raw === 'NOT_RUNNING' || raw === 'NO_TRACK' || !raw.includes(DELIMITER)) {
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

    const trackInfo: TrackInfo = {
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

    if (id && (state === 'playing' || state === 'paused')) {
      const trackUri = id.startsWith('spotify:') ? id : `spotify:track:${id}`;
      saveLastSession({
        trackUri,
        trackName: name,
        artist,
        album,
        positionMs: positionSec * 1000,
        durationMs,
      });
    }

    return trackInfo;
  } catch (err: any) {
    return null;
  }
}

export async function play(): Promise<void> {
  const isRunning = await isSpotifyRunning();
  if (!isRunning) {
    return;
  }

  const script = `
tell application "Spotify"
  try
    set curVol to sound volume
    if curVol < 20 then
      set sound volume to 75
    end if
    «event spfyPlay»
  on error
    try
      play
    end try
  end try
end tell`;
  try {
    await runAppleScript(script);
  } catch {}
}

export async function pause(): Promise<void> {
  try {
    const cur = await getTrackInfo();
    if (cur && cur.id) {
      const trackUri = cur.id.startsWith('spotify:') ? cur.id : `spotify:track:${cur.id}`;
      saveLastSession({
        trackUri,
        trackName: cur.name,
        artist: cur.artist,
        album: cur.album,
        positionMs: cur.positionSec * 1000,
        durationMs: cur.durationMs,
      });
    }
  } catch {}

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
      if (curVol mod 20) is not 0 and curVol < 100 and curVol > 0 then
        set sound volume to (curVol + 1)
      else
        set sound volume to curVol
      end if
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
      if (curVol mod 20) is not 0 and curVol < 100 and curVol > 0 then
        set sound volume to (curVol + 1)
      else
        set sound volume to curVol
      end if
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
      if (curVol mod 20) is not 0 and curVol < 100 and curVol > 0 then
        set sound volume to (curVol + 1)
      else
        set sound volume to curVol
      end if
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
    const script = `
tell application "Spotify"
  set targetVol to ${clamped}
  if targetVol <= 0 then
    set sound volume to 0
    return 0
  else if targetVol >= 100 then
    set sound volume to 100
    return 100
  end if
  if (targetVol mod 20) is not 0 then
    set setVal to targetVol + 1
    if setVal > 100 then set setVal to 100
    set sound volume to setVal
  else
    set sound volume to targetVol
  end if
  return sound volume
end tell`;
    const res = await runAppleScript(script);
    return parseInt(res, 10) || clamped;
  }).catch(() => clamped);
  return volumeQueue;
}

export async function adjustVolume(delta: number): Promise<number> {
  const step = Math.round(delta);
  volumeQueue = volumeQueue.then(async () => {
    const script = `
tell application "Spotify"
  set curVol to sound volume
  set targetVol to curVol + (${step})
  if targetVol > 100 then set targetVol to 100
  if targetVol < 0 then set targetVol to 0
  if targetVol <= 0 then
    set sound volume to 0
    return 0
  else if targetVol >= 100 then
    set sound volume to 100
    return 100
  end if
  if (targetVol mod 20) is not 0 then
    set setVal to targetVol + 1
    if setVal > 100 then set setVal to 100
    set sound volume to setVal
  else
    set sound volume to targetVol
  end if
  return sound volume
end tell`;
    const res = await runAppleScript(script);
    return parseInt(res, 10) || 0;
  }).catch(() => 0);
  return volumeQueue;
}

export type SeekInstruction =
  | { type: 'relative'; delta: number; raw: string }
  | { type: 'absolute'; target: number; raw: string };

export interface SeekResult {
  positionSec: number;
  durationSec: number;
  positionFormatted: string;
  durationFormatted: string;
}

export function parseSeekInput(input: string): SeekInstruction {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'absolute', target: 0, raw: '0' };
  }

  // Check for relative prefix: +, -, or keywords "forward", "ahead", "back", "rewind"
  let isRelative = false;
  let sign = 1;
  let rest = trimmed;

  if (rest.startsWith('+')) {
    isRelative = true;
    sign = 1;
    rest = rest.slice(1).trim();
  } else if (rest.startsWith('-')) {
    isRelative = true;
    sign = -1;
    rest = rest.slice(1).trim();
  } else if (/^(forward|ahead|next)\b/i.test(rest)) {
    isRelative = true;
    sign = 1;
    rest = rest.replace(/^(forward|ahead|next)\s*/i, '').trim();
  } else if (/^(back|backward|rewind|prev)\b/i.test(rest)) {
    isRelative = true;
    sign = -1;
    rest = rest.replace(/^(back|backward|rewind|prev)\s*/i, '').trim();
  }

  // Parse time specification: mm:ss, hh:mm:ss, or seconds with optional s/m units
  let seconds = 0;

  if (rest.includes(':')) {
    const parts = rest.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      seconds = parts[0];
    }
  } else if (/[a-zA-Z]/.test(rest)) {
    const mMatch = rest.match(/(\d+)\s*m/i);
    const sMatch = rest.match(/(\d+)\s*s/i);
    const m = mMatch ? parseInt(mMatch[1], 10) : 0;
    const s = sMatch ? parseInt(sMatch[1], 10) : 0;
    seconds = m * 60 + s;
    if (!mMatch && !sMatch) {
      seconds = parseInt(rest, 10) || 0;
    }
  } else {
    seconds = parseInt(rest, 10) || 0;
  }

  if (isRelative) {
    return {
      type: 'relative',
      delta: sign * seconds,
      raw: trimmed,
    };
  }

  return {
    type: 'absolute',
    target: seconds,
    raw: trimmed,
  };
}

export async function seek(seconds: number): Promise<SeekResult> {
  const pos = Math.max(0, Math.round(seconds));
  const script = `
tell application "Spotify"
  set durMs to 0
  try
    set durMs to duration of current track
  end try
  set durSec to round (durMs / 1000)
  set targetPos to ${pos}
  if durSec > 1 and targetPos > durSec then set targetPos to durSec
  set player position to targetPos
  return ("" & targetPos & "|||" & durSec)
end tell`;
  const res = await runAppleScript(script);
  const parts = res.split('|||');
  const positionSec = parseInt(parts[0], 10) || pos;
  const durationSec = parseInt(parts[1], 10) || 0;
  return {
    positionSec,
    durationSec,
    positionFormatted: formatTime(positionSec),
    durationFormatted: formatTime(durationSec),
  };
}

export async function seekRelative(deltaSeconds: number): Promise<SeekResult> {
  const delta = Math.round(deltaSeconds);
  const script = `
tell application "Spotify"
  set curPos to player position
  set durMs to 0
  try
    set durMs to duration of current track
  end try
  set durSec to round (durMs / 1000)
  set newPos to (round curPos) + (${delta})
  if newPos < 0 then set newPos to 0
  if durSec > 1 and newPos > durSec then set newPos to durSec
  set player position to newPos
  return ("" & newPos & "|||" & durSec)
end tell`;
  const res = await runAppleScript(script);
  const parts = res.split('|||');
  const positionSec = parseInt(parts[0], 10) || 0;
  const durationSec = parseInt(parts[1], 10) || 0;
  return {
    positionSec,
    durationSec,
    positionFormatted: formatTime(positionSec),
    durationFormatted: formatTime(durationSec),
  };
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

export async function playInContext(
  trackUri: string,
  contextUri?: string,
  positionSec?: number,
  inBackground = true
): Promise<void> {
  const isRunning = await isSpotifyRunning();
  if (!isRunning) {
    await launchSpotify(inBackground);
    await new Promise((r) => setTimeout(r, 600));
  }

  const bgSnippet = inBackground
    ? `\ntry\n  tell application "System Events"\n    tell process "Spotify"\n      click button 1 of window 1\n    end tell\n  end tell\nend try`
    : '';

  const seekSnippet =
    typeof positionSec === 'number' && positionSec > 0
      ? `\ntry\n  delay 0.35\n  set player position to ${Math.round(positionSec)}\nend try`
      : '';

  let script: string;
  if (contextUri) {
    script = `
tell application "Spotify"
  try
    play track "${trackUri}" in context "${contextUri}"
  on error
    try
      play track "${trackUri}"
    on error
      «event spfyPCtx» "${trackUri}"
    end try
  end try${seekSnippet}
  try
    if sound volume < 20 then set sound volume to 75
  end try
end tell${bgSnippet}`;
  } else {
    script = `
tell application "Spotify"
  try
    play track "${trackUri}"
  on error
    «event spfyPCtx» "${trackUri}"
  end try${seekSnippet}
  try
    if sound volume < 20 then set sound volume to 75
  end try
end tell${bgSnippet}`;
  }

  try {
    await runAppleScript(script);
  } catch {}
  if (inBackground) {
    await dismissSpotifyWindow();
  }
}

export async function playUri(uri: string, inBackground = true): Promise<void> {
  const cleanUri = uri.trim();

  // If Spotify is not currently running, launch it silently in the background
  const isRunning = await isSpotifyRunning();
  if (!isRunning) {
    await launchSpotify(inBackground);
    await new Promise((r) => setTimeout(r, 600));
  }

  const bgSnippet = inBackground
    ? `\ntry\n  tell application "System Events"\n    tell process "Spotify"\n      click button 1 of window 1\n    end tell\n  end tell\nend try`
    : '';

  // Use raw AppleEvent spfyPCtx to guarantee 100% clean compilation
  const script = `
tell application "Spotify"
  try
    «event spfyPCtx» "${cleanUri}"
  on error
    try
      open location "${cleanUri}"
    end try
  end try
  try
    if sound volume < 20 then
      set sound volume to 75
    end if
  end try
end tell${bgSnippet}`;

  try {
    await runAppleScript(script);
  } catch {}
  if (inBackground) {
    await dismissSpotifyWindow();
  }
}

export interface PlaySearchResult {
  success: boolean;
  trackName: string;
  hasDirectUri: boolean;
}

export async function playSearch(query: string): Promise<PlaySearchResult> {
  const cleanQuery = query.trim();

  // If input is already a Spotify URI or link
  if (cleanQuery.startsWith('spotify:')) {
    await playUri(cleanQuery, true);
    return {
      success: true,
      trackName: cleanQuery,
      hasDirectUri: true,
    };
  }
  const linkMatch = cleanQuery.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (linkMatch) {
    const uri = `spotify:track:${linkMatch[1]}`;
    await playUri(uri, true);
    return {
      success: true,
      trackName: uri,
      hasDirectUri: true,
    };
  }

  // 1. Structured catalog search (Deezer/iTunes/Spotify) to get proper name and artist
  try {
    const results = await searchTracks(cleanQuery, 3);
    if (results.length > 0) {
      for (const item of results) {
        let targetUri = item.uri;
        if (!targetUri) {
          targetUri = (await resolveSpotifyUri(item.name, item.artist, item.isrc)) || '';
        }
        if (targetUri) {
          await playUri(targetUri, true);
          return {
            success: true,
            trackName: `${item.name} by ${item.artist}`,
            hasDirectUri: true,
          };
        }
      }
    }
  } catch {}

  // 2. Direct URI resolution (cache, Genius, MusicBrainz)
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

  return {
    success: false,
    trackName: cleanQuery,
    hasDirectUri: false,
  };
}

