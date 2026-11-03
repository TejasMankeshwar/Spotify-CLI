import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { getTheme } from '../theme.ts';
import { cursor, bold, dim, stringWidth } from './ansi.ts';
import { getTrackInfo, pause, play, playUri, setVolume, runAppleScript, type TrackInfo } from '../spotify/applescript.ts';
import { searchTracks, resolveSpotifyUri, type SearchResultItem } from '../spotify/search.ts';

// Cache directory for downloaded preview audio files
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), 'spotify_cli_previews');
if (!fs.existsSync(PREVIEW_CACHE_DIR)) {
  try {
    fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true });
  } catch {}
}

async function getLocalPreviewFile(item: SearchResultItem): Promise<string | null> {
  if (!item.previewUrl) return null;

  const safeId = item.id.replace(/[^a-zA-Z0-9]/g, '_');
  const ext = item.previewUrl.includes('.mp3') ? '.mp3' : '.m4a';
  const filePath = path.join(PREVIEW_CACHE_DIR, `preview_${safeId}${ext}`);

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
    return filePath;
  }

  try {
    const res = await fetch(item.previewUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  } catch {
    return null;
  }
}

export async function runSearchPicker(query: string): Promise<SearchResultItem | null> {
  const theme = getTheme();
  const stdout = process.stdout;
  const stdin = process.stdin;

  stdout.write(`  ${theme.primary(theme.symbol)} Searching for "${bold(query)}"... \r`);
  const items = await searchTracks(query, 8);

  cursor.clearLine();
  if (items.length === 0) {
    stdout.write(`  ${theme.paused('✖')} No results found for "${query}".\n\n`);
    return null;
  }

  // Pre-fetch preview files in background so audio is available immediately
  items.forEach((item) => {
    if (item.previewUrl) {
      getLocalPreviewFile(item).catch(() => {});
    }
  });

  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  cursor.hide();

  // Capture original playback state at the very start of the search session
  const initialInfo = await getTrackInfo();
  let sessionOriginalTrack: {
    uri: string;
    position: number;
    wasPlaying: boolean;
    volume: number;
  } | null = initialInfo
    ? {
        uri: initialInfo.spotifyUrl || initialInfo.id,
        position: initialInfo.positionSec,
        wasPlaying: initialInfo.state === 'playing',
        volume: initialInfo.volume > 20 ? initialInfo.volume : 75,
      }
    : null;

  let selectedIndex = 0;
  let isRunning = true;
  let previousLineCount = 0;
  let previewProcess: ChildProcess | null = null;

  // Space-and-hold state
  let isSpaceHeld = false;
  let spaceTimer: NodeJS.Timeout | null = null;
  let isPreviewActive = false;
  let isPreviewLoading = false;
  let isRestoring = false;

  const restoreOriginalState = async () => {
    if (isRestoring) return;
    isRestoring = true;

    if (previewProcess) {
      try {
        previewProcess.kill('SIGKILL');
      } catch {}
      previewProcess = null;
    }

    isPreviewActive = false;
    isPreviewLoading = false;

    try {
      if (sessionOriginalTrack && sessionOriginalTrack.uri) {
        const targetUri = sessionOriginalTrack.uri;
        const targetPos = Math.max(0, sessionOriginalTrack.position);
        const targetVol = sessionOriginalTrack.volume > 20 ? sessionOriginalTrack.volume : 75;

        if (sessionOriginalTrack.wasPlaying) {
          // Continuous seamless crossfade: quick preview taper -> instantaneous background swap -> immediate verified seek -> rapid swell
          const script = `
tell application "Spotify"
  set targetVol to ${targetVol}
  set curVol to sound volume
  
  -- Fast seamless fade-out of preview (~90ms)
  set stepOut to round (curVol / 6)
  if stepOut < 1 then set stepOut to 1
  repeat with v from (curVol - stepOut) to 0 by (-stepOut)
    set sound volume to v
    delay 0.015
  end repeat
  set sound volume to 0
  
  -- Restore original track in background
  play track "${targetUri}"
  try
    tell application "System Events" to set visible of process "Spotify" to false
  end try
  
  -- Swift verified seek (checks immediately, then polls every 20ms)
  if ${targetPos} > 1 then
    repeat with i from 1 to 12
      try
        set player position to ${targetPos}
        if player position ≥ (${targetPos} - 2) then exit repeat
      end try
      delay 0.02
    end repeat
  end if
  
  -- Continuous smooth swell into original track (~160ms)
  set stepIn to round (targetVol / 8)
  if stepIn < 1 then set stepIn to 1
  repeat with v from stepIn to targetVol by stepIn
    set sound volume to v
    delay 0.02
  end repeat
  if (targetVol mod 20) is not 0 and targetVol < 100 and targetVol > 0 then
    set sound volume to (targetVol + 1)
  else
    set sound volume to targetVol
  end if
end tell`;
          await runAppleScript(script);
        } else {
          // Previous song was paused: fast taper preview, restore previous song paused at exact timestamp
          const script = `
tell application "Spotify"
  set targetVol to ${targetVol}
  set curVol to sound volume
  set stepOut to round (curVol / 6)
  if stepOut < 1 then set stepOut to 1
  
  -- Fast seamless fade-out of preview (~90ms)
  repeat with v from (curVol - stepOut) to 0 by (-stepOut)
    set sound volume to v
    delay 0.015
  end repeat
  set sound volume to 0
  
  -- Restore original track in background
  play track "${targetUri}"
  try
    tell application "System Events" to set visible of process "Spotify" to false
  end try
  
  -- Swift verified seek, then pause
  if ${targetPos} > 1 then
    repeat with i from 1 to 12
      try
        set player position to ${targetPos}
        if player position ≥ (${targetPos} - 2) then exit repeat
      end try
      delay 0.02
    end repeat
  end if
  pause
  if (targetVol mod 20) is not 0 and targetVol < 100 and targetVol > 0 then
    set sound volume to (targetVol + 1)
  else
    set sound volume to targetVol
  end if
end tell`;
          await runAppleScript(script);
        }
      } else {
        // No original song: fast taper and pause
        const script = `
tell application "Spotify"
  set curVol to sound volume
  set stepOut to round (curVol / 6)
  if stepOut < 1 then set stepOut to 1
  repeat with v from (curVol - stepOut) to 0 by (-stepOut)
    set sound volume to v
    delay 0.015
  end repeat
  pause
  set sound volume to 75
end tell`;
        await runAppleScript(script);
      }
    } catch {}

    isRestoring = false;
    draw();
  };

  const handleSpaceRelease = async () => {
    isSpaceHeld = false;
    if (spaceTimer) {
      clearTimeout(spaceTimer);
      spaceTimer = null;
    }
    await restoreOriginalState();
  };

  const startPreview = async (item: SearchResultItem) => {
    if (isPreviewLoading || isPreviewActive || isRestoring) return;
    isPreviewLoading = true;
    draw();

    try {
      // Update position and playing state of original track right before interrupting
      if (sessionOriginalTrack) {
        try {
          const cur = await getTrackInfo();
          if (cur && (cur.id === sessionOriginalTrack.uri || cur.spotifyUrl === sessionOriginalTrack.uri)) {
            sessionOriginalTrack.position = cur.positionSec;
            sessionOriginalTrack.wasPlaying = (cur.state === 'playing');
          }
        } catch {}
      }

      // If user already released space while capturing status, abort immediately
      if (!isSpaceHeld) {
        isPreviewLoading = false;
        await restoreOriginalState();
        return;
      }

      // 1. Get direct Spotify URI
      let uri = item.uri;
      if (!uri) {
        uri = (await resolveSpotifyUri(item.name, item.artist, item.isrc)) || '';
        if (uri) item.uri = uri;
      }

      // Check again if space was released while resolving URI
      if (!isSpaceHeld) {
        isPreviewLoading = false;
        await restoreOriginalState();
        return;
      }

      if (uri) {
        await playUri(uri, true);
        isPreviewActive = true;
        isPreviewLoading = false;
        draw();

        // Safety check: if user released space right as playUri completed
        if (!isSpaceHeld) {
          await restoreOriginalState();
        }
        return;
      }

      // 2. Fallback to 30s preview stream via afplay if URI not available
      if (item.previewUrl) {
        const localFile = await getLocalPreviewFile(item);
        if (!isSpaceHeld) {
          isPreviewLoading = false;
          await restoreOriginalState();
          return;
        }

        if (localFile && isRunning) {
          if (sessionOriginalTrack?.wasPlaying) {
            await pause();
          }
          previewProcess = spawn('afplay', [localFile]);
          isPreviewActive = true;
          isPreviewLoading = false;
          previewProcess.on('error', () => restoreOriginalState());
          previewProcess.on('exit', () => restoreOriginalState());
          draw();

          if (!isSpaceHeld) {
            await restoreOriginalState();
          }
          return;
        }
      }
    } catch {
      isPreviewLoading = false;
      await restoreOriginalState();
    } finally {
      isPreviewLoading = false;
    }
  };

  const draw = () => {
    if (!isRunning) return;

    const width = Math.min(86, (process.stdout.columns || 80) - 4);
    const innerWidth = width - 4;

    const previewBadge = isPreviewActive
      ? ` ${theme.playing('▶ PLAYING (HOLDING SPACE) - RELEASE TO RESTORE')} `
      : isPreviewLoading
      ? ` ${theme.accent('⏳ LOADING PREVIEW...')} `
      : ` ${theme.muted(dim('[↑/↓: Select, Hold Space: Preview, Enter: Play, Esc: Cancel]'))} `;

    const titleText = ` ${theme.symbol} Suggestions for "${truncate(query, 24)}" `;
    const titleLen = stringWidth(titleText) + stringWidth(previewBadge);
    const topDash = Math.max(0, width - 2 - titleLen);
    const topBorder = `${theme.border('╭─')}${theme.heading(titleText)}${previewBadge}${theme.border('─'.repeat(topDash) + '╮')}`;

    const lines: string[] = [topBorder];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? theme.primary('❯ ') : '  ';
      const num = theme.muted(`${i + 1}. `);
      const name = isSelected ? bold(theme.text(truncate(item.name, 28))) : theme.text(truncate(item.name, 28));
      const artist = theme.secondary(truncate(item.artist, 22));
      const duration = theme.muted(item.durationFormatted);

      const previewAvailable = item.previewUrl || item.uri ? theme.playing(' ♫') : '';
      const leftPart = `${pointer}${num}${name}  ${artist}${previewAvailable}`;
      const rightPart = `${duration} `;

      const leftWidth = stringWidth(leftPart);
      const rightWidth = stringWidth(rightPart);
      const padding = Math.max(0, innerWidth - leftWidth - rightWidth);

      lines.push(`${theme.border('│')} ${leftPart}${' '.repeat(padding)}${rightPart} ${theme.border('│')}`);
    }

    lines.push(`${theme.border('╰' + '─'.repeat(width - 2) + '╯')}`);
    const fullOutput = '\n' + lines.join('\n') + '\n';
    const totalLines = fullOutput.split('\n').length;

    if (previousLineCount > 0) {
      cursor.up(previousLineCount);
      for (let i = 0; i < previousLineCount; i++) {
        cursor.clearLine();
        cursor.down(1);
      }
      cursor.up(previousLineCount);
    }

    stdout.write(fullOutput);
    previousLineCount = totalLines;
  };

  draw();

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = (chosen: SearchResultItem | null) => {
      if (resolved) return;
      resolved = true;
      isRunning = false;

      if (spaceTimer) {
        clearTimeout(spaceTimer);
        spaceTimer = null;
      }
      if (previewProcess) {
        try {
          previewProcess.kill('SIGKILL');
        } catch {}
        previewProcess = null;
      }

      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      cursor.show();
      stdout.write('\n');
      resolve(chosen);
    };

    const onData = async (chunk: Buffer) => {
      if (!isRunning) return;
      const str = chunk.toString();

      // Exit controls: Escape or Ctrl+C or 'q'
      if (str === '\u001b' || str === '\u0003' || str === 'q' || str === 'Q') {
        if (spaceTimer) {
          clearTimeout(spaceTimer);
          spaceTimer = null;
        }
        isSpaceHeld = false;
        await restoreOriginalState();
        cleanup(null);
        return;
      }

      // Enter / Return: Commit and permanently play!
      if (str === '\r' || str === '\n') {
        if (spaceTimer) {
          clearTimeout(spaceTimer);
          spaceTimer = null;
        }
        isSpaceHeld = false;
        const savedVolume = sessionOriginalTrack?.volume ?? 75;
        // Clear session original track so restore is NEVER triggered
        sessionOriginalTrack = null;
        isPreviewActive = false;
        isPreviewLoading = false;

        if (previewProcess) {
          try {
            previewProcess.kill('SIGKILL');
          } catch {}
          previewProcess = null;
        }

        // Ensure volume is restored to full baseline
        try {
          await setVolume(savedVolume > 20 ? savedVolume : 75);
        } catch {}

        const selected = items[selectedIndex];
        cleanup(selected);
        return;
      }

      // Arrow navigation
      if (str === '\u001b[A') {
        // Up arrow: restore if previewing and move cursor
        if (spaceTimer) {
          clearTimeout(spaceTimer);
          spaceTimer = null;
        }
        isSpaceHeld = false;
        if (isPreviewActive || isPreviewLoading) {
          await restoreOriginalState();
        }
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        draw();
        return;
      } else if (str === '\u001b[B') {
        // Down arrow: restore if previewing and move cursor
        if (spaceTimer) {
          clearTimeout(spaceTimer);
          spaceTimer = null;
        }
        isSpaceHeld = false;
        if (isPreviewActive || isPreviewLoading) {
          await restoreOriginalState();
        }
        selectedIndex = (selectedIndex + 1) % items.length;
        draw();
        return;
      }

      // Space key: Press and hold to play song; stops and restores the moment finger is lifted
      if (str === ' ') {
        isSpaceHeld = true;

        // Reset repeat heartbeat timer: OS key repeat sends ' ' every ~30-50ms while held.
        // When user lifts finger, repeats cease, timer fires (300ms), and previous song resumes.
        if (spaceTimer) {
          clearTimeout(spaceTimer);
        }
        spaceTimer = setTimeout(() => {
          handleSpaceRelease();
        }, 300);

        const item = items[selectedIndex];
        if (!isPreviewActive && !isPreviewLoading) {
          startPreview(item);
        }
        return;
      }
    };

    stdin.on('data', onData);
  });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}
