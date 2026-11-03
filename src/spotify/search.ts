import { loadConfig, saveConfig, loadTrackCache, saveTrackCacheItem, findInTrackCache } from '../config.ts';

export interface SearchResultItem {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  durationFormatted: string;
  uri: string;
  previewUrl?: string;
  source: 'spotify' | 'deezer' | 'itunes';
  isrc?: string;
}

let cachedSpotifyToken: { token: string; expiresAt: number } | null = null;

export async function getSpotifyApiToken(clientId?: string, clientSecret?: string): Promise<string | null> {
  const config = loadConfig();
  const cId = clientId || config.spotifyClientId || process.env.SPOTIFY_CLIENT_ID;
  const cSec = clientSecret || config.spotifyClientSecret || process.env.SPOTIFY_CLIENT_SECRET;

  if (!cId || !cSec) {
    return null;
  }

  const now = Date.now();
  if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > now + 60000) {
    return cachedSpotifyToken.token;
  }

  try {
    const creds = Buffer.from(`${cId}:${cSec}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    if (data.access_token) {
      cachedSpotifyToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in || 3600) * 1000,
      };
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

export function formatTime(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 1. Official Spotify Web API Search (100% free with Developer Client ID/Secret)
async function searchSpotifyApi(query: string, limit = 8): Promise<SearchResultItem[]> {
  const token = await getSpotifyApiToken();
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: limit.toString(),
    });

    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    const tracks = data.tracks?.items || [];

    return tracks.map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
      album: t.album?.name || 'Unknown Album',
      durationMs: t.duration_ms,
      durationFormatted: formatTime((t.duration_ms || 0) / 1000),
      uri: t.uri || `spotify:track:${t.id}`,
      previewUrl: t.preview_url || undefined,
      source: 'spotify' as const,
    }));
  } catch {
    return [];
  }
}

// 2. Free Open Deezer Catalog Search (Zero credentials, fast, 30s previews + ISRC)
async function searchDeezerApi(query: string, limit = 8): Promise<SearchResultItem[]> {
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const items = data.data || [];
    const cache = loadTrackCache();

    return items.map((t: any) => {
      const cachedUri = findInTrackCache(t.title) || findInTrackCache(`${t.title} ${t.artist?.name || ''}`) || (t.isrc ? findInTrackCache(t.isrc) : '') || '';

      return {
        id: t.id ? t.id.toString() : t.title,
        name: t.title,
        artist: t.artist?.name || 'Unknown Artist',
        album: t.album?.title || 'Single',
        durationMs: (t.duration || 0) * 1000,
        durationFormatted: formatTime(t.duration || 0),
        uri: cachedUri,
        previewUrl: t.preview,
        source: 'deezer' as const,
        isrc: t.isrc,
      };
    });
  } catch {
    return [];
  }
}

// 3. Free Open iTunes Catalog Search (Zero credentials, high quality previews)
async function searchItunesApi(query: string, limit = 8, country?: string): Promise<SearchResultItem[]> {
  try {
    const params = new URLSearchParams({
      term: query,
      entity: 'song',
      limit: limit.toString(),
      ...(country ? { country } : {}),
    });

    const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const results = data.results || [];
    const cache = loadTrackCache();

    return results.map((item: any) => {
      const cachedUri = findInTrackCache(item.trackName || '') || findInTrackCache(`${item.trackName || ''} ${item.artistName || ''}`) || '';

      return {
        id: item.trackId ? item.trackId.toString() : item.trackName,
        name: item.trackName || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || 'Single',
        durationMs: item.trackTimeMillis || 0,
        durationFormatted: formatTime((item.trackTimeMillis || 0) / 1000),
        uri: cachedUri,
        previewUrl: item.previewUrl,
        source: 'itunes' as const,
      };
    });
  } catch {
    return [];
  }
}

// Open resolver via Genius metadata (0 credentials, fast, 100% free)
async function resolveViaGenius(query: string): Promise<string | null> {
  try {
    const sRes = await fetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!sRes.ok) return null;
    const sData: any = await sRes.json();
    const hit = sData.response?.sections?.flatMap((s: any) => s.hits)?.find((h: any) => h.type === 'song')?.result;
    if (!hit?.id) return null;

    const songRes = await fetch(`https://genius.com/api/songs/${hit.id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!songRes.ok) return null;
    const songData: any = await songRes.json();
    const song = songData.response?.song;
    if (!song) return null;

    // Check media array
    const spMedia = song.media?.find((m: any) => m.provider === 'spotify');
    if (spMedia?.url) {
      const match = spMedia.url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
      if (match) return `spotify:track:${match[1]}`;
    }

    // Check spotify_uuid
    if (song.spotify_uuid) {
      return `spotify:track:${song.spotify_uuid}`;
    }

    // Check full serialized JSON string for any spotify track pattern
    const str = JSON.stringify(song);
    const m = str.match(/spotify:track:([a-zA-Z0-9]+)/) || str.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (m) return `spotify:track:${m[1]}`;

    return null;
  } catch {
    return null;
  }
}

