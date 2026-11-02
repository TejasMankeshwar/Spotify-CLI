import type { LyricsResult, LyricLine } from './types.ts';

export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\(From\s+["'][^"']+["']\)/gi, '')
    .replace(/\s*\(feat\.[^)]+\)/gi, '')
    .replace(/\s*\[feat\.[^\]]+\]/gi, '')
    .replace(/\s*-\s*Remaster(ed)?(\s*\d+)?/gi, '')
    .replace(/\s*-\s*Deluxe(\s*Edition)?/gi, '')
    .replace(/\s*-\s*Bonus\s*Track/gi, '')
    .replace(/\s*\(with\s+[^)]+\)/gi, '')
    .replace(/\s*\(Remaster(ed)?\)/gi, '')
    .trim();
}

export function cleanArtistName(artist: string): string {
  // Take primary artist before comma or feat
  return artist.split(',')[0].split(' feat.')[0].trim();
}

async function tryLrclib(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: track,
      artist_name: artist,
    });

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'Spotify-CLI (https://github.com/TejasMankeshwar/Spotify-CLI)',
      },
      signal: AbortSignal.timeout(4000),
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

async function tryLyricsOvh(track: string, artist: string): Promise<LyricsResult | null> {
  try {
    const encArtist = encodeURIComponent(artist);
    const encTrack = encodeURIComponent(track);
    const res = await fetch(`https://api.lyrics.ovh/v1/${encArtist}/${encTrack}`, {
      signal: AbortSignal.timeout(5000),
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

  // Strategy 1: LRCLIB with raw titles
  let result = await tryLrclib(trackName, artistName);
  if (result && result.lines.length > 0) return result;

  // Strategy 2: LRCLIB with sanitized titles
  if (cleanTrack !== trackName || cleanArtist !== artistName) {
    result = await tryLrclib(cleanTrack, cleanArtist);
    if (result && result.lines.length > 0) return result;
  }

  // Strategy 3: lyrics.ovh with clean titles
  result = await tryLyricsOvh(cleanTrack, cleanArtist);
  if (result && result.lines.length > 0) return result;

  // Strategy 4: lyrics.ovh with raw titles
  result = await tryLyricsOvh(trackName, artistName);
  if (result && result.lines.length > 0) return result;

  return null;
}
