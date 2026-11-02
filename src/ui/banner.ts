import { isColorSupported, dim } from './ansi.ts';

export type RGB = [number, number, number];

// Leaf Green (#4ade80), Bottle Green (#065f46), Crisp Pure White (#ffffff)
export const DEFAULT_GRADIENT_STOPS: RGB[] = [
  [74, 222, 128], // Leaf green
  [6, 95, 70],    // Deep bottle green
  [255, 255, 255] // Pure white
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function interpolateColors(stops: RGB[], factor: number): RGB {
  const f = Math.max(0, Math.min(1, factor));
  if (stops.length === 1) return stops[0];

  const scaled = f * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  const t = scaled - index;

  const c1 = stops[index];
  const c2 = stops[index + 1];

  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

export function applyGradient(
  lines: string[],
  stops: RGB[] = DEFAULT_GRADIENT_STOPS,
  diagonalBias = 0.15,
  forceColor = false
): string {
  if (!isColorSupported && !forceColor) {
    return lines.join('\n');
  }

  const numLines = lines.length;
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  if (maxLineLength === 0) return '';

  const output: string[] = [];

  for (let y = 0; y < numLines; y++) {
    const line = lines[y];
    let coloredLine = '';

    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char === ' ') {
        coloredLine += ' ';
        continue;
      }

      // 2D diagonal factor creates natural organic sheen
      const xFactor = x / (maxLineLength - 1 || 1);
      const yFactor = y / (numLines - 1 || 1);
      const factor = xFactor * (1 - diagonalBias) + yFactor * diagonalBias;

      const [r, g, b] = interpolateColors(stops, factor);
      coloredLine += `\x1b[38;2;${r};${g};${b}m${char}\x1b[0m`;
    }

    output.push(coloredLine);
  }

  return output.join('\n');
}

// Large block font (Gemini / Claude Code style) - 76 columns
const BLOCK_BANNER = [
  "  ███████╗██████╗  ██████╗ ████████╗██╗███████╗██╗   ██╗     ██████╗██╗     ██╗",
  "  ██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝██║██╔════╝╚██╗ ██╔╝    ██╔════╝██║     ██║",
  "  ███████╗██████╔╝██║   ██║   ██║   ██║█████╗   ╚████╔╝ ─── ██║     ██║     ██║",
  "  ╚════██║██╔═══╝ ██║   ██║   ██║   ██║██╔══╝    ╚██╔╝      ██║     ██║     ██║",
  "  ███████║██║     ╚██████╔╝   ██║   ██║██║        ██║       ╚██████╗███████╗██║",
  "  ╚══════╝╚═╝      ╚═════╝    ╚═╝   ╚═╝╚═╝        ╚═╝        ╚═════╝╚══════╝╚═╝"
];

// Compact slant font for narrower terminal windows (< 80 columns) - 64 columns
const SLANT_BANNER = [
  "  ____  ____   ___ _____ ___ _____ __   __      ____ _     ___ ",
  " / ___||  _ \\ / _ \\_   _|_ _|  ___|\\ \\ / /     / ___| |   |_ _|",
  " \\___ \\| |_) | | | || |  | || |_    \\ V /_____| |   | |    | | ",
  "  ___) |  __/| |_| || |  | ||  _|    | | _____| |___| |___ | | ",
  " |____/|_|    \\___/ |_| |___|_|      |_|       \\____|_____|___|"
];

export function renderBanner(stops: RGB[] = DEFAULT_GRADIENT_STOPS): string {
  const terminalWidth = process.stdout.columns || 80;
  const chosenBanner = terminalWidth >= 80 ? BLOCK_BANNER : SLANT_BANNER;

  const gradientArt = applyGradient(chosenBanner, stops);
  return gradientArt;
}
