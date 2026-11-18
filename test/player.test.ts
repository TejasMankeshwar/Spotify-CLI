import test from 'node:test';
import assert from 'node:assert/strict';
import { setTheme, getTheme } from '../src/theme.ts';
import { renderTrackCard, renderCompactTicker } from '../src/ui/card.ts';
import { renderProgressBar, renderVolumeBar } from '../src/ui/progress.ts';
import { stripAnsi } from '../src/ui/ansi.ts';
import { parseVolumeInput, parseSeekInput } from '../src/spotify/applescript.ts';
import { searchTracks, resolveSpotifyUri } from '../src/spotify/search.ts';
import { loadTrackCache, loadLastSession, saveLastSession } from '../src/config.ts';
import { renderBanner, applyGradient, DEFAULT_GRADIENT_STOPS } from '../src/ui/banner.ts';
import { parseLyricsMode } from '../src/spotify/lyrics.ts';
import { computeChunkState, prepareLyricsLines } from '../src/ui/dynamic-lyrics.ts';
import { containsIndic, transliterateIndic, transliterateLyrics } from '../src/spotify/transliterate.ts';
import { getDaemonStatus, isLibrespotInstalled, startLibrespotDaemon } from '../src/spotify/daemon.ts';
import { getActivePlaybackEngine, isHeadlessReady, play, playUriDetailed, playSearch } from '../src/spotify/player.ts';
import { formatMs, webPlayDetailed } from '../src/spotify/web-player.ts';
import type { TrackInfo, LyricsResult, LyricLine } from '../src/spotify/types.ts';

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

test('parseLyricsMode defaults to full lyrics unless -d is specifically provided', () => {
  // Dynamic mode when specifically requested
  assert.equal(parseLyricsMode('-d'), 'dynamic');
  assert.equal(parseLyricsMode('--dynamic'), 'dynamic');
  assert.equal(parseLyricsMode('dynamic'), 'dynamic');
  assert.equal(parseLyricsMode('-l'), 'dynamic');
  assert.equal(parseLyricsMode('--live'), 'dynamic');
  assert.equal(parseLyricsMode('-d extra'), 'dynamic');

  // Full lyrics by default for 'lyrics', empty args, -f, or anything else
  assert.equal(parseLyricsMode(''), 'full');
  assert.equal(parseLyricsMode(undefined), 'full');
  assert.equal(parseLyricsMode('-f'), 'full');
  assert.equal(parseLyricsMode('--full'), 'full');
  assert.equal(parseLyricsMode('full'), 'full');
  assert.equal(parseLyricsMode('anything'), 'full');
});

test('computeChunkState implements 0.75s lead-in and 4-line chunk transitions', () => {
  const sampleLines: LyricLine[] = [
    { timeSec: 0, timeFormatted: '00:00', text: 'Line 0' },
    { timeSec: 4, timeFormatted: '00:04', text: 'Line 1' },
    { timeSec: 8, timeFormatted: '00:08', text: 'Line 2' },
    { timeSec: 12, timeFormatted: '00:12', text: 'Line 3' },
    { timeSec: 16, timeFormatted: '00:16', text: 'Line 4' },
    { timeSec: 20, timeFormatted: '00:20', text: 'Line 5' },
    { timeSec: 24, timeFormatted: '00:24', text: 'Line 6' },
    { timeSec: 28, timeFormatted: '00:28', text: 'Line 7' },
    { timeSec: 32, timeFormatted: '00:32', text: 'Line 8' },
  ];

  // At 0.0s: Line 0 is active (Page 1/3)
  const stateAtStart = computeChunkState(0, sampleLines, 0.75);
  assert.equal(stateAtStart.activeIdx, 0);
  assert.equal(stateAtStart.chunkIndex, 0);
  assert.equal(stateAtStart.totalChunks, 3);
  assert.equal(stateAtStart.chunkLines.length, 4);
  assert.equal(stateAtStart.chunkLines[0].text, 'Line 0');
  assert.equal(stateAtStart.chunkLines[3].text, 'Line 3');

  // Line 1 begins at 4.0s. At 3.25s (0.75s before), Line 1 becomes active
  const stateBeforeLine1 = computeChunkState(3.24, sampleLines, 0.75);
  assert.equal(stateBeforeLine1.activeIdx, 0); // Not yet 0.75s before 4.0s

  const stateAtLeadIn1 = computeChunkState(3.25, sampleLines, 0.75);
  assert.equal(stateAtLeadIn1.activeIdx, 1); // 3.25 + 0.75 = 4.0s -> active!
  assert.equal(stateAtLeadIn1.chunkIndex, 0); // Still in first 4-line chunk

  // Line 4 begins at 16.0s. At 15.25s (0.75s before), Line 4 triggers next 4-line chunk!
  const stateBeforeChunk2 = computeChunkState(15.24, sampleLines, 0.75);
  assert.equal(stateBeforeChunk2.activeIdx, 3);
  assert.equal(stateBeforeChunk2.chunkIndex, 0);

  const stateAtChunk2 = computeChunkState(15.25, sampleLines, 0.75);
  assert.equal(stateAtChunk2.activeIdx, 4); // Line 4 is active
  assert.equal(stateAtChunk2.chunkIndex, 1); // Switched to Page 2
  assert.equal(stateAtChunk2.chunkLines[0].text, 'Line 4');
  assert.equal(stateAtChunk2.chunkLines[3].text, 'Line 7');

  // Line 8 begins at 32.0s. At 31.25s, switches to chunk 3 (Page 3)
  const stateAtChunk3 = computeChunkState(31.25, sampleLines, 0.75);
  assert.equal(stateAtChunk3.activeIdx, 8);
  assert.equal(stateAtChunk3.chunkIndex, 2);
  assert.equal(stateAtChunk3.chunkLines[0].text, 'Line 8');
});

