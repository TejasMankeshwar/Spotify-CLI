// ANSI escape codes and terminal styling utility

export const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY ?? false);

export function rgb(r: number, g: number, b: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function bgRgb(r: number, g: number, b: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function hex(hexCode: string, text: string): string {
  if (!isColorSupported) return text;
  const cleanHex = hexCode.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return rgb(r, g, b, text);
}

export function bold(text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[1m${text}\x1b[22m`;
}

export function dim(text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[2m${text}\x1b[22m`;
}

export function italic(text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[3m${text}\x1b[23m`;
}

export function underline(text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[4m${text}\x1b[24m`;
}

export function inverse(text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[7m${text}\x1b[27m`;
}

// Cursor and display controls
export const cursor = {
  hide: () => process.stdout.write('\x1b[?25l'),
  show: () => process.stdout.write('\x1b[?25h'),
  up: (n = 1) => process.stdout.write(`\x1b[${n}A`),
  down: (n = 1) => process.stdout.write(`\x1b[${n}B`),
  toColumn: (n = 1) => process.stdout.write(`\x1b[${n}G`),
  clearLine: () => process.stdout.write('\x1b[2K\r'),
  clearDown: () => process.stdout.write('\x1b[J'),
  clearScreen: () => process.stdout.write('\x1b[2J\x1b[H'),
};

// Strip ANSI codes for calculating string lengths
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export function stringWidth(str: string): number {
  return stripAnsi(str).length;
}

