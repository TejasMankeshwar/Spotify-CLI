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
  parseVolumeInput,
  seek,
  seekRelative,
  parseSeekInput,
  formatTime,
  setShuffle,
  setRepeat,
  playSearch,
  playUri,
} from './spotify/applescript.ts';
import { fetchLyrics } from './spotify/lyrics.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { renderBanner } from './ui/banner.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
import { runSearchPicker } from './ui/search-picker.ts';
import { getSpotifyApiToken } from './spotify/search.ts';
import { startRepl } from './repl.ts';
import { bold, dim } from './ui/ansi.ts';

const VERSION = '1.0.0';

async function main() {
  const config = loadConfig();
  setTheme(config.theme || 'spotify');

  const args = process.argv.slice(2);

  // Parse global flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--theme' && args[i + 1]) {
      const t = args[i + 1].toLowerCase();
      setTheme(t);
      saveConfig({ theme: (getTheme().name as ThemeName) });
      args.splice(i, 2);
      i--;
    } else if (args[i] === '--spotify' || args[i] === '--green') {
      setTheme('spotify');
      saveConfig({ theme: 'spotify' });
      args.splice(i, 1);
      i--;
    } else if (args[i] === '--celestial' || args[i] === '--azure') {
      setTheme('celestial');
      saveConfig({ theme: 'celestial' });
      args.splice(i, 1);
      i--;
    } else if (args[i] === '--amber' || args[i] === '--terracotta') {
      setTheme('amber');
      saveConfig({ theme: 'amber' });
      args.splice(i, 1);
      i--;
    } else if (args[i] === '--cyber') {
      setTheme('cyber');
      saveConfig({ theme: 'cyber' });
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

    case 'banner':
      process.stdout.write('\n' + renderBanner() + '\n\n');
      process.exit(0);

    case '-h':
    case '--help':
    case 'help':
      process.stdout.write('\n' + renderBanner() + '\n\n' + renderHelpCard() + '\n\n');
      process.exit(0);

    case 'now':
    case 'status':
    case 'current':
    case 'track':
    case 'song':
    case 'info':
    case 'np': {
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
    case 'hud':
      await runLiveHUD();
      process.exit(0);

    case 'search':
    case 'find': {
      if (!rest) {
        process.stdout.write(`Usage: spotify search <song title, artist, or album>\n`);
        process.exit(1);
      }
      const selected = await runSearchPicker(rest);
      if (selected) {
        const spinner = createSpinner(`Playing "${selected.name}"...`).start();
        if (selected.uri) {
          await playUri(selected.uri);
          spinner.succeed(`Playing: ${theme.primary(selected.name)} by ${theme.secondary(selected.artist)}`);
        } else {
          const res = await playSearch(`${selected.name} ${selected.artist}`);
          if (res.hasDirectUri) {
            spinner.succeed(`Playing: ${theme.primary(res.trackName)}`);
          } else {
            spinner.succeed(`Searching in Spotify: ${theme.primary(selected.name)}`);
          }
        }
        setTimeout(async () => {
          const info = await getTrackInfo();
          if (info) {
            process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
          }
          process.exit(0);
        }, 600);
      } else {
        process.exit(0);
      }
      break;
    }

    case 'play':
    case 'resume': {
      if (!rest) {
        const spinner = createSpinner('Resuming playback...').start();
        await play();
        spinner.succeed('Playback resumed.');
      } else {
        const spinner = createSpinner(`Searching and playing "${rest}"...`).start();
        if (rest.startsWith('spotify:')) {
          await playUri(rest);
          spinner.succeed(`Playing: ${theme.primary(rest)}`);
        } else {
          const res = await playSearch(rest);
          if (res.hasDirectUri) {
            spinner.succeed(`Playing: ${theme.primary(res.trackName)}`);
          } else {
            spinner.succeed(`Searching in Spotify: ${theme.primary(res.trackName)}`);
          }
        }
      }
      setTimeout(async () => {
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
        }
        process.exit(0);
      }, 600);
      break;
    }

    case 'auth':
    case 'config': {
      // Allow passing --client-id and --client-secret
      const cIdIndex = args.indexOf('--client-id');
      const cSecIndex = args.indexOf('--client-secret');
      const updates: any = {};
      if (cIdIndex !== -1 && args[cIdIndex + 1]) {
        updates.spotifyClientId = args[cIdIndex + 1];
      }
      if (cSecIndex !== -1 && args[cSecIndex + 1]) {
        updates.spotifyClientSecret = args[cSecIndex + 1];
      }
      if (Object.keys(updates).length > 0) {
        saveConfig(updates);
        const token = await getSpotifyApiToken();
        if (token) {
          process.stdout.write(`${theme.playing('✔')} Spotify Developer API credentials configured successfully!\n`);
        } else {
          process.stdout.write(`${theme.paused('⚠')} Credentials saved, but token test failed. Please verify keys.\n`);
        }
      } else {
        process.stdout.write(`Usage: spotify config --client-id <ID> --client-secret <SECRET>\n`);
        process.stdout.write(`Get free credentials at: https://developer.spotify.com/dashboard (Zero cost, no credit card)\n`);
      }
      process.exit(0);
    }

    case 'pause':
    case 'stop': {
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
    case 'n':
    case 'skip':
    case 'forward': {
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
    case 'p':
    case 'back': {
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

    case 'replay':
    case 'restart': {
      await seek(0);
      process.stdout.write(`Replayed track from beginning.\n`);
      process.exit(0);
    }

    case 'share':
    case 'link':
    case 'url': {
      const info = await getTrackInfo();
      if (!info || !info.spotifyUrl) {
        process.stderr.write('No active track or URL.\n');
        process.exit(1);
      }
      process.stdout.write(`${info.spotifyUrl}\n`);
      process.exit(0);
    }

    case 'vol':
    case 'volume': {
      if (!rest) {
        const info = await getTrackInfo();
        process.stdout.write(`Volume: ${info?.volume ?? 50}%\n`);
        process.exit(0);
      }
      const instruction = parseVolumeInput(rest);
      const newVol =
        instruction.type === 'adjust'
          ? await adjustVolume(instruction.delta)
          : await setVolume(instruction.value);

      process.stdout.write(`Volume set to ${theme.primary(`${newVol}%`)}\n`);
      process.exit(0);
    }

    case 'seek': {
      if (!rest) {
        process.stdout.write(`Usage: spotify seek <+sec|-sec|+mm:ss|-mm:ss> (e.g. +30, +1:30, 02:00)\n`);
        process.exit(1);
      }
      const instruction = parseSeekInput(rest);
      if (instruction.type === 'relative') {
        const res = await seekRelative(instruction.delta);
        const signStr = instruction.delta >= 0 ? `+${formatTime(instruction.delta)}` : `-${formatTime(Math.abs(instruction.delta))}`;
        const durSuffix = res.durationSec > 0 ? ` / ${res.durationFormatted}` : '';
        process.stdout.write(`Seeked ${theme.primary(signStr)} → ${theme.text(res.positionFormatted)}${theme.muted(durSuffix)}\n`);
      } else {
        const res = await seek(instruction.target);
        const durSuffix = res.durationSec > 0 ? ` / ${res.durationFormatted}` : '';
        process.stdout.write(`Jumped to ${theme.text(res.positionFormatted)}${theme.muted(durSuffix)}\n`);
      }
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

