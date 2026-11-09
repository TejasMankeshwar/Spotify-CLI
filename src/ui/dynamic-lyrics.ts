import { getTrackInfo, togglePlay, next, previous, adjustVolume } from '../spotify/applescript.ts';
import { fetchLyrics, cleanTrackTitle, cleanArtistName } from '../spotify/lyrics.ts';
import { getTheme } from '../theme.ts';
import { cursor, bold, dim, stringWidth } from './ansi.ts';
import { renderProgressBar } from './progress.ts';
import { createSpinner } from './spinner.ts';
import type { LyricsResult, LyricLine, TrackInfo } from '../spotify/types.ts';

const CHUNK_SIZE = 4;
const LEAD_IN_SEC = 0.75; // Display line 0.75s before vocal starts

export interface ChunkState {
  activeIdx: number;
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  chunkLines: LyricLine[];
}

export function computeChunkState(
  posSec: number,
  lines: LyricLine[],
  leadInSec = LEAD_IN_SEC
): ChunkState {
  if (lines.length === 0) {
    return {
      activeIdx: -1,
      chunkIndex: 0,
      totalChunks: 0,
      startIndex: 0,
      chunkLines: [],
    };
  }

  const effectiveTime = posSec + leadInSec;
  let activeIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeSec <= effectiveTime) {
      activeIdx = i;
    } else {
      break;
    }
  }

  const safeIdx = Math.max(0, activeIdx);
  const totalChunks = Math.max(1, Math.ceil(lines.length / CHUNK_SIZE));
  const chunkIndex = Math.min(totalChunks - 1, Math.floor(safeIdx / CHUNK_SIZE));
  const startIndex = chunkIndex * CHUNK_SIZE;
  const chunkLines = lines.slice(startIndex, startIndex + CHUNK_SIZE);

  return {
    activeIdx,
    chunkIndex,
    totalChunks,
    startIndex,
    chunkLines,
  };
}

export function prepareLyricsLines(lyrics: LyricsResult, durationSec: number): LyricLine[] {
  if (lyrics.synced) {
    return lyrics.lines;
  }

  // If unsynced, extrapolate timestamps evenly across track duration
  const totalLines = lyrics.lines.length;
  const dur = durationSec > 0 ? durationSec : 180;
  const step = dur / Math.max(1, totalLines);

  return lyrics.lines.map((l, i) => {
    const sec = Math.round(i * step);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const timeFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return {
      timeSec: sec,
      timeFormatted,
      text: l.text,
    };
  });
}

function truncate(str: string, maxLen: number): string {
  if (stringWidth(str) <= maxLen) return str;
  let result = '';
  let width = 0;
  for (const ch of str) {
    const w = stringWidth(ch);
    if (width + w > maxLen - 1) break;
    result += ch;
    width += w;
  }
  return result + '…';
}