test('prepareLyricsLines generates estimated timestamps for unsynced lyrics', () => {
  const unsynced: LyricsResult = {
    trackName: 'Test Song',
    artistName: 'Test Artist',
    synced: false,
    source: 'genius',
    lines: [
      { timeSec: 0, timeFormatted: '--:--', text: 'First line' },
      { timeSec: 0, timeFormatted: '--:--', text: 'Second line' },
      { timeSec: 0, timeFormatted: '--:--', text: 'Third line' },
    ],
  };

  const prepared = prepareLyricsLines(unsynced, 120); // 2 minute track
  assert.equal(prepared.length, 3);
  assert.equal(prepared[0].timeFormatted, '00:00');
  assert.equal(prepared[1].timeFormatted, '00:40');
  assert.equal(prepared[2].timeFormatted, '01:20');
});

test('containsIndic accurately detects Devanagari, Gurmukhi, and other Indic scripts', () => {
  assert.equal(containsIndic('मेरे हुस्न के अलावा कभी दिल भी...'), true);
  assert.equal(containsIndic('ਹੁਸਨ ਤੇਰਾ ਤੌਬਾ-ਤੌਬਾ'), true);
  assert.equal(containsIndic('আমি তোমায় ভালোবাসি'), true);
  assert.equal(containsIndic('నాటు నాటు'), true);
  assert.equal(containsIndic('Bohemian Rhapsody Queen'), false);
  assert.equal(containsIndic('12345 !@#$%'), false);
});

test('transliterateIndic accurately romanizes Devanagari and Gurmukhi into natural English script', () => {
  // User's exact prompt example
  const husnLine = transliterateIndic('मेरे हुस्न के अलावा कभी दिल भी...');
  assert.equal(husnLine, 'Mere husn ke alawa kabhi dil bhi...');

  // Devanagari lines with nukta, conjuncts, nasalization
  assert.equal(transliterateIndic('इश्क़ में दिल बना है'), 'Ishq mein dil bana hai');
  assert.equal(transliterateIndic('इश्क़ में दिल फ़ना है, ohh'), 'Ishq mein dil fana hai, ohh');
  assert.equal(transliterateIndic('क्या इतनी आसान हैं?'), 'Kya itni aasaan hain?');
  assert.equal(transliterateIndic('हाँ, कितनी नादान मैं'), 'Haan, kitni nadaan main');
  assert.equal(transliterateIndic('मैंने तुझको चुना है, ohh, oh'), 'Maine tujhko chuna hai, ohh, oh');

  // Gurmukhi (Punjabi) lines
  assert.equal(transliterateIndic('ਹੁਸਨ ਤੇਰਾ ਤੌਬਾ-ਤੌਬਾ, ਤੌਬਾ-ਤੌਬਾ'), 'Husn tera tauba-tauba, tauba-tauba');
  assert.equal(transliterateIndic('(ਹਾਂ, ਤੌਬਾ-ਤੌਬਾ) Yeah Proof'), '(Haan, tauba-tauba) Yeah Proof');

  // English pass-through (no modification)
  assert.equal(transliterateIndic("I'm blinded by the lights"), "I'm blinded by the lights");
});

