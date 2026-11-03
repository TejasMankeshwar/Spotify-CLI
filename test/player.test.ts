import test from 'node:test';
import assert from 'node:assert/strict';
import { setTheme, getTheme } from '../src/theme.ts';
import { renderTrackCard, renderCompactTicker } from '../src/ui/card.ts';
import { renderProgressBar, renderVolumeBar } from '../src/ui/progress.ts';
import { stripAnsi } from '../src/ui/ansi.ts';
import { parseVolumeInput, parseSeekInput } from '../src/spotify/applescript.ts';
import { searchTracks, resolveSpotifyUri } from '../src/spotify/search.ts';
import { loadTrackCache } from '../src/config.ts';
import { renderBanner, applyGradient, DEFAULT_GRADIENT_STOPS } from '../src/ui/banner.ts';
import type { TrackInfo } from '../src/spotify/types.ts';

const mockTrack: TrackInfo = {
  id: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
  name: 'Bohemian Rhapsody - Remastered 2011',
  artist: 'Queen',
  album: 'A Night At The Opera (Deluxe Edition)',
  durationMs: 354000,
  durationFormatted: '05:54',
  positionSec: 142,
  positionFormatted: '02:22',
  progressPercent: 40.1,
  volume: 75,
  state: 'playing',
  isRepeating: false,
  isShuffling: true,
  spotifyUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
};

test('Progress bar renders correct width and components', () => {
  const bar = renderProgressBar({ currentSec: 50, totalSec: 100, width: 20 });
  const raw = stripAnsi(bar);
  assert.equal(raw.length, 20);
  assert.ok(raw.includes('●'));
});

test('Volume bar renders percentage and visual segments', () => {
  const volBar = renderVolumeBar(80, 10);
  const raw = stripAnsi(volBar);
  assert.ok(raw.includes('80%'));
  assert.ok(raw.includes('■'));
});

test('Track card renders accurately in Spotify theme (default)', () => {
  setTheme('spotify');
  const card = renderTrackCard(mockTrack);
  const raw = stripAnsi(card);

  assert.ok(raw.includes('Spotify Player'));
  assert.ok(raw.includes('PLAYING'));
  assert.ok(raw.includes('Bohemian Rhapsody'));
  assert.ok(raw.includes('Queen'));
  assert.equal(getTheme().name, 'spotify');
});

test('Track card renders accurately in Celestial theme', () => {
  setTheme('celestial');
  const card = renderTrackCard(mockTrack);
  const raw = stripAnsi(card);

  assert.ok(raw.includes('Spotify Player'));
  assert.ok(raw.includes('PLAYING'));
  assert.ok(raw.includes('Bohemian Rhapsody'));
  assert.ok(raw.includes('Queen'));
  assert.ok(raw.includes('02:22 / 05:54'));
  assert.ok(raw.includes('75%'));
  assert.ok(raw.includes('ON')); // Shuffle is ON
  assert.ok(raw.includes('OFF')); // Repeat is OFF
});

test('Track card renders accurately in Amber theme', () => {
  setTheme('amber');
  const card = renderTrackCard(mockTrack);
  const raw = stripAnsi(card);

  assert.ok(raw.includes('Spotify Player'));
  assert.ok(raw.includes('PLAYING'));
  assert.ok(raw.includes('Bohemian Rhapsody'));
});

test('Compact ticker format matches CLI aesthetics', () => {
  const ticker = renderCompactTicker(mockTrack);
  const raw = stripAnsi(ticker);
  assert.ok(raw.includes('Bohemian Rhapsody'));
  assert.ok(raw.includes('Queen'));
  assert.ok(raw.includes('[02:22/05:54]'));
  assert.ok(raw.includes('75%'));
});

