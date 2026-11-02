import readline from 'node:readline/promises';
import { getTheme, setTheme, listThemes, type ThemeName } from './theme.ts';
import {
  getTrackInfo,
  play,
  pause,
  togglePlay,
  next,
  previous,
  setVolume,
  adjustVolume,
  seek,
  setShuffle,
  setRepeat,
  playSearch,
  playUri,
  launchSpotify,
  isSpotifyRunning,
} from './spotify/applescript.ts';
import { fetchLyrics } from './spotify/lyrics.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
import { promptSelect } from './ui/selector.ts';
import { bold, dim, cursor } from './ui/ansi.ts';
import { saveConfig } from './config.ts';

const SLASH_COMMANDS = [
  '/play',
  '/pause',
  '/toggle',
  '/next',
  '/prev',
  '/now',
  '/status',
  '/watch',
  '/live',
  '/vol',
  '/seek',
  '/shuffle',
  '/repeat',
  '/lyrics',
  '/theme',
  '/clear',
  '/help',
  '/exit',
  '/quit',
];

function completer(line: string): [string[], string] {
  const hits = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(line.trim()));
  return [hits.length ? hits : SLASH_COMMANDS, line];
}

export async function startRepl(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
  });

  const printBanner = async () => {
    const theme = getTheme();
    process.stdout.write('\n');
    process.stdout.write(
      `  ${theme.primary(theme.symbol)} ${bold(theme.heading('Spotify CLI'))} ${theme.muted(dim('v1.0.0'))} ${theme.border('─')} ${theme.accent(theme.name.toUpperCase())}\n`
    );
    process.stdout.write(
      `  ${theme.muted('Operate Spotify seamlessly from your terminal. Type')} ${theme.primary('/help')} ${theme.muted('or')} ${theme.primary('/watch')}.\n\n`
    );

    const isRunning = await isSpotifyRunning();
    if (isRunning) {
      const info = await getTrackInfo();
      if (info) {
        process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
      }
    }
  };

  await printBanner();

  const handleCommand = async (input: string): Promise<boolean> => {
    const trimmed = input.trim();
    if (!trimmed) return true;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    const theme = getTheme();

    switch (cmd) {
      case '/exit':
      case '/quit':
      case 'exit':
      case 'quit':
      case ':q':
        process.stdout.write(`  ${theme.muted('Goodbye!')}\n\n`);
        return false;

      case '/clear':
      case 'clear':
        cursor.clearScreen();
        await printBanner();
        return true;

      case '/help':
      case 'help':
      case '?':
        process.stdout.write('\n' + renderHelpCard() + '\n\n');
        return true;

      case '/now':
      case '/status':
      case 'now':
      case 'status': {
        const spinner = createSpinner('Fetching playback status...').start();
        const info = await getTrackInfo();
        if (!info) {
          spinner.fail('Spotify is not running or no active track is loaded.');
        } else {
          spinner.stop();
          process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
        }
        return true;
      }

      case '/watch':
      case '/live':
      case 'watch':
      case 'live':
        rl.pause();
        await runLiveHUD();
        rl.resume();
        return true;

      case '/play':
      case 'play': {
        if (!args) {
          const spinner = createSpinner('Resuming playback...').start();
          await play();
          spinner.succeed('Playback resumed.');
          const info = await getTrackInfo();
          if (info) {
            process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
          }
        } else {
          const spinner = createSpinner(`Searching and playing "${args}"...`).start();
          if (args.startsWith('spotify:')) {
            await playUri(args);
          } else {
            await playSearch(args);
          }
          spinner.succeed(`Playing: ${theme.primary(args)}`);
          setTimeout(async () => {
            const info = await getTrackInfo();
            if (info) {
              process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
            }
          }, 600);
        }
        return true;
      }

      case '/pause':
      case 'pause': {
        const spinner = createSpinner('Pausing playback...').start();
        await pause();
        spinner.succeed('Playback paused.');
        return true;
      }

      case '/toggle':
      case 'toggle':
      case ' ': {
        await togglePlay();
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
        }
        return true;
      }

      case '/next':
      case '/n':
      case 'next':
      case 'n': {
        const spinner = createSpinner('Skipping to next track...').start();
        await next();
        spinner.succeed('Skipped.');
        setTimeout(async () => {
          const info = await getTrackInfo();
          if (info) {
            process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
          }
        }, 350);
        return true;
      }

      case '/prev':
      case '/previous':
      case '/p':
      case 'prev':
      case 'p': {
        const spinner = createSpinner('Going to previous track...').start();
        await previous();
        spinner.succeed('Previous track.');
        setTimeout(async () => {
          const info = await getTrackInfo();
          if (info) {
            process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
          }
        }, 350);
        return true;
      }

      case '/vol':
      case '/volume':
      case 'vol': {
        if (!args) {
          const info = await getTrackInfo();
          const current = info?.volume ?? 50;
          process.stdout.write(`  🔊 Volume: ${theme.primary(`${current}%`)}\n\n`);
          return true;
        }

        let newVol: number;
        if (args.startsWith('+') || args.startsWith('-')) {
          const delta = parseInt(args, 10);
          newVol = await adjustVolume(isNaN(delta) ? 5 : delta);
        } else {
          const target = parseInt(args, 10);
          newVol = await setVolume(isNaN(target) ? 50 : target);
        }
        process.stdout.write(`  🔊 Volume set to ${theme.primary(`${newVol}%`)}\n\n`);
        return true;
      }

      case '/seek':
      case 'seek': {
        if (!args) {
          process.stdout.write(`  ${theme.muted('Usage: /seek <seconds> or /seek <mm:ss>')}\n\n`);
          return true;
        }
        let sec = 0;
        if (args.includes(':')) {
          const [m, s] = args.split(':');
          sec = (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
        } else {
          sec = parseInt(args, 10) || 0;
        }
        await seek(sec);
        process.stdout.write(`  ${theme.primary(theme.symbol)} Jumped to ${theme.text(args)}\n\n`);
        return true;
      }

      case '/shuffle':
      case 'shuffle': {
        const enabled = args ? args === 'on' || args === 'true' : undefined;
        const state = await setShuffle(enabled);
        process.stdout.write(
          `  🔀 Shuffle is now ${state ? theme.playing('ON') : theme.muted('OFF')}\n\n`
        );
        return true;
      }

      case '/repeat':
      case 'repeat': {
        const enabled = args ? args === 'on' || args === 'true' : undefined;
        const state = await setRepeat(enabled);
        process.stdout.write(
          `  🔁 Repeat is now ${state ? theme.playing('ON') : theme.muted('OFF')}\n\n`
        );
        return true;
      }

      case '/lyrics':
      case 'lyrics': {
        const spinner = createSpinner('Fetching lyrics...').start();
        const info = await getTrackInfo();
        if (!info) {
          spinner.fail('No track currently playing.');
          return true;
        }

        const lyrics = await fetchLyrics(info.name, info.artist);
        if (!lyrics || lyrics.lines.length === 0) {
          spinner.fail(`No lyrics found for "${info.name}" by ${info.artist}.`);
          return true;
        }

        spinner.succeed(
          `Lyrics for ${theme.heading(lyrics.trackName)} by ${theme.secondary(lyrics.artistName)}:`
        );
        process.stdout.write('\n');

        for (const line of lyrics.lines) {
          const timestamp = lyrics.synced ? `${theme.muted(line.timeFormatted)}  ` : '';
          const lineText = line.text ? theme.text(line.text) : '';
          process.stdout.write(`  ${timestamp}${lineText}\n`);
        }
        process.stdout.write('\n');
        return true;
      }

      case '/theme':
      case 'theme': {
        const validThemes = listThemes();
        const targetTheme = args.toLowerCase() as ThemeName;

        if (validThemes.includes(targetTheme)) {
          setTheme(targetTheme);
          saveConfig({ theme: targetTheme });
          process.stdout.write(
            `  ${theme.playing('✔')} Switched theme to ${bold(targetTheme.toUpperCase())}\n\n`
          );
        } else {
          rl.pause();
          const chosen = await promptSelect(
            'Select UI Theme:',
            validThemes.map((t) => ({
              title: t.toUpperCase(),
              subtitle: t === 'gemini' ? 'Celestial Blue & Violet' : t === 'claude' ? 'Warm Terracotta & Stone' : 'Neon Cyberpunk',
              value: t,
            }))
          );
          rl.resume();
          if (chosen) {
            setTheme(chosen);
            saveConfig({ theme: chosen });
            process.stdout.write(
              `  ${getTheme().playing('✔')} Theme updated to ${bold(chosen.toUpperCase())}\n\n`
            );
          }
        }
        return true;
      }

      default: {
        // Natural shorthand: if user types "bohemian rhapsody" or "hotel california", treat as search & play!
        if (!trimmed.startsWith('/')) {
          const spinner = createSpinner(`Searching and playing "${trimmed}"...`).start();
          await playSearch(trimmed);
          spinner.succeed(`Playing: ${theme.primary(trimmed)}`);
          setTimeout(async () => {
            const info = await getTrackInfo();
            if (info) {
              process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
            }
          }, 600);
          return true;
        }

        process.stdout.write(
          `  ${theme.paused('Unknown command:')} ${theme.text(trimmed)}. Type ${theme.primary('/help')} for available commands.\n\n`
        );
        return true;
      }
    }
  };

  while (true) {
    const theme = getTheme();
    const promptStr = `  ${theme.primary(theme.symbol)} ${theme.secondary('spotify')} ${theme.muted(theme.promptSymbol)} `;
    try {
      const answer = await rl.question(promptStr);
      const shouldContinue = await handleCommand(answer);
      if (!shouldContinue) {
        break;
      }
    } catch {
      // Ctrl+C in readline question
      process.stdout.write('\n');
      break;
    }
  }

  rl.close();
}