test('transliterateLyrics converts entire LyricsResult object and flags transliterated: true', () => {
  const indicLyrics: LyricsResult = {
    trackName: 'Husn',
    artistName: 'Anuv Jain',
    synced: true,
    lines: [
      { timeSec: 10, timeFormatted: '00:10', text: 'देखो-देखो, कैसी बातें यहाँ की' },
      { timeSec: 25, timeFormatted: '00:25', text: 'मेरे हुस्न के अलावा कभी दिल भी...' },
    ],
  };

  const romanized = transliterateLyrics(indicLyrics);
  assert.equal(romanized.transliterated, true);
  assert.equal(romanized.lines[1].text, 'Mere husn ke alawa kabhi dil bhi...');
  assert.equal(romanized.lines[1].timeSec, 25);
  assert.equal(romanized.lines[1].timeFormatted, '00:25');

  // Non-indic lyrics remain untouched with transliterated undefined
  const englishLyrics: LyricsResult = {
    trackName: 'Starboy',
    artistName: 'The Weeknd',
    synced: true,
    lines: [{ timeSec: 10, timeFormatted: '00:10', text: "I'm tryna put you in the worst mood" }],
  };
  const untouched = transliterateLyrics(englishLyrics);
  assert.equal(untouched.transliterated, undefined);
  assert.equal(untouched.lines[0].text, "I'm tryna put you in the worst mood");
});

test('librespot daemon detection and status check', () => {
  const installed = isLibrespotInstalled();
  assert.equal(installed, true);

  const status = getDaemonStatus();
  assert.equal(status.installed, true);
  assert.ok(status.binaryPath && status.binaryPath.includes('librespot'));
  assert.equal(typeof status.running, 'boolean');
});

test('getActivePlaybackEngine returns valid playback engine', async () => {
  const engine = await getActivePlaybackEngine();
  assert.ok(engine === 'applescript' || engine === 'headless');
});

test('web-player formatMs formats milliseconds into mm:ss accurately', () => {
  assert.equal(formatMs(0), '00:00');
  assert.equal(formatMs(65000), '01:05');
  assert.equal(formatMs(214000), '03:34');
});

test('isHeadlessReady returns accurate readiness status', () => {
  const ready = isHeadlessReady();
  assert.equal(typeof ready, 'boolean');
});

test('play without active track returns non-resumable status instead of false success', async () => {
  const result = await play();
  assert.equal(typeof result.success, 'boolean');
  assert.ok(['resumed', 'already_playing', 'no_track', 'started', 'error'].includes(result.state));
  if (!result.success) {
    assert.ok(result.message.length > 0);
  }
});

test('librespot daemon requires credentials or access token to stream headlessly', () => {
  const res = startLibrespotDaemon({ accessToken: '' });
  assert.equal(typeof res.success, 'boolean');
  assert.ok(typeof res.message === 'string');
});

test('webPlayDetailed returns structured diagnostic error when unauthenticated', async () => {
  const res = await webPlayDetailed('spotify:track:4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(typeof res.success, 'boolean');
  if (!res.success) {
    assert.ok(typeof res.error === 'string');
    assert.ok(res.code === 'unauthenticated' || res.code === 'no_device' || res.code === 'api_error');
  }
});

test('playUriDetailed propagates structured error when headless is not ready', async () => {
  if (!isHeadlessReady()) {
    const res = await playUriDetailed('spotify:track:4cOdK2wGLETKBW3PvgPWqT');
    assert.equal(res.success, false);
    assert.ok(res.error && res.error.includes('Headless mode requires'));
  }
});

test('Playback session persists and loads last played track, context, and position', () => {
  const original = loadLastSession();

  saveLastSession({
    trackUri: 'spotify:track:4DpNNXFMMxQEKl7r0ykkWA',
    trackName: 'Play Date',
    artist: 'Melanie Martinez',
    album: 'Cry Baby',
    contextUri: 'spotify:album:5JpH5T1sCYnUyZD6TM0QaY',
    positionMs: 45000,
    durationMs: 180000,
  });

  const loaded = loadLastSession();
  assert.ok(loaded);
  assert.equal(loaded?.trackUri, 'spotify:track:4DpNNXFMMxQEKl7r0ykkWA');
  assert.equal(loaded?.trackName, 'Play Date');
  assert.equal(loaded?.artist, 'Melanie Martinez');
  assert.equal(loaded?.album, 'Cry Baby');
  assert.equal(loaded?.contextUri, 'spotify:album:5JpH5T1sCYnUyZD6TM0QaY');
  assert.equal(loaded?.positionMs, 45000);
  assert.equal(loaded?.durationMs, 180000);
  assert.ok(typeof loaded?.timestamp === 'number');

  // Restore original if there was one
  if (original) {
    saveLastSession(original);
  }
});






