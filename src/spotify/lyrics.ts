import type { LyricsResult, LyricLine } from './types.ts';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\(From\s+["']?[^)"']+["']?\)/gi, '')
    .replace(/\s*\(feat\.[^)]+\)/gi, '')
    .replace(/\s*\[feat\.[^\]]+\]/gi, '')
    .replace(/\s*-\s*Remaster(ed)?(\s*\d+)?/gi, '')
    .replace(/\s*-\s*Deluxe(\s*Edition)?/gi, '')
    .replace(/\s*-\s*Bonus\s*Track/gi, '')
    .replace(/\s*\(with\s+[^)]+\)/gi, '')
    .replace(/\s*\(Remaster(ed)?\)/gi, '')
    .replace(/\s*-\s*Single/gi, '')
    .replace(/\s*-\s*Original\s*Motion\s*Picture\s*Soundtrack/gi, '')
    .replace(/\s*\(Original\s*Motion\s*Picture\s*Soundtrack\)/gi, '')
    .trim();
}

export function cleanArtistName(artist: string): string {
  // Take primary artist before comma, slash, or feat
  return artist.split(',')[0].split('/')[0].split(' feat.')[0].trim();
}

// 1. LRCLIB (Open synced and plain lyrics database)
async function tryLrclib(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: track,
      artist_name: artist,
    });

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'Spotify-CLI (https://github.com/developer/spotify-cli)',
      },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return null;

    const data: any = await res.json();
    const lines: LyricLine[] = [];

    if (data.syncedLyrics) {
      const rawLines = data.syncedLyrics.split('\n');
      const timeRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

      for (const line of rawLines) {
        const match = line.match(timeRegex);
        if (match) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const text = match[4].trim();
          lines.push({
            timeSec: mins * 60 + secs,
            timeFormatted: `${match[1]}:${match[2]}`,
            text,
          });
        }
      }

      return {
        trackName: data.trackName || track,
        artistName: data.artistName || artist,
        synced: true,
        lines,
      };
    } else if (data.plainLyrics) {
      const rawLines = data.plainLyrics.split('\n');
      for (const line of rawLines) {
        lines.push({
          timeSec: 0,
          timeFormatted: '--:--',
          text: line,
        });
      }

      return {
        trackName: data.trackName || track,
        artistName: data.artistName || artist,
        synced: false,
        lines,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// 2. NetEase Cloud Music (High quality synced timestamped lyrics for global catalog)
async function tryNetEase(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const q = encodeURIComponent(`${track} ${artist}`.trim());
    const sRes = await fetch(`https://music.163.com/api/search/get?s=${q}&type=1&limit=3`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(3500),
    });
    if (!sRes.ok) return null;
    const sData: any = await sRes.json();
    const song = sData.result?.songs?.[0];
    if (!song?.id) return null;

    const lRes = await fetch(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(3500),
    });
    if (!lRes.ok) return null;
    const lData: any = await lRes.json();
    const rawLrc = lData.lrc?.lyric;
    if (!rawLrc) return null;

    const rawLines = rawLrc.split('\n');
    const timeRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
    const lines: LyricLine[] = [];

    for (const line of rawLines) {
      const match = line.match(timeRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const text = match[4].trim();
        // Skip metadata header lines like 作词 / 制作人
        if (text && !text.startsWith('作词') && !text.startsWith('作曲') && !text.startsWith('制作人')) {
          lines.push({
            timeSec: mins * 60 + secs,
            timeFormatted: `${match[1]}:${match[2]}`,
            text,
          });
        }
      }
    }

    if (lines.length === 0) return null;

    return {
      trackName: song.name || track,
      artistName: song.artists?.[0]?.name || artist,
      synced: true,
      lines,
    };
  } catch {
    return null;
  }
}

// 3. Genius (World's largest lyrics catalog: Bollywood, Indian, indie, regional, international)
async function tryGenius(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const q = encodeURIComponent(`${track} ${artist}`.trim());
    const res = await fetch(`https://genius.com/api/search/multi?q=${q}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    const hits = d.response?.sections?.flatMap((s: any) => s.hits) || [];
    const songHit = hits.find((h: any) => h.type === 'song')?.result;
    if (!songHit?.path) return null;

    const pageRes = await fetch(`https://genius.com${songHit.path}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(4000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    let matches = [...html.matchAll(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)];
    if (matches.length === 0) {
      const oldMatch = html.match(/class="lyrics"[^>]*>([\s\S]*?)<\/div>/);
      if (oldMatch) matches = [oldMatch as any];
    }
    if (matches.length === 0) return null;

    const raw = matches
      .map((m) => m[1])
      .join('\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#x27;/g, '\x27')
      .replace(/&#39;/g, '\x27')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ');

    const lines = raw
      .split('\n')
      .map((l) =>
        l
          .replace(/^\s*\d+\s+Contributors.*$/i, '')
          .replace(/\d+Embed$/i, '')
          .trim()
      )
      .filter((l) => l.length > 0);

    if (lines.length === 0) return null;

    return {
      trackName: songHit.title || track,
      artistName: songHit.primary_artist?.name || artist,
      synced: false,
      lines: lines.map((line) => ({
        timeSec: 0,
        timeFormatted: '--:--',
        text: line,
      })),
    };
  } catch {
    return null;
  }
}

// 4. lyrics.ovh (Fallback plain lyrics provider)
async function tryLyricsOvh(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const encArtist = encodeURIComponent(artist);
    const encTrack = encodeURIComponent(track);
    const res = await fetch(`https://api.lyrics.ovh/v1/${encArtist}/${encTrack}`, {
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return null;

    const data: any = await res.json();
    if (!data.lyrics) return null;

    const rawLines = data.lyrics.split('\n');
    const lines: LyricLine[] = rawLines.map((line: string) => ({
      timeSec: 0,
      timeFormatted: '--:--',
      text: line,
    }));

    return {
      trackName: track,
      artistName: artist,
      synced: false,
      lines,
    };
  } catch {
    return null;
  }
}

export async function fetchLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  const cleanTrack = cleanTrackTitle(trackName);
  const cleanArtist = cleanArtistName(artistName);

  // Strategy 1: Check LRCLIB for synced time-coded lyrics
  let lrclib = await tryLrclib(cleanTrack, cleanArtist);
  if (lrclib && lrclib.synced && lrclib.lines.length > 0) return lrclib;

  if (cleanTrack !== trackName || cleanArtist !== artistName) {
    lrclib = await tryLrclib(trackName, artistName);
    if (lrclib && lrclib.synced && lrclib.lines.length > 0) return lrclib;
  }

  // Strategy 2: Check NetEase for synced time-coded lyrics
  const netEase = (await tryNetEase(cleanTrack, cleanArtist)) || (await tryNetEase(trackName, artistName));
  if (netEase && netEase.synced && netEase.lines.length > 0) return netEase;

  // Strategy 3: Check Genius (Comprehensive database for regional, Bollywood, indie, non-popular tracks)
  const genius =
    (await tryGenius(cleanTrack, cleanArtist)) ||
    (await tryGenius(cleanTrack, '')) ||
    (await tryGenius(trackName, artistName));
  if (genius && genius.lines.length > 0) return genius;

  // Strategy 4: Fallback to LRCLIB plain lyrics if found earlier
  if (lrclib && lrclib.lines.length > 0) return lrclib;

  // Strategy 5: Fallback to lyrics.ovh
  const ovh = (await tryLyricsOvh(cleanTrack, cleanArtist)) || (await tryLyricsOvh(trackName, artistName));
  if (ovh && ovh.lines.length > 0) return ovh;

  return null;
}
