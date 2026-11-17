import { getValidUserToken } from './oauth.ts';
import type { TrackInfo, PlayerState } from './types.ts';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export function formatMs(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function apiRequest<T = any>(
  endpoint: string,
  method = 'GET',
  body?: any,
  retried = false
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const token = await getValidUserToken();
  if (!token) {
    return { ok: false, status: 401, error: 'Not authenticated with Spotify' };
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 204) {
      return { ok: true, status: 204 };
    }

    if (res.status === 401 && !retried) {
      // Token might be stale, retry once with refreshed token
      return apiRequest<T>(endpoint, method, body, true);
    }

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, status: res.status, error: errText };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message };
  }
}

export async function getDevices(): Promise<SpotifyDevice[]> {
  const res = await apiRequest<{ devices: SpotifyDevice[] }>('/me/player/devices');
  return res.data?.devices || [];
}

export async function findCliDevice(): Promise<SpotifyDevice | null> {
  const devices = await getDevices();
  // Match device named 'Spotify-CLI' (or 'Librespot')
  const matched = devices.find(
    (d) =>
      d.name.toLowerCase() === 'spotify-cli' ||
      d.name.toLowerCase().includes('librespot')
  );
  return matched || null;
}

export async function transferPlayback(deviceId: string, play = false): Promise<boolean> {
  const res = await apiRequest('/me/player', 'PUT', {
    device_ids: [deviceId],
    play,
  });
  return res.ok;
}

export async function getWebPlaybackState(): Promise<TrackInfo | null> {
  const res = await apiRequest<any>('/me/player');
  if (!res.ok || !res.data || !res.data.item) {
    return null;
  }

  const d = res.data;
  const item = d.item;
  const durationMs = item.duration_ms || 0;
  const positionMs = d.progress_ms || 0;
  const positionSec = Math.floor(positionMs / 1000);
  const durationSec = Math.floor(durationMs / 1000);

  const state: PlayerState = d.is_playing ? 'playing' : 'paused';
  const artists = (item.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist';
  const progressPercent = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

  return {
    id: item.uri || `spotify:track:${item.id}`,
    name: item.name || 'Unknown Track',
    artist: artists,
    album: item.album?.name || '',
    durationMs,
    durationFormatted: formatMs(durationMs),
    positionSec,
    positionFormatted: formatMs(positionMs),
    progressPercent,
    volume: d.device?.volume_percent ?? 50,
    state,
    isRepeating: d.repeat_state !== 'off',
    isShuffling: !!d.shuffle_state,
    spotifyUrl: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
    artworkUrl: item.album?.images?.[0]?.url,
  };
}

export async function webPlay(uri?: string, deviceId?: string): Promise<boolean> {
  let targetDevice = deviceId;
  if (!targetDevice) {
    const cliDev = await findCliDevice();
    if (cliDev) targetDevice = cliDev.id;
  }

  const query = targetDevice ? `?device_id=${targetDevice}` : '';
  const body = uri ? (uri.includes(':track:') ? { uris: [uri] } : { context_uri: uri }) : undefined;

  const res = await apiRequest(`/me/player/play${query}`, 'PUT', body);
  return res.ok;
}

export async function webPause(deviceId?: string): Promise<boolean> {
  const query = deviceId ? `?device_id=${deviceId}` : '';
  const res = await apiRequest(`/me/player/pause${query}`, 'PUT');
  return res.ok;
}

export async function webTogglePlay(): Promise<boolean> {
  const current = await getWebPlaybackState();
  if (current?.state === 'playing') {
    return webPause();
  }
  return webPlay();
}

export async function webNext(deviceId?: string): Promise<boolean> {
  const query = deviceId ? `?device_id=${deviceId}` : '';
  const res = await apiRequest(`/me/player/next${query}`, 'POST');
  return res.ok;
}

export async function webPrevious(deviceId?: string): Promise<boolean> {
  const query = deviceId ? `?device_id=${deviceId}` : '';
  const res = await apiRequest(`/me/player/previous${query}`, 'POST');
  return res.ok;
}

export async function webSeek(positionMs: number, deviceId?: string): Promise<boolean> {
  const params = new URLSearchParams({
    position_ms: positionMs.toString(),
  });
  if (deviceId) params.set('device_id', deviceId);

  const res = await apiRequest(`/me/player/seek?${params.toString()}`, 'PUT');
  return res.ok;
}

export async function webSetVolume(volumePercent: number, deviceId?: string): Promise<boolean> {
  const clamped = Math.min(100, Math.max(0, volumePercent));
  const params = new URLSearchParams({
    volume_percent: clamped.toString(),
  });
  if (deviceId) params.set('device_id', deviceId);

  const res = await apiRequest(`/me/player/volume?${params.toString()}`, 'PUT');
  return res.ok;
}

export async function webSetShuffle(state?: boolean, deviceId?: string): Promise<boolean> {
  const current = state !== undefined ? state : !(await getWebPlaybackState())?.isShuffling;
  const params = new URLSearchParams({
    state: current.toString(),
  });
  if (deviceId) params.set('device_id', deviceId);

  const res = await apiRequest(`/me/player/shuffle?${params.toString()}`, 'PUT');
  return res.ok;
}

export async function webSetRepeat(state?: 'off' | 'track' | 'context', deviceId?: string): Promise<boolean> {
  const target = state || 'context';
  const params = new URLSearchParams({
    state: target,
  });
  if (deviceId) params.set('device_id', deviceId);

  const res = await apiRequest(`/me/player/repeat?${params.toString()}`, 'PUT');
  return res.ok;
}
