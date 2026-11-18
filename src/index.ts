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
  playUriDetailed,
  getActivePlaybackEngine,
  getDaemonStatus,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  startInteractiveOAuthLogin,
  startLibrespotInteractiveAuth,
  isHeadlessReady,
  isSpotifyRunning,
} from './spotify/player.ts';
import { fetchLyrics, parseLyricsMode } from './spotify/lyrics.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { renderBanner } from './ui/banner.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
import { runDynamicLyrics, prepareLyricsLines } from './ui/dynamic-lyrics.ts';
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
        const isAppRunning = await isSpotifyRunning();
        if (!isAppRunning && !isHeadlessReady()) {
          process.stdout.write(`\n  ${theme.paused('✖')} Spotify desktop app is not running, and Headless mode is not authenticated.\n`);
          process.stdout.write(`  ${theme.muted('To stream music without the Spotify app, authenticate once with:')}\n`);
          process.stdout.write(`    ${theme.primary('spotify auth')}\n\n`);
          process.exit(1);
        }

        const spinner = createSpinner(`Playing "${selected.name}"...`).start();
        if (selected.uri) {
          const res = await playUriDetailed(selected.uri);
          if (res.success) {
            spinner.succeed(`Playing: ${theme.primary(selected.name)} by ${theme.secondary(selected.artist)}`);
          } else {
            spinner.fail(`Could not play: ${theme.primary(selected.name)}. ${res.error || ''}`);
            process.exit(1);
          }
        } else {
          const res = await playSearch(`${selected.name} ${selected.artist}`);
          if (res.success) {
            spinner.succeed(`Playing: ${theme.primary(res.trackName)}`);
          } else {
            spinner.fail(`Could not play: ${theme.primary(selected.name)}. ${res.error || ''}`);
            process.exit(1);
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
        const result = await play();
        if (result.success) {
          spinner.succeed(result.message);
          const info = result.track || (await getTrackInfo());
          if (info) {
            process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
          }
          process.exit(0);
        } else {
          spinner.fail(result.message);
          process.stdout.write(`Usage: spotify play <song title, artist, or album>\n`);
          process.exit(1);
        }
      } else {
        const isAppRunning = await isSpotifyRunning();
        if (!isAppRunning && !isHeadlessReady()) {
          process.stdout.write(`\n  ${theme.paused('✖')} Spotify desktop app is not running, and Headless mode is not authenticated.\n`);
          process.stdout.write(`  ${theme.muted('To stream music without the Spotify app, authenticate once with:')}\n`);
          process.stdout.write(`    ${theme.primary('spotify auth')}\n\n`);
          process.exit(1);
        }
        const spinner = createSpinner(`Searching and playing "${rest}"...`).start();
        if (rest.startsWith('spotify:')) {
          const res = await playUriDetailed(rest);
          if (res.success) {
            spinner.succeed(`Playing: ${theme.primary(rest)}`);
          } else {
            spinner.fail(`Could not play: ${theme.primary(rest)}. ${res.error || ''}`);
            process.exit(1);
          }
        } else {
          const res = await playSearch(rest);
          if (res.success) {
            spinner.succeed(`Playing: ${theme.primary(res.trackName)}`);
          } else {
            spinner.fail(`Could not play: ${theme.primary(res.trackName || rest)}. ${res.error || ''}`);
            process.exit(1);
          }
        }
      }
      // Poll briefly for playback to begin and display track card
      let info: TrackInfo | null = null;
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 250));
        info = await getTrackInfo();
        if (info && info.state === 'playing') break;
      }
      if (info) {
        process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
      }
      process.exit(0);
      break;
    }

    case 'engine': {
      const engine = await getActivePlaybackEngine();
      const dStatus = getDaemonStatus();
      process.stdout.write(`\n${bold('Spotify-CLI Playback Engine:')}\n`);
      if (engine === 'applescript') {
        process.stdout.write(`  Engine:   ${theme.playing('● Spotify Desktop App (AppleScript)')}\n`);
        process.stdout.write(`  Quality:  320 kbps (Desktop client)\n`);
      } else {
        process.stdout.write(`  Engine:   ${theme.playing('● Headless Daemon (librespot)')}\n`);
        process.stdout.write(`  Quality:  320 kbps Extreme (CoreAudio rodio)\n`);
        process.stdout.write(`  RAM/CPU:  ~20 MB RAM / <0.5% CPU (Headless)\n`);
      }
      process.stdout.write(`  Daemon:   ${dStatus.running ? theme.playing(`Running (PID: ${dStatus.pid})`) : theme.muted('Stopped')}\n\n`);
      process.exit(0);
    }

    case 'daemon': {
      const subCmd = (args[0] || '').toLowerCase().trim();
      const dStatus = getDaemonStatus();

      if (subCmd === 'start') {
        const res = startLibrespotDaemon();
        if (res.success) {
          process.stdout.write(`${theme.playing('✔')} ${res.message}\n`);
        } else {
          process.stdout.write(`${theme.paused('✖')} ${res.message}\n`);
        }
      } else if (subCmd === 'stop') {
        const res = stopLibrespotDaemon();
        process.stdout.write(`${theme.playing('✔')} ${res.message}\n`);
      } else if (subCmd === 'restart') {
        stopLibrespotDaemon();
        await new Promise((r) => setTimeout(r, 400));
        const res = startLibrespotDaemon();
        process.stdout.write(`${theme.playing('✔')} Restarted daemon: ${res.message}\n`);
      } else {
        process.stdout.write(`\n${bold('Headless Audio Daemon (librespot):')}\n`);
        process.stdout.write(`  Installed:  ${dStatus.installed ? theme.playing('YES') + ' (' + dStatus.binaryPath + ')' : theme.paused('NO (brew install librespot)')}\n`);
        process.stdout.write(`  Status:     ${dStatus.running ? theme.playing('RUNNING') + ` (PID: ${dStatus.pid})` : theme.muted('STOPPED')}\n`);
        process.stdout.write(`  Cache:      ${theme.muted(dStatus.cacheDir)}\n`);
        process.stdout.write(`  Usage:      spotify daemon start | stop | restart\n\n`);
      }
      process.exit(0);
    }

    case 'auth':
    case 'config': {
      // If run as 'spotify auth' or 'spotify auth login'
      if (!args.includes('--client-id') && !args.includes('--client-secret')) {
        process.stdout.write(`\n${bold('Spotify 1-Click Browser Authentication')}\n`);
        process.stdout.write(`Opening Spotify login in your default browser...\n`);
        process.stdout.write(`Click "Agree" in your browser to authorize headless playback.\n\n`);

        const res = await startLibrespotInteractiveAuth();
        if (res.success) {
          process.stdout.write(`${theme.playing('✔')} ${res.message}\n`);
        } else {
          process.stdout.write(`${theme.paused('✖')} ${res.message}\n`);
        }
        process.exit(0);
      }

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
        if (updates.spotifyClientId && !updates.spotifyClientSecret) {
          process.stdout.write(`${theme.playing('✔')} Spotify Client ID saved successfully!\n`);
          process.stdout.write(`Run ${theme.primary('spotify auth')} to link your Spotify account with your dedicated quota.\n\n`);
        } else {
          const token = await getSpotifyApiToken();
          if (token) {
            process.stdout.write(`${theme.playing('✔')} Spotify Developer API credentials configured successfully!\n`);
          } else {
            process.stdout.write(`${theme.paused('⚠')} Credentials saved, but token test failed. Please verify keys.\n`);
          }
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
      const mode = parseLyricsMode(rest);

      if (mode === 'dynamic') {
        await runDynamicLyrics();
        process.exit(0);
      }

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

      const durSec = info.durationMs > 0 ? info.durationMs / 1000 : 180;
      const linesToDisplay = prepareLyricsLines(lyrics, durSec);

      const romanizedBadge = lyrics.transliterated ? ` ${theme.muted('[Romanized]')}` : '';
      spinner.succeed(
        `Lyrics for ${bold(lyrics.trackName)} by ${lyrics.artistName}${romanizedBadge}:\n`
      );

      for (const line of linesToDisplay) {
        const timestamp = `${theme.muted(`[${line.timeFormatted}]`)}  `;
        process.stdout.write(`  ${timestamp}${theme.text(line.text)}\n`);
      }

      process.stdout.write(
        `\n  ${theme.muted('💡 Tip: Run')} ${theme.primary('spotify lyrics -d')} ${theme.muted('for live 4-line dynamic lyrics.')}\n`
      );
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

