import readline from 'node:readline';
import {
  getTrackInfo,
  togglePlay,
  next,
  previous,
  adjustVolume,
  setShuffle,
  setRepeat,
} from '../spotify/applescript.ts';
import { renderTrackCard } from './card.ts';
import { cursor, dim } from './ansi.ts';
import { getTheme } from '../theme.ts';

export async function runLiveHUD(): Promise<void> {
  const theme = getTheme();
  const stdin = process.stdin;
  const stdout = process.stdout;

  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  cursor.hide();

  let isRunning = true;
  let previousLineCount = 0;
  let isDrawing = false;
  let hasPendingDraw = false;

  const header = `  ${theme.primary(theme.symbol)} ${theme.heading('Live Monitor')} ${theme.muted(dim('[Space: Play/Pause, n: Next, p: Prev, +/-: Vol, s: Shuffle, r: Repeat, q/Esc: Exit]'))}\n\n`;

  const draw = async () => {
    if (!isRunning) return;
    if (isDrawing) {
      hasPendingDraw = true;
      return;
    }

    isDrawing = true;
    try {
      const info = await getTrackInfo();
      if (!isRunning) return;

      let content = '';
      if (!info) {
        content = `  ${theme.muted('Spotify is not currently running or has no active track.')}\n`;
      } else {
        content = renderTrackCard(info) + '\n';
      }

      const fullOutput = header + content;
      const lines = fullOutput.split('\n');

      if (previousLineCount > 0) {
        cursor.up(previousLineCount);
        for (let i = 0; i < previousLineCount; i++) {
          cursor.clearLine();
          cursor.down(1);
        }
        cursor.up(previousLineCount);
      }

      stdout.write(fullOutput);
      previousLineCount = lines.length;
    } finally {
      isDrawing = false;
      if (hasPendingDraw && isRunning) {
        hasPendingDraw = false;
        setTimeout(draw, 50);
      }
    }
  };

  await draw();
  const interval = setInterval(draw, 1000);

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

      // Check for exit keys: 'q', 'Q', Esc (\u001b), Ctrl+C (\u0003), or Enter
      if (
        str === 'q' ||
        str === 'Q' ||
        str === '\u001b' ||
        str === '\u0003' ||
        str === '\x03'
      ) {
        cleanup();
        return;
      }

      if (str === ' ') {
        togglePlay().then(() => draw());
      } else if (str === 'n' || str === 'N') {
        next().then(() => setTimeout(draw, 200));
      } else if (str === 'p' || str === 'P') {
        previous().then(() => setTimeout(draw, 200));
      } else if (str === '+' || str === '=') {
        adjustVolume(5).then(() => draw());
      } else if (str === '-' || str === '_') {
        adjustVolume(-5).then(() => draw());
      } else if (str === 's' || str === 'S') {
        setShuffle().then(() => draw());
      } else if (str === 'r' || str === 'R') {
        setRepeat().then(() => draw());
      }
    };

    stdin.on('data', onData);
  });
}
