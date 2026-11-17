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
  parseVolumeInput,
  seek,
  seekRelative,
  parseSeekInput,
  formatTime,
  setShuffle,
  setRepeat,
  playSearch,
  playUri,
  launchSpotify,
  isSpotifyAppRunning,
  getActivePlaybackEngine,
  getDaemonStatus,
  startLibrespotDaemon,
  stopLibrespotDaemon,
  startInteractiveOAuthLogin,
  getValidUserToken,
} from './spotify/player.ts';
import { fetchLyrics, parseLyricsMode } from './spotify/lyrics.ts';
import { getSpotifyApiToken } from './spotify/search.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { renderBanner } from './ui/banner.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
import { runDynamicLyrics, prepareLyricsLines } from './ui/dynamic-lyrics.ts';
import { runSearchPicker } from './ui/search-picker.ts';
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
  '/search',
  '/share',
  '/daemon',
  '/engine',
  '/auth',
  '/config',
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

function createReplInterface(): readline.Interface {
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {}
  }
  process.stdin.resume();
  cursor.show();
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
  });
}

export async function startRepl(): Promise<void> {
  let rl: readline.Interface | null = createReplInterface();

  const printBanner = async () => {
    const theme = getTheme();
    process.stdout.write('\n' + renderBanner() + '\n\n');
    process.stdout.write(
      `  ${theme.primary(theme.symbol)} ${bold(theme.heading('SPOTIFY-CLI'))} ${theme.muted(dim('v1.0.0'))} ${theme.border('─')} ${theme.accent('macOS Native')} ${theme.border('─')} ${theme.muted('Theme:')} ${theme.secondary(theme.name.toUpperCase())}\n`
    );
    process.stdout.write(
      `  ${theme.muted('Operate Spotify seamlessly from terminal. Type')} ${theme.primary('/help')} ${theme.muted('for commands,')} ${theme.primary('/watch')} ${theme.muted('for live monitor.')}\n\n`
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
    const args = parts.slice(1).join(' ').trim();
    const theme = getTheme();

    switch (cmd) {
      case '/exit':
      case '/quit':
      case 'exit':
      case 'quit':
      case ':q':
      case 'q':
        process.stdout.write(`  ${theme.muted('Goodbye!')}\n\n`);
        return false;

      case '/clear':
      case 'clear':
      case 'cls':
        cursor.clearScreen();
        await printBanner();
        return true;

      case '/help':
      case 'help':
      case '?':
      case '-h':
      case '--help':
        process.stdout.write('\n' + renderHelpCard() + '\n\n');
        return true;

      case '/now':
      case '/status':
      case '/current':
      case 'now':
      case 'status':
      case 'current':
      case 'track':
      case 'song':
      case 'info':
      case 'np': {
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

      case '/ticker':
      case 'ticker':
      case 'compact': {
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
        } else {
          process.stdout.write(`  ${theme.muted('Spotify is idle.')}\n\n`);
        }
        return true;
      }

      case '/watch':
      case '/live':
      case '/hud':
      case 'watch':
      case 'live':
      case 'hud': {
        // Fully close readline so process.stdin is 100% available to raw keypresses
        if (rl) {
          rl.close();
          rl = null;
        }

        cursor.clearScreen();
        await runLiveHUD();

        // Recreate readline interface cleanly
        rl = createReplInterface();
        await printBanner();
        return true;
      }

      case '/play':
      case 'play':
      case 'resume': {
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
            spinner.succeed(`Playing: ${theme.primary(args)}`);
          } else {
            const res = await playSearch(args);
            if (res.hasDirectUri) {
              spinner.succeed(`Playing: ${theme.primary(res.trackName)}`);
            } else {
              spinner.warn(`Could not resolve playable track for: ${theme.primary(res.trackName)}. Try: /search ${args}`);
            }
          }
          await new Promise((r) => setTimeout(r, 450));
          const info = await getTrackInfo();
          if (info && info.state === 'playing') {
            process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
          }
        }
        return true;
      }

      case '/search':
      case 'search':
      case '/find':
      case 'find': {
        if (!args) {
          process.stdout.write(`  ${theme.muted('Usage: /search <song, artist, or album>')}\n\n`);
          return true;
        }

        // Close readline interface so search picker has full control of stdin
        if (rl) {
          rl.close();
          rl = null;
        }

        const selected = await runSearchPicker(args);
        rl = createReplInterface();

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
              spinner.warn(`Could not resolve playable track for: ${theme.primary(selected.name)}`);
            }
          }
          await new Promise((r) => setTimeout(r, 450));
          const info = await getTrackInfo();
          if (info && info.state === 'playing') {
            process.stdout.write('\n' + renderTrackCard(info) + '\n\n');
          }
        }
        return true;
      }

      case '/pause':
      case 'pause':
      case 'stop': {
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
      case 'n':
      case 'skip':
      case 'forward': {
        const spinner = createSpinner('Skipping to next track...').start();
        await next();
        spinner.succeed('Skipped.');
        await new Promise((r) => setTimeout(r, 350));
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
        }
        return true;
      }

      case '/prev':
      case '/previous':
      case '/p':
      case 'prev':
      case 'p':
      case 'previous':
      case 'back': {
        const spinner = createSpinner('Going to previous track...').start();
        await previous();
        spinner.succeed('Previous track.');
        await new Promise((r) => setTimeout(r, 350));
        const info = await getTrackInfo();
        if (info) {
          process.stdout.write(`  ${renderCompactTicker(info)}\n\n`);
        }
        return true;
      }

      case '/replay':
      case 'replay':
      case 'restart': {
        await seek(0);
        process.stdout.write(`  ${theme.playing('✔')} Replayed track from beginning.\n\n`);
        return true;
      }

      case '/vol':
      case '/volume':
      case 'vol':
      case 'volume':
      case 'v': {
        if (!args) {
          const info = await getTrackInfo();
          const current = info?.volume ?? 50;
          process.stdout.write(`  🔊 Volume: ${theme.primary(`${current}%`)}\n\n`);
          return true;
        }

        const instruction = parseVolumeInput(args);
        const newVol =
          instruction.type === 'adjust'
            ? await adjustVolume(instruction.delta)
            : await setVolume(instruction.value);

        process.stdout.write(`  🔊 Volume set to ${theme.primary(`${newVol}%`)}\n\n`);
        return true;
      }

      case '/seek':
      case 'seek': {
        if (!args) {
          process.stdout.write(`  ${theme.muted('Usage: /seek <+sec|-sec|+mm:ss|-mm:ss> (e.g. /seek +30, /seek +1:30, /seek 02:00)')}\n\n`);
          return true;
        }

        const instruction = parseSeekInput(args);
        if (instruction.type === 'relative') {
          const res = await seekRelative(instruction.delta);
          const signStr = instruction.delta >= 0 ? `+${formatTime(instruction.delta)}` : `-${formatTime(Math.abs(instruction.delta))}`;
          const durSuffix = res.durationSec > 0 ? ` / ${res.durationFormatted}` : '';
          process.stdout.write(
            `  ${theme.primary(theme.symbol)} Seeked ${theme.primary(signStr)} → ${theme.text(res.positionFormatted)}${theme.muted(durSuffix)}\n\n`
          );
        } else {
          const res = await seek(instruction.target);
          const durSuffix = res.durationSec > 0 ? ` / ${res.durationFormatted}` : '';
          process.stdout.write(
            `  ${theme.primary(theme.symbol)} Jumped to ${theme.text(res.positionFormatted)}${theme.muted(durSuffix)}\n\n`
          );
        }
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
      case 'lyrics':
      case 'words': {
        const mode = parseLyricsMode(args);

        if (mode === 'dynamic') {
          if (rl) {
            rl.close();
            rl = null;
          }
          await runDynamicLyrics();
          rl = createReplInterface();
          return true;
        }

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

        const durSec = info.durationMs > 0 ? info.durationMs / 1000 : 180;
        const linesToDisplay = prepareLyricsLines(lyrics, durSec);

        const romanizedBadge = lyrics.transliterated ? ` ${theme.muted('[Romanized]')}` : '';
        spinner.succeed(
          `Lyrics for ${theme.heading(lyrics.trackName)} by ${theme.secondary(lyrics.artistName)}${romanizedBadge}:`
        );
        process.stdout.write('\n');

        for (const line of linesToDisplay) {
          const timestamp = `${theme.muted(`[${line.timeFormatted}]`)}  `;
          const lineText = line.text ? theme.text(line.text) : '';
          process.stdout.write(`  ${timestamp}${lineText}\n`);
        }
        process.stdout.write('\n');

        process.stdout.write(
          `  ${theme.muted('💡 Tip: Type')} ${theme.primary('/lyrics -d')} ${theme.muted('for live 4-line dynamic lyrics.')}\n\n`
        );
        return true;
      }

      case '/share':
      case 'share':
      case 'link':
      case 'url': {
        const info = await getTrackInfo();
        if (!info || !info.spotifyUrl) {
          process.stdout.write(`  ${theme.paused('No track playing or link available.')}\n\n`);
        } else {
          process.stdout.write(`  🔗 Link: ${theme.primary(info.spotifyUrl)}\n\n`);
        }
        return true;
      }

      case '/engine':
      case 'engine': {
        const engine = await getActivePlaybackEngine();
        const dStatus = getDaemonStatus();
        process.stdout.write(`\n  ${theme.primary(theme.symbol)} ${bold(theme.heading('Playback Engine Status'))}\n`);
        if (engine === 'applescript') {
          process.stdout.write(`  Engine:   ${theme.playing('● Spotify Desktop App (AppleScript)')}\n`);
          process.stdout.write(`  Quality:  320 kbps (Native desktop client)\n`);
        } else {
          process.stdout.write(`  Engine:   ${theme.playing('● Headless Daemon (librespot)')}\n`);
          process.stdout.write(`  Quality:  320 kbps Extreme (macOS CoreAudio)\n`);
          process.stdout.write(`  RAM/CPU:  ~20 MB RAM / <0.5% CPU (Spotify app is closed)\n`);
        }
        process.stdout.write(`  Daemon:   ${dStatus.running ? theme.playing(`Running (PID: ${dStatus.pid})`) : theme.muted('Stopped')}\n\n`);
        return true;
      }

      case '/daemon':
      case 'daemon': {
        const subCmd = args.toLowerCase().trim();
        const dStatus = getDaemonStatus();

        if (subCmd === 'start') {
          const res = startLibrespotDaemon();
          if (res.success) {
            process.stdout.write(`  ${theme.playing('✔')} ${res.message}\n\n`);
          } else {
            process.stdout.write(`  ${theme.paused('✖')} ${res.message}\n\n`);
          }
        } else if (subCmd === 'stop') {
          const res = stopLibrespotDaemon();
          process.stdout.write(`  ${theme.playing('✔')} ${res.message}\n\n`);
        } else if (subCmd === 'restart') {
          stopLibrespotDaemon();
          await new Promise((r) => setTimeout(r, 400));
          const res = startLibrespotDaemon();
          process.stdout.write(`  ${theme.playing('✔')} Restarted daemon: ${res.message}\n\n`);
        } else {
          process.stdout.write(`\n  ${theme.primary(theme.symbol)} ${bold(theme.heading('Headless Audio Daemon (librespot)'))}\n`);
          process.stdout.write(`  Installed:  ${dStatus.installed ? theme.playing('YES') + ' (' + dStatus.binaryPath + ')' : theme.paused('NO (run brew install librespot)')}\n`);
          process.stdout.write(`  Status:     ${dStatus.running ? theme.playing('RUNNING') + ` (PID: ${dStatus.pid})` : theme.muted('STOPPED')}\n`);
          process.stdout.write(`  Cache:      ${theme.muted(dStatus.cacheDir)}\n`);
          process.stdout.write(`  Usage:      ${theme.primary('/daemon start')} | ${theme.primary('/daemon stop')} | ${theme.primary('/daemon restart')}\n\n`);
        }
        return true;
      }

      case '/auth':
      case '/config':
      case 'auth':
      case 'config': {
        const sub = args.toLowerCase().trim();
        if (sub === 'login' || sub === 'browser' || !sub) {
          process.stdout.write(`\n  ${theme.primary(theme.symbol)} ${bold(theme.heading('Spotify 1-Click Browser Authentication'))}\n`);
          process.stdout.write(`  ${theme.muted('Opening Spotify login in your default browser...')}\n`);
          process.stdout.write(`  ${theme.muted('Click "Agree" in your browser to authorize headless playback.')}\n\n`);

          const res = await startInteractiveOAuthLogin();
          if (res.success) {
            process.stdout.write(`  ${theme.playing('✔')} ${res.message}\n\n`);
          } else {
            process.stdout.write(`  ${theme.paused('✖')} ${res.message}\n\n`);
          }
          return true;
        }

        process.stdout.write(`\n  ${theme.primary(theme.symbol)} ${bold(theme.heading('Spotify API Configuration (Developer Credentials)'))}\n`);
        process.stdout.write(`  ${theme.muted('Get free credentials at:')} ${theme.primary('https://developer.spotify.com/dashboard')}\n\n`);

        const clientId = await rl.question(`  Client ID (leave blank to keep current): `);
        const clientSecret = await rl.question(`  Client Secret (leave blank to keep current): `);

        const updates: any = {};
        if (clientId.trim()) updates.spotifyClientId = clientId.trim();
        if (clientSecret.trim()) updates.spotifyClientSecret = clientSecret.trim();

        if (Object.keys(updates).length > 0) {
          saveConfig(updates);
          const token = await getSpotifyApiToken();
          if (token) {
            process.stdout.write(`  ${theme.playing('✔')} Connected to Spotify Web API successfully!\n\n`);
          } else {
            process.stdout.write(`  ${theme.paused('⚠')} Keys saved, but could not verify token. Please re-check keys.\n\n`);
          }
        } else {
          process.stdout.write(`  ${theme.muted('No changes made.')}\n\n`);
        }
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
          if (rl) {
            rl.close();
            rl = null;
          }
          const chosen = await promptSelect(
            'Select UI Theme:',
            validThemes.map((t) => ({
              title: t.toUpperCase(),
              subtitle:
                t === 'spotify'
                  ? 'Leaf Green, Bottle Green & Pure White (Default)'
                  : t === 'celestial'
                  ? 'Electric Sky & Indigo Spark'
                  : t === 'amber'
                  ? 'Warm Terracotta & Stone'
                  : 'Neon Cyan & Pink Cyberpunk',
              value: t,
            }))
          );
          rl = createReplInterface();
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
        process.stdout.write(
          `  ${theme.paused('Unknown command:')} ${theme.text(trimmed)}. Did you mean ${theme.primary('/play ' + trimmed)}? Type ${theme.primary('/help')} for commands.\n\n`
        );
        return true;
      }
    }
  };

  while (true) {
    if (!rl) {
      rl = createReplInterface();
    }
    const theme = getTheme();
    cursor.show();
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

  if (rl) {
    rl.close();
  }
}
