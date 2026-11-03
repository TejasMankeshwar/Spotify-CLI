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
  setShuffle,
  setRepeat,
  playSearch,
  playUri,
  launchSpotify,
  isSpotifyRunning,
} from './spotify/applescript.ts';
import { fetchLyrics } from './spotify/lyrics.ts';
import { getSpotifyApiToken } from './spotify/search.ts';
import { renderTrackCard, renderCompactTicker, renderHelpCard } from './ui/card.ts';
import { renderBanner } from './ui/banner.ts';
import { createSpinner } from './ui/spinner.ts';
import { runLiveHUD } from './ui/live-ticker.ts';
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
      case 'lyrics':
      case 'words': {
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

      case '/auth':
      case '/config':
      case 'auth':
      case 'config': {
        process.stdout.write(`\n  ${theme.primary(theme.symbol)} ${bold(theme.heading('Spotify API Configuration (100% Free)'))}\n`);
        process.stdout.write(`  ${theme.muted('Spotify Developer credentials allow direct catalog search & instant playback.')}\n`);
        process.stdout.write(`  ${theme.muted('Get yours free in 1 min at:')} ${theme.primary('https://developer.spotify.com/dashboard')} ${theme.muted('(Zero cost, no credit card)')}\n\n`);

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
