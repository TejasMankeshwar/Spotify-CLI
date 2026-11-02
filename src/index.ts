#!/usr/bin/env node

import { loadConfig, saveConfig } from './config.ts';
import { setTheme, getTheme, listThemes, type ThemeName } from './theme.ts';
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
} from './spotify/applescript.ts';
import { fetchLyrics } from './spotify/lyrics.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
import { startRepl } from './repl.ts';
import { bold, dim } from './ui/ansi.ts';

const VERSION = '1.0.0';

async function main() {
  const config = loadConfig();
  setTheme(config.theme || 'gemini');

  const args = process.argv.slice(2);

  // Parse global flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--theme' && args[i + 1]) {
      const t = args[i + 1].toLowerCase() as ThemeName;
      if (listThemes().includes(t)) {
        setTheme(t);
        saveConfig({ theme: t });
      }
      args.splice(i, 2);
      i--;
    } else if (args[i] === '--claude') {
      setTheme('claude');
      saveConfig({ theme: 'claude' });
      args.splice(i, 1);
      i--;
    } else if (args[i] === '--gemini') {
      setTheme('gemini');
      saveConfig({ theme: 'gemini' });
      args.splice(i, 1);
      i--;
    }
  }

  const theme = getTheme();

  // If no arguments, launch interactive REPL
  if (args.length === 0) {
    await startRepl();
    process.exit(0);
  }

  const command = args[0].toLowerCase();
  const rest = args.slice(1).join(' ').trim();

  switch (command) {
    case '-v':
    case '--version':
    case 'version':
      process.stdout.write(`spotify-cli v${VERSION}\n`);
      process.exit(0);

    case '-h':
    case '--help':
    case 'help':
      process.stdout.write('\n' + renderHelpCard() + '\n\n');
      process.exit(0);

    case 'now':
    case 'status':
    case 'current': {
      const spinner = createSpinner('Reading Spotify status...').start();
      const info = await getTrackInfo();
      if (!info) {
        spinner.fail('Spotify is not running or no active track is loaded.');
        process.exit(1);
      }
      spinner.stop();
      process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
      process.exit(0);
    }

    case 'ticker':
    case 'compact': {
      const info = await getTrackInfo();
      if (!info) {
        process.stdout.write(dim('Spotify: idle\n'));
        process.exit(1);
      }
      process.stdout.write(renderCompactTicker(info) + '\n');
      process.exit(0);
    }

    case 'watch':
    case 'live':
      await runLiveHUD();
      process.exit(0);

    case 'play': {
      if (!rest) {
        const spinner = createSpinner('Resuming playback...').start();
        await play();
        spinner.succeed('Playback resumed.');
      } else {
        const spinner = createSpinner(`Playing "${rest}"...`).start();
        if (rest.startsWith('spotify:')) {
          await playUri(rest);
        } else {
          await playSearch(rest);
        }
        spinner.succeed(`Playing: ${theme.primary(rest)}`);
      }
      setTimeout(async () => {
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
        }
        process.exit(0);
      }, 500);
      break;
    }

    case 'pause': {
      const spinner = createSpinner('Pausing playback...').start();
      await pause();
      spinner.succeed('Playback paused.');
      process.exit(0);
    }

    case 'toggle': {
      await togglePlay();
      const info = await getTrackInfo();
      if (info) {
        process.stdout.write(renderCompactTicker(info) + '\n');
      }
      process.exit(0);
    }

    case 'next':
    case 'n': {
      const spinner = createSpinner('Skipping to next track...').start();
      await next();
      spinner.succeed('Skipped to next track.');
      setTimeout(async () => {
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(renderCompactTicker(info) + '\n');
        }
        process.exit(0);
      }, 350);
      break;
    }

    case 'prev':
    case 'previous':
    case 'p': {
      const spinner = createSpinner('Skipping to previous track...').start();
      await previous();
      spinner.succeed('Previous track.');
      setTimeout(async () => {
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(renderCompactTicker(info) + '\n');
        }
        process.exit(0);
      }, 350);
      break;
    }

    case 'vol':
    case 'volume': {
      if (!rest) {
        const info = await getTrackInfo();
        process.stdout.write(`Volume: ${info?.volume ?? 50}%\n`);
        process.exit(0);
      }
      let newVol: number;
      if (rest.startsWith('+') || rest.startsWith('-')) {
        const delta = parseInt(rest, 10);
        newVol = await adjustVolume(isNaN(delta) ? 5 : delta);
      } else {
        const target = parseInt(rest, 10);
        newVol = await setVolume(isNaN(target) ? 50 : target);
      }
      process.stdout.write(`Volume set to ${theme.primary(`${newVol}%`)}\n`);
      process.exit(0);
    }

    case 'seek': {
      let sec = 0;
      if (rest.includes(':')) {
        const [m, s] = rest.split(':');
        sec = (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
      } else {
        sec = parseInt(rest, 10) || 0;
      }
      await seek(sec);
      process.stdout.write(`Seeked to ${theme.text(rest)}\n`);
      process.exit(0);
    }

    case 'shuffle': {
      const enabled = rest ? rest === 'on' || rest === 'true' : undefined;
      const state = await setShuffle(enabled);
      process.stdout.write(
        `Shuffle: ${state ? theme.playing('ON') : theme.muted('OFF')}\n`
      );
      process.exit(0);
    }

    case 'repeat': {
      const enabled = rest ? rest === 'on' || rest === 'true' : undefined;
      const state = await setRepeat(enabled);
      process.stdout.write(
        `Repeat: ${state ? theme.playing('ON') : theme.muted('OFF')}\n`
      );
      process.exit(0);
    }

    case 'lyrics': {
      const spinner = createSpinner('Searching lyrics...').start();
      const info = await getTrackInfo();
      if (!info) {
        spinner.fail('No track currently playing on Spotify.');
        process.exit(1);
      }
      const lyrics = await fetchLyrics(info.name, info.artist);
      if (!lyrics || lyrics.lines.length === 0) {
        spinner.fail(`No lyrics found for "${info.name}" by ${info.artist}.`);
        process.exit(1);
      }
      spinner.succeed(
        `Lyrics for ${bold(lyrics.trackName)} by ${lyrics.artistName}:\n`
      );
      for (const line of lyrics.lines) {
        const timestamp = lyrics.synced ? `${theme.muted(line.timeFormatted)}  ` : '';
        process.stdout.write(`  ${timestamp}${theme.text(line.text)}\n`);
      }
      process.exit(0);
    }

    default: {
      // Direct search & play fallback
      const spinner = createSpinner(`Searching and playing "${args.join(' ')}"...`).start();
      await playSearch(args.join(' '));
      spinner.succeed(`Playing: ${theme.primary(args.join(' '))}`);
      process.exit(0);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message || err}\n`);
  process.exit(1);
});

