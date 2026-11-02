import type { LyricsResult, LyricLine } from './types.ts';

export async function fetchLyrics(trackName: string, artistName: string): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'Spotify-CLI (https://github.com/TejasMankeshwar/Spotify-CLI)',
      },
    });

    if (!res.ok) {
      return null;
    }

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
        trackName: data.trackName || trackName,
        artistName: data.artistName || artistName,
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
        trackName: data.trackName || trackName,
        artistName: data.artistName || artistName,
        synced: false,
        lines,
      };
    }

    return null;
  } catch {
    return null;
  }
}