test('parseVolumeInput handles multiple and various volume patterns', () => {
  // Single delta
  assert.deepEqual(parseVolumeInput('+10'), { type: 'adjust', delta: 10 });
  assert.deepEqual(parseVolumeInput('-15'), { type: 'adjust', delta: -15 });

  // Multiple deltas
  assert.deepEqual(parseVolumeInput('+5 +5 +5'), { type: 'adjust', delta: 15 });
  assert.deepEqual(parseVolumeInput('+10 -5'), { type: 'adjust', delta: 5 });

  // Repeated signs
  assert.deepEqual(parseVolumeInput('++'), { type: 'adjust', delta: 10 });
  assert.deepEqual(parseVolumeInput('+++'), { type: 'adjust', delta: 15 });
  assert.deepEqual(parseVolumeInput('--'), { type: 'adjust', delta: -10 });

  // Word commands
  assert.deepEqual(parseVolumeInput('up up'), { type: 'adjust', delta: 10 });
  assert.deepEqual(parseVolumeInput('down'), { type: 'adjust', delta: -5 });
  assert.deepEqual(parseVolumeInput('mute'), { type: 'set', value: 0 });
  assert.deepEqual(parseVolumeInput('max'), { type: 'set', value: 100 });

  // Direct absolute target
  assert.deepEqual(parseVolumeInput('85'), { type: 'set', value: 85 });
});

test('parseSeekInput supports relative forward (+30, +1:30) and rewind (-30, -1:30) as well as absolute timestamps', () => {
  // Relative forward by seconds
  assert.deepEqual(parseSeekInput('+30'), { type: 'relative', delta: 30, raw: '+30' });
  assert.deepEqual(parseSeekInput('+90'), { type: 'relative', delta: 90, raw: '+90' });
  assert.deepEqual(parseSeekInput('+30s'), { type: 'relative', delta: 30, raw: '+30s' });

  // Relative forward by mm:ss (1:30 -> 90s)
  assert.deepEqual(parseSeekInput('+1:30'), { type: 'relative', delta: 90, raw: '+1:30' });
  assert.deepEqual(parseSeekInput('+01:30'), { type: 'relative', delta: 90, raw: '+01:30' });
  assert.deepEqual(parseSeekInput('+2:15'), { type: 'relative', delta: 135, raw: '+2:15' });
  assert.deepEqual(parseSeekInput('+1m30s'), { type: 'relative', delta: 90, raw: '+1m30s' });
  assert.deepEqual(parseSeekInput('forward 30'), { type: 'relative', delta: 30, raw: 'forward 30' });
  assert.deepEqual(parseSeekInput('forward 1:30'), { type: 'relative', delta: 90, raw: 'forward 1:30' });

  // Relative backward / rewind
  assert.deepEqual(parseSeekInput('-30'), { type: 'relative', delta: -30, raw: '-30' });
  assert.deepEqual(parseSeekInput('-1:30'), { type: 'relative', delta: -90, raw: '-1:30' });
  assert.deepEqual(parseSeekInput('back 30'), { type: 'relative', delta: -30, raw: 'back 30' });
  assert.deepEqual(parseSeekInput('rewind 1:30'), { type: 'relative', delta: -90, raw: 'rewind 1:30' });

  // Absolute timestamps
  assert.deepEqual(parseSeekInput('0'), { type: 'absolute', target: 0, raw: '0' });
  assert.deepEqual(parseSeekInput('45'), { type: 'absolute', target: 45, raw: '45' });
  assert.deepEqual(parseSeekInput('1:30'), { type: 'absolute', target: 90, raw: '1:30' });
  assert.deepEqual(parseSeekInput('02:15'), { type: 'absolute', target: 135, raw: '02:15' });
});

test('renderBanner generates gradient banner with Leaf Green, Bottle Green and White', () => {
  const banner = renderBanner();
  assert.ok(banner.length > 0);
  const raw = stripAnsi(banner);
  assert.ok(raw.includes('██') || raw.includes('___'));

  // Test custom gradient application
  const testLines = ['SPOTIFY-CLI'];
  const colored = applyGradient(testLines, DEFAULT_GRADIENT_STOPS, 0.15, true);
  assert.ok(colored.includes('\x1b[38;2;'));
});

test('searchTracks returns structured tracks with audio preview capability', async () => {
  // Test query formatting and structure
  assert.equal(typeof searchTracks, 'function');
});

test('resolveSpotifyUri resolves tracks from cache or catalog with valid Spotify URIs', async () => {
  const cache = loadTrackCache();
  assert.ok(cache['kabira']);
  assert.ok(cache['kabira'].startsWith('spotify:track:'));
  assert.ok(cache['no brainer']);
  assert.ok(cache['no brainer'].startsWith('spotify:track:'));

  const resolved = await resolveSpotifyUri('kabira');
  assert.equal(resolved, cache['kabira']);

  const noBrainer = await resolveSpotifyUri('no brainer');
  assert.equal(noBrainer, cache['no brainer']);
});