async function getTrackUriFromAlbum(albumId: string): Promise<string> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/album/${albumId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (match) {
        const d = JSON.parse(match[1]);
        const trackUri = d.props?.pageProps?.state?.data?.entity?.trackList?.[0]?.uri;
        if (trackUri && trackUri.startsWith('spotify:track:')) {
          return trackUri;
        }
      }
    }
  } catch {}
  return `spotify:album:${albumId}`;
}

// Universal Spotify Track URI Resolver (Fast cache + Genius + MusicBrainz/ISRC + Spotify API)
export async function resolveSpotifyUri(title: string, artist = '', isrc?: string): Promise<string | null> {
  const normTitle = title.toLowerCase().trim();
  const normFull = `${normTitle} ${artist.toLowerCase().trim()}`.trim();

  // 1. Check persistent local cache first (0ms)
  const cached = findInTrackCache(normTitle) || findInTrackCache(normFull) || (isrc ? findInTrackCache(isrc) : null);
  if (cached) return cached;

  // 2. Try official Spotify API if configured
  try {
    const token = await getSpotifyApiToken();
    if (token) {
      const q = isrc ? `isrc:${isrc}` : `track:${title} artist:${artist}`;
      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data: any = await res.json();
        const first = data.tracks?.items?.[0];
        if (first?.uri) {
          saveTrackCacheItem(normTitle, first.uri);
          saveTrackCacheItem(normFull, first.uri);
          return first.uri;
        }
      }
    }
  } catch {}

  // 3. Try open Genius metadata resolver (fast, free, comprehensive)
  try {
    const geniusUri = (await resolveViaGenius(normFull)) || (await resolveViaGenius(normTitle));
    if (geniusUri) {
      saveTrackCacheItem(normTitle, geniusUri);
      saveTrackCacheItem(normFull, geniusUri);
      if (isrc) saveTrackCacheItem(isrc.toLowerCase(), geniusUri);
      return geniusUri;
    }
  } catch {}

  // 4. Try MusicBrainz by ISRC (100% free open catalog with release album/track discovery)
  if (isrc) {
    try {
      const mbRes = await fetch(`https://musicbrainz.org/ws/2/recording?query=isrc:${encodeURIComponent(isrc)}&limit=3&fmt=json`, {
        headers: { 'User-Agent': 'SpotifyTerminalCLI/1.0.0 (https://github.com/developer/spotify-cli)' },
        signal: AbortSignal.timeout(3500),
      });
      if (mbRes.ok) {
        const mbData: any = await mbRes.json();
        const recordings = mbData.recordings || [];
        for (const rec of recordings) {
          if (rec.releases) {
            for (const rel of rec.releases) {
              if (rel.id) {
                const relRes = await fetch(`https://musicbrainz.org/ws/2/release/${rel.id}?inc=url-rels&fmt=json`, {
                  headers: { 'User-Agent': 'SpotifyTerminalCLI/1.0.0 (https://github.com/developer/spotify-cli)' },
                  signal: AbortSignal.timeout(3500),
                });
                if (relRes.ok) {
                  const relData: any = await relRes.json();
                  for (const r of (relData.relations || [])) {
                    const u = r.url?.resource || '';
                    const tm = u.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
                    if (tm) {
                      const uri = `spotify:track:${tm[1]}`;
                      saveTrackCacheItem(normTitle, uri);
                      saveTrackCacheItem(normFull, uri);
                      saveTrackCacheItem(isrc.toLowerCase(), uri);
                      return uri;
                    }
                    const am = u.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
                    if (am) {
                      const uri = await getTrackUriFromAlbum(am[1]);
                      saveTrackCacheItem(normTitle, uri);
                      saveTrackCacheItem(normFull, uri);
                      saveTrackCacheItem(isrc.toLowerCase(), uri);
                      return uri;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  // 5. Try MusicBrainz recording query by title & artist
  try {
    const mbQ = artist ? `recording:${title} AND artist:${artist}` : `recording:${title}`;
    const mbRes = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(mbQ)}&limit=3&fmt=json`, {
      headers: { 'User-Agent': 'SpotifyTerminalCLI/1.0.0 (https://github.com/developer/spotify-cli)' },
      signal: AbortSignal.timeout(3500),
    });
    if (mbRes.ok) {
      const mbData: any = await mbRes.json();
      const recordings = mbData.recordings || [];
      for (const rec of recordings) {
        if (rec.releases) {
          for (const rel of rec.releases) {
            if (rel.id) {
              const relRes = await fetch(`https://musicbrainz.org/ws/2/release/${rel.id}?inc=url-rels&fmt=json`, {
                headers: { 'User-Agent': 'SpotifyTerminalCLI/1.0.0 (https://github.com/developer/spotify-cli)' },
                signal: AbortSignal.timeout(3500),
              });
              if (relRes.ok) {
                const relData: any = await relRes.json();
                for (const r of (relData.relations || [])) {
                  const u = r.url?.resource || '';
                  const tm = u.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
                  if (tm) {
                    const uri = `spotify:track:${tm[1]}`;
                    saveTrackCacheItem(normTitle, uri);
                    saveTrackCacheItem(normFull, uri);
                    return uri;
                  }
                  const am = u.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
                  if (am) {
                    const uri = await getTrackUriFromAlbum(am[1]);
                    saveTrackCacheItem(normTitle, uri);
                    saveTrackCacheItem(normFull, uri);
                    return uri;
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch {}

  return null;
}

export async function searchTracks(query: string, limit = 8): Promise<SearchResultItem[]> {
  // 1. Try official Spotify Web API if client credentials exist
  const spotifyResults = await searchSpotifyApi(query, limit);
  if (spotifyResults.length > 0) {
    return spotifyResults;
  }

  // 2. Query Deezer API (fast, open, includes preview audio + ISRC)
  let results = await searchDeezerApi(query, limit);

  // Check if Deezer results are relevant (contains at least one query keyword)
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const deezerMatchesQuery = results.length > 0 && queryWords.some(w =>
    results[0].name.toLowerCase().includes(w) || results[0].artist.toLowerCase().includes(w)
  );

  // 3. Fallback to iTunes API if Deezer returned nothing or had poor relevance
  if (results.length === 0 || !deezerMatchesQuery) {
    const itunesResults = await searchItunesApi(query, limit);
    if (itunesResults.length > 0) {
      results = itunesResults;
    } else {
      // Try regional iTunes (e.g. India catalog for regional/Bollywood hits)
      const regionalResults = await searchItunesApi(query, limit, 'IN');
      if (regionalResults.length > 0) {
        results = regionalResults;
      }
    }
  }

  if (results.length === 0) {
    return [];
  }

  // Check persistent cache for instant URI assignment
  const cache = loadTrackCache();
  for (const item of results) {
    if (!item.uri) {
      const normName = item.name.toLowerCase().trim();
      const normFull = `${normName} ${item.artist.toLowerCase().trim()}`.trim();
      if (cache[normName]) item.uri = cache[normName];
      else if (cache[normFull]) item.uri = cache[normFull];
      else if (item.isrc && cache[item.isrc.toLowerCase()]) item.uri = cache[item.isrc.toLowerCase()];
    }
  }

  // Eagerly resolve the top result's URI if not cached
  if (!results[0].uri) {
    try {
      const resolved = await resolveSpotifyUri(results[0].name, results[0].artist, results[0].isrc);
      if (resolved) {
        results[0].uri = resolved;
      }
    } catch {}
  }

  // Asynchronously resolve remaining results in background
  (async () => {
    for (let i = 1; i < results.length; i++) {
      if (!results[i].uri) {
        try {
          const res = await resolveSpotifyUri(results[i].name, results[i].artist, results[i].isrc);
          if (res) results[i].uri = res;
        } catch {}
      }
    }
  })().catch(() => {});

  return results;
}


