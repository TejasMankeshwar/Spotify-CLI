import test from 'node:test';
import assert from 'node:assert/strict';
import { setTheme, getTheme } from '../src/theme.ts';
import { renderTrackCard, renderCompactTicker } from '../src/ui/card.ts';
import { renderProgressBar, renderVolumeBar } from '../src/ui/progress.ts';
import { stripAnsi } from '../src/ui/ansi.ts';
import { parseVolumeInput } from '../src/spotify/applescript.ts';
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

test('Track card renders accurately in Green theme (default)', () => {
  setTheme('green');
  const card = renderTrackCard(mockTrack);
  const raw = stripAnsi(card);

  assert.ok(raw.includes('Spotify Player'));
  assert.ok(raw.includes('PLAYING'));
  assert.ok(raw.includes('Bohemian Rhapsody'));
  assert.ok(raw.includes('Queen'));
  assert.equal(getTheme().name, 'green');
});

test('Track card renders accurately in Gemini theme', () => {
  setTheme('gemini');
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

test('Track card renders accurately in Claude theme', () => {
  setTheme('claude');
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

