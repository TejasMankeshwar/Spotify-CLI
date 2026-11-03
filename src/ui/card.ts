import { getTheme } from '../theme.ts';
import { stringWidth, bold, dim } from './ansi.ts';
import { renderProgressBar, renderVolumeBar } from './progress.ts';
import type { TrackInfo } from '../spotify/types.ts';

export interface CardOptions {
  width?: number;
  title?: string;
  badge?: string;
}

export function renderCard(rows: Array<{ label: string; value: string }>, options?: CardOptions): string {
  const theme = getTheme();
  
  // Calculate max label width dynamically
  const maxLabelLen = Math.max(8, ...rows.map((r) => stringWidth(r.label))) + 3;
  const maxValueLen = Math.max(10, ...rows.map((r) => stringWidth(r.value)));
  
  const minRequiredWidth = maxLabelLen + maxValueLen + 6;
  const targetWidth = Math.max(options?.width ?? 58, minRequiredWidth);
  const innerWidth = targetWidth - 4; // inside padding: "│ " and " │"

  const titleText = options?.title ? ` ${theme.symbol} ${options.title} ` : '';
  const badgeText = options?.badge ? ` [${options.badge}] ` : '';

  // Top border with embedded title
  const titleLen = stringWidth(titleText) + stringWidth(badgeText);
  const remainingTopDash = Math.max(0, targetWidth - 2 - titleLen);
  const topBorder = `${theme.border('╭─')}${theme.heading(titleText)}${badgeText}${theme.border('─'.repeat(remainingTopDash) + '╮')}`;

  const lines: string[] = [topBorder];

  for (const row of rows) {
    const rawLabel = row.label;
    const labelFormatted = theme.muted(rawLabel.padEnd(maxLabelLen));
    const labelWidth = maxLabelLen;
    const valueWidth = stringWidth(row.value);
    const spacePadding = Math.max(0, innerWidth - labelWidth - valueWidth);

    lines.push(
      `${theme.border('│')} ${labelFormatted}${row.value}${' '.repeat(spacePadding)} ${theme.border('│')}`
    );
  }

  lines.push(`${theme.border('╰' + '─'.repeat(targetWidth - 2) + '╯')}`);
  return lines.join('\n');
}

export function renderTrackCard(info: TrackInfo): string {
  const theme = getTheme();
  const width = 56;

  const stateBadge =
    info.state === 'playing'
      ? theme.playing('▶ PLAYING')
      : info.state === 'paused'
      ? theme.paused('⏸ PAUSED')
      : theme.muted('⏹ STOPPED');

  const durationSec = info.durationMs > 0 ? info.durationMs / 1000 : 0;
  const progressSec = info.positionSec;
  const progressBar = renderProgressBar({
    currentSec: progressSec,
    totalSec: durationSec,
    width: 16,
  });

  const progressDisplay = `${progressBar} ${theme.text(info.positionFormatted)} ${theme.muted('/')} ${theme.muted(info.durationFormatted)}`;
  const volBar = renderVolumeBar(info.volume, 8);

  const shuffleIcon = info.isShuffling ? theme.primary('ON') : theme.muted('OFF');
  const repeatIcon = info.isRepeating ? theme.primary('ON') : theme.muted('OFF');

  const rows = [
    { label: 'Track', value: bold(theme.text(truncate(info.name, 38))) },
    { label: 'Artist', value: theme.secondary(truncate(info.artist, 38)) },
    { label: 'Album', value: theme.muted(truncate(info.album, 38)) },
    { label: 'Progress', value: progressDisplay },
    { label: 'Volume', value: volBar },
    { label: 'State', value: `${stateBadge}  ${theme.muted('│')}  🔀 ${shuffleIcon}  🔁 ${repeatIcon}` },
  ];

  if (info.spotifyUrl) {
    rows.push({
      label: 'Link',
      value: theme.muted(dim(info.spotifyUrl)),
    });
  }

  return renderCard(rows, {
    title: 'Spotify Player',
    badge: info.state.toUpperCase(),
    width,
  });
}

export function renderCompactTicker(info: TrackInfo): string {
  const theme = getTheme();
  const symbol = info.state === 'playing' ? theme.playing('▶') : theme.paused('⏸');
  const durationSec = info.durationMs > 0 ? info.durationMs / 1000 : 0;
  const progress = renderProgressBar({
    currentSec: info.positionSec,
    totalSec: durationSec,
    width: 14,
  });

  return `${symbol} ${bold(theme.text(truncate(info.name, 24)))} ${theme.muted('·')} ${theme.secondary(truncate(info.artist, 18))}  ${progress} ${theme.muted(`[${info.positionFormatted}/${info.durationFormatted}]`)}  🔊 ${theme.text(`${info.volume}%`)}`;
}

export function renderHelpCard(): string {
  const theme = getTheme();
  const width = 62;

  const commands = [
    { label: '/play [query]', value: 'Resume playback or search & play instantly' },
    { label: '/pause', value: 'Pause current playback' },
    { label: '/toggle, <space>', value: 'Toggle play/pause state' },
    { label: '/next, /n', value: 'Skip to next track' },
    { label: '/prev, /p', value: 'Go back to previous track' },
    { label: '/now, /status', value: 'Display current track detailed card' },
    { label: '/watch, /live', value: 'Launch interactive dynamic live player HUD' },
    { label: '/vol [0-100|+10|-10]', value: 'Set or adjust playback volume' },
    { label: '/seek [+30|+1:30|mm:ss]', value: 'Jump or advance/rewind track (+30, +1:30, 2:00)' },
    { label: '/shuffle', value: 'Toggle shuffle mode (on/off)' },
    { label: '/repeat', value: 'Toggle repeat mode (on/off)' },
    { label: '/lyrics', value: 'Fetch synced/plain lyrics for current song' },
    { label: '/theme [name]', value: 'Switch theme (spotify, celestial, amber, cyber)' },
    { label: '/clear', value: 'Clear terminal screen' },
    { label: '/help', value: 'Show this cheat sheet' },
    { label: '/exit, /quit', value: 'Exit Spotify CLI' },
  ];

  const rows = commands.map((c) => ({
    label: c.label,
    value: theme.muted(c.value),
  }));

  return renderCard(rows, {
    title: 'Commands Cheat Sheet',
    badge: 'HELP',
    width,
  });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}
