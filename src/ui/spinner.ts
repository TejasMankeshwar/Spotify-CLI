import { getTheme } from '../theme.ts';
import { cursor } from './ansi.ts';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private message: string;

  constructor(initialMessage = '') {
    this.message = initialMessage;
  }

  start(message?: string): this {
    if (message) this.message = message;
    if (this.timer) return this;

    cursor.hide();
    this.render();

    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % BRAILLE_FRAMES.length;
      this.render();
    }, 80);

    return this;
  }

  update(message: string): void {
    this.message = message;
    if (this.timer) {
      this.render();
    }
  }

  stop(finalMessage?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    cursor.clearLine();
    if (finalMessage) {
      process.stdout.write(`${finalMessage}\n`);
    }
    cursor.show();
  }

  succeed(message: string): void {
    const theme = getTheme();
    this.stop(`${theme.playing('✔')} ${message}`);
  }

  fail(message: string): void {
    const theme = getTheme();
    this.stop(`${theme.paused('✖')} ${message}`);
  }

  info(message: string): void {
    const theme = getTheme();
    this.stop(`${theme.primary(theme.symbol)} ${message}`);
  }

  private render(): void {
    const theme = getTheme();
    const frame = theme.accent(BRAILLE_FRAMES[this.frameIndex]);
    cursor.clearLine();
    process.stdout.write(`${frame} ${theme.text(this.message)}`);
  }
}

export function createSpinner(message?: string): Spinner {
  return new Spinner(message);
}