export async function runDynamicLyrics(initialLyrics?: LyricsResult): Promise<void> {
  const theme = getTheme();
  const stdout = process.stdout;
  const stdin = process.stdin;

  // 1. Check current playback info
  const initialInfo = await getTrackInfo();
  if (!initialInfo) {
    stdout.write(`  ${theme.paused('✖')} Spotify is not currently running or has no active track.\n\n`);
    return;
  }

  // 2. Fetch lyrics if not provided
  let currentLyrics = initialLyrics || null;
  let currentTrackId = initialInfo.id || initialInfo.name;
  let currentTrackName = initialInfo.name;

  if (!currentLyrics) {
    const spinner = createSpinner(`Fetching lyrics for "${initialInfo.name}"...`).start();
    currentLyrics = await fetchLyrics(initialInfo.name, initialInfo.artist);
    if (!currentLyrics || currentLyrics.lines.length === 0) {
      spinner.fail(`No lyrics found for "${initialInfo.name}" by ${initialInfo.artist}.`);
      return;
    }
    spinner.succeed(`Loaded lyrics for ${theme.heading(currentLyrics.trackName)} by ${theme.secondary(currentLyrics.artistName)}.`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const durationSec = initialInfo.durationMs > 0 ? initialInfo.durationMs / 1000 : 180;
  let preparedLines = prepareLyricsLines(currentLyrics, durationSec);

  // 3. Setup raw mode for key handling
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  cursor.hide();

  let isRunning = true;
  let previousLineCount = 0;
  let isDrawing = false;
  let lastInfo: TrackInfo = initialInfo;

  const targetWidth = Math.min(68, Math.max(54, (stdout.columns || 80) - 4));
  const contentWidth = targetWidth - 2;

  const renderFrame = (info: TrackInfo): string => {
    const posSec = info.positionSec;
    const durSec = info.durationMs > 0 ? info.durationMs / 1000 : 180;
    const state = computeChunkState(posSec, preparedLines, LEAD_IN_SEC);

    const titleText = truncate(`${info.name} · ${info.artist}`, contentWidth - 6);
    const modeBadge = currentLyrics?.synced ? 'SYNCED' : 'AUTO-PACED';
    const titleSection = `╭─ ${theme.symbol} Dynamic Lyrics [${modeBadge}] `;
    const dashCount = Math.max(2, targetWidth - stringWidth(titleSection) - 1);
    const topBar = `${theme.border('╭─')} ${theme.heading(theme.symbol + ' Dynamic Lyrics')} ${theme.muted(`[${modeBadge}]`)} ${theme.border('─'.repeat(dashCount) + '╮')}`;

    const linesOut: string[] = [topBar];

    // Subtitle track name
    const sub = `  ${theme.primary(theme.symbol)} ${bold(theme.text(titleText))}`;
    linesOut.push(`${theme.border('│')}${sub}${' '.repeat(Math.max(0, contentWidth - stringWidth(sub)))}${theme.border('│')}`);
    linesOut.push(`${theme.border('│')}${' '.repeat(contentWidth)}${theme.border('│')}`);

    // Render 4 lines of lyrics
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const lineIdx = state.startIndex + i;
      let lineContent = '';

      if (lineIdx < preparedLines.length) {
        const line = preparedLines[lineIdx];
        const timeBadge = `[${line.timeFormatted}]`;
        const maxTextLen = contentWidth - stringWidth(timeBadge) - 10;
        const cleanText = truncate(line.text, Math.max(10, maxTextLen));

        if (lineIdx < state.activeIdx) {
          // Sung line (completed within this chunk)
          const mark = theme.muted('✓');
          const time = theme.muted(timeBadge);
          const txt = theme.muted(cleanText);
          lineContent = `  ${mark}  ${time}  ${txt}`;
        } else if (lineIdx === state.activeIdx) {
          // Active current line (highlighted 0.75s in advance)
          const mark = theme.playing('▶');
          const time = theme.accent(timeBadge);
          const txt = bold(theme.primary(cleanText));
          lineContent = `  ${mark}  ${time}  ${txt}`;
        } else {
          // Upcoming line in chunk
          const mark = ' ';
          const time = theme.muted(timeBadge);
          const txt = theme.text(cleanText);
          lineContent = `  ${mark}  ${time}  ${txt}`;
        }
      } else {
        // Blank line padding if last chunk has fewer than 4 lines
        lineContent = ' ';
      }

      const pad = Math.max(0, contentWidth - stringWidth(lineContent));
      linesOut.push(`${theme.border('│')}${lineContent}${' '.repeat(pad)}${theme.border('│')}`);
    }

    linesOut.push(`${theme.border('│')}${' '.repeat(contentWidth)}${theme.border('│')}`);

    // Bottom progress & chunk indicator
    const progBar = renderProgressBar({
      currentSec: posSec,
      totalSec: durSec,
      width: 14,
    });
    const timeDisplay = `${info.positionFormatted} / ${info.durationFormatted}`;
    const pageDisplay = `Page ${state.chunkIndex + 1}/${state.totalChunks}`;
    const bottomContent = `  ${progBar}  ${theme.muted(timeDisplay)}  ${theme.muted(pageDisplay)}`;
    const botPad = Math.max(0, contentWidth - stringWidth(bottomContent));
    linesOut.push(`${theme.border('│')}${bottomContent}${' '.repeat(botPad)}${theme.border('│')}`);

    // Bottom border & controls
    linesOut.push(`${theme.border('╰' + '─'.repeat(contentWidth) + '╯')}`);
    linesOut.push(`  ${theme.muted('[Space: Play/Pause, n: Next, p: Prev, +/–: Vol, q/Esc: Exit]')}`);

    return linesOut.join('\n') + '\n';
  };

  const draw = async () => {
    if (!isRunning || isDrawing) return;
    isDrawing = true;

    try {
      const info = await getTrackInfo();
      if (!isRunning) return;

      if (info) {
        lastInfo = info;
        // Check if track changed during dynamic lyrics
        const trackId = info.id || info.name;
        if (trackId !== currentTrackId && info.name !== currentTrackName) {
          currentTrackId = trackId;
          currentTrackName = info.name;
          const newLyrics = await fetchLyrics(info.name, info.artist);
          if (newLyrics && newLyrics.lines.length > 0) {
            currentLyrics = newLyrics;
            const newDur = info.durationMs > 0 ? info.durationMs / 1000 : 180;
            preparedLines = prepareLyricsLines(currentLyrics, newDur);
          }
        }
      }

      const output = renderFrame(lastInfo);
      const lineCount = output.trimEnd().split('\n').length;

      if (previousLineCount > 0) {
        cursor.up(previousLineCount);
        for (let i = 0; i < previousLineCount; i++) {
          cursor.clearLine();
          cursor.down(1);
        }
        cursor.up(previousLineCount);
      }

      stdout.write(output);
      previousLineCount = lineCount;
    } finally {
      isDrawing = false;
    }
  };

  await draw();
  const interval = setInterval(draw, 180);

  return new Promise((resolve) => {
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      isRunning = false;
      clearInterval(interval);

      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      cursor.show();
      stdout.write('\n');
      resolve();
    };

    const onData = (chunk: Buffer) => {
      if (!isRunning) return;
      const str = chunk.toString();

      // Exit on 'q', 'Q', Esc, Ctrl+C, or Enter
      if (
        str === 'q' ||
        str === 'Q' ||
        str === '\u001b' ||
        str === '\u0003' ||
        str === '\x03' ||
        str === '\r' ||
        str === '\n'
      ) {
        cleanup();
        return;
      }

      if (str === ' ') {
        togglePlay().then(() => draw());
      } else if (str === 'n' || str === 'N') {
        next().then(() => setTimeout(draw, 250));
      } else if (str === 'p' || str === 'P') {
        previous().then(() => setTimeout(draw, 250));
      } else if (str === '+' || str === '=') {
        adjustVolume(5).then(() => draw());
      } else if (str === '-' || str === '_') {
        adjustVolume(-5).then(() => draw());
      }
    };

    stdin.on('data', onData);
  });
}
