import readline from 'node:readline';
import { getTheme } from '../theme.ts';
import { cursor, bold, dim } from './ansi.ts';

export interface SelectorItem<T = any> {
  title: string;
  subtitle?: string;
  value: T;
}

export async function promptSelect<T>(
  message: string,
  items: SelectorItem<T>[]
): Promise<T | null> {
  if (items.length === 0) return null;

  const theme = getTheme();
  let selectedIndex = 0;
  const stdin = process.stdin;
  const stdout = process.stdout;

  const wasRaw = stdin.isRaw;
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  cursor.hide();

  const render = () => {
    cursor.clearLine();
    stdout.write(`${theme.primary(theme.symbol)} ${bold(theme.heading(message))}\n`);

    for (let i = 0; i < items.length; i++) {
      cursor.clearLine();
      const item = items[i];
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? theme.primary('❯ ') : '  ';
      const title = isSelected
        ? bold(theme.text(item.title))
        : theme.muted(item.title);
      const subtitle = item.subtitle ? ` ${theme.muted(dim(`(${item.subtitle})`))}` : '';

      stdout.write(`${pointer}${title}${subtitle}\n`);
    }

    stdout.write(`${theme.muted(dim('  [↑/↓ to navigate, Enter to select, Esc to cancel]'))}\n`);
  };

  const cleanup = () => {
    // Erase the rendered options
    const totalLines = items.length + 2; // prompt + items + help line
    cursor.up(totalLines);
    for (let i = 0; i < totalLines; i++) {
      cursor.clearLine();
      cursor.down(1);
    }
    cursor.up(totalLines);
    cursor.show();
    if (stdin.isTTY) {
      stdin.setRawMode(wasRaw ?? false);
    }
  };

  render();

  return new Promise((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        cursor.up(items.length + 2);
        render();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % items.length;
        cursor.up(items.length + 2);
        render();
      } else if (key.name === 'return') {
        cleanup();
        stdin.removeListener('keypress', onKeypress);
        resolve(items[selectedIndex].value);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        stdin.removeListener('keypress', onKeypress);
        resolve(null);
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

