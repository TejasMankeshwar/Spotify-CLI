import { getTheme } from '../theme.ts';

export interface ProgressBarOptions {
  width?: number;
  currentSec: number;
  totalSec: number;
  showKnob?: boolean;
}

export function renderProgressBar(options: ProgressBarOptions): string {
  const theme = getTheme();
  const width = options.width ?? 24;
  const current = Math.max(0, options.currentSec);
  const total = Math.max(1, options.totalSec);

  const fraction = Math.min(1, Math.max(0, current / total));
  const filledCount = Math.round(fraction * width);
  const unfilledCount = Math.max(0, width - filledCount);

  // Gemini / Claude style sleek line with filled bar and subtle knob
  const filledChar = '━';
  const knobChar = '●';
  const unfilledChar = '─';

  let bar = '';
  if (filledCount > 0) {
    const filledSegment = filledChar.repeat(Math.max(0, filledCount - 1));
    bar += theme.primary(filledSegment);
    bar += theme.accent(knobChar);
  } else {
    bar += theme.muted(knobChar);
  }

  if (unfilledCount > 0) {
    bar += theme.muted(unfilledChar.repeat(unfilledCount));
  }

  return bar;
}

export function renderVolumeBar(volume: number, width = 10): string {
  const theme = getTheme();
  const vol = Math.max(0, Math.min(100, volume));
  const filled = Math.round((vol / 100) * width);
  const empty = width - filled;

  const filledStr = '■'.repeat(filled);
  const emptyStr = '□'.repeat(empty);

  return `${theme.primary(filledStr)}${theme.muted(emptyStr)} ${theme.text(`${vol}%`)}`;
}

