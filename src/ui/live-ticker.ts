import readline from 'node:readline';
import { getTrackInfo, togglePlay, next, previous, adjustVolume, setShuffle, setRepeat } from '../spotify/applescript.ts';
import { renderTrackCard } from './card.ts';
import { cursor, dim } from './ansi.ts';
import { getTheme } from '../theme.ts';

export async function runLiveHUD(): Promise<void> {
  const theme = getTheme();
  const stdin = process.stdin;
  const stdout = process.stdout;

  const wasRaw = stdin.isRaw;
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  cursor.hide();

  let isRunning = true;
  let previousLineCount = 0;

  const header = `${theme.primary(theme.symbol)} ${theme.heading('Live Monitor')} ${theme.muted(dim('[Space: Play/Pause, n: Next, p: Prev, +/-: Vol, s: Shuffle, r: Repeat, q: Exit]'))}\n`;

  const draw = async () => {
    if (!isRunning) return;

    const info = await getTrackInfo();
    let content = '';

    if (!info) {
      content = `${theme.muted('Spotify is not currently running or has no active track.')}\n`;
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
  };

  await draw();
  const interval = setInterval(draw, 1000);

  return new Promise((resolve) => {
    const cleanup = () => {
      isRunning = false;
      clearInterval(interval);
      cursor.show();
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.removeListener('keypress', onKeypress);
      stdout.write('\n');
      resolve();
    };

    const onKeypress = async (_str: string, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        return;
      }

      if (key.name === 'space') {
        await togglePlay();
        await draw();
      } else if (key.name === 'n') {
        await next();
        setTimeout(draw, 250);
      } else if (key.name === 'p') {
        await previous();
        setTimeout(draw, 250);
      } else if (key.sequence === '+' || key.sequence === '=') {
        await adjustVolume(5);
        await draw();
      } else if (key.sequence === '-' || key.sequence === '_') {
        await adjustVolume(-5);
        await draw();
      } else if (key.name === 's') {
        await setShuffle();
        await draw();
      } else if (key.name === 'r') {
        await setRepeat();
        await draw();
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

