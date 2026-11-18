import crypto from 'node:crypto';
import { getValidUserToken } from './oauth.ts';
import { isDaemonRunning } from './daemon.ts';
import type { TrackInfo, PlayerState } from './types.ts';
import { saveLastSession } from '../config.ts';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let rateLimitedUntil = 0;
let cachedDevices: { timestamp: number; devices: SpotifyDevice[] } | null = null;

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export function getLibrespotDeviceId(deviceName = 'Spotify-CLI'): string {
  return crypto.createHash('sha1').update(deviceName).digest('hex');
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
  const now = Date.now();
  if (now < rateLimitedUntil) {
    const waitSec = Math.ceil((rateLimitedUntil - now) / 1000);
    return {
      ok: false,
      status: 429,
      error: `Spotify rate limit cooldown active. Please wait ${waitSec}s.`,
    };
  }

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

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10);
      rateLimitedUntil = Date.now() + retryAfter * 1000;
      return {
        ok: false,
        status: 429,
        error: `Spotify API rate limit exceeded. Retry after ${retryAfter}s.`,
      };
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
  const now = Date.now();
  if (cachedDevices && now - cachedDevices.timestamp < 3500) {
    return cachedDevices.devices;
  }

  const res = await apiRequest<{ devices: SpotifyDevice[] }>('/me/player/devices');
  if (res.ok && res.data?.devices) {
    cachedDevices = { timestamp: now, devices: res.data.devices };
    return res.data.devices;
  }
  return cachedDevices?.devices || [];
}

export async function findCliDevice(): Promise<SpotifyDevice | null> {
  // 1. Check known devices registered with Web API
  let devices = await getDevices();
  let matched = devices.find(
    (d) =>
      d.name.toLowerCase() === 'spotify-cli' ||
      d.name.toLowerCase().includes('librespot')
  );
  if (matched) return matched;

  // 2. If daemon is running locally, wait up to 2.5s for cloud registration
  if (isDaemonRunning()) {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 600));
      cachedDevices = null;
      devices = await getDevices();
      matched = devices.find(
        (d) =>
          d.name.toLowerCase() === 'spotify-cli' ||
          d.name.toLowerCase().includes('librespot')
      );
      if (matched) return matched;
    }

    const expectedId = getLibrespotDeviceId('Spotify-CLI');
    return {
      id: expectedId,
      is_active: false,
      is_private_session: false,
      is_restricted: false,
      name: 'Spotify-CLI',
      type: 'Speaker',
      volume_percent: 50,
    };
  }

  return null;
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
  const contextUri = d.context?.uri;

  if (item.uri && (state === 'playing' || state === 'paused')) {
    saveLastSession({
      trackUri: item.uri,
      trackName: item.name || 'Unknown Track',
      artist: artists,
      album: item.album?.name || '',
      contextUri,
      positionMs,
      durationMs,
    });
  }

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
    contextUri,
  };
}

export interface WebPlayOptions {
  uri?: string;
  contextUri?: string;
  positionMs?: number;
}

export interface WebPlayResult {
  success: boolean;
  error?: string;
  code?: 'ok' | 'unauthenticated' | 'no_device' | 'forbidden' | 'api_error';
}

export async function webPlayDetailed(
  uriOrOptions?: string | WebPlayOptions,
  deviceId?: string
): Promise<WebPlayResult> {
  const token = await getValidUserToken();
  if (!token) {
    return {
      success: false,
      code: 'unauthenticated',
      error: 'Not authenticated with Spotify. Type /auth to link your account.',
    };
  }

  let targetDevice = deviceId;
  if (!targetDevice) {
    let devices = await getDevices();
    // 1. Prefer active device if one is playing
    const active = devices.find((d) => d.is_active);
    if (active) {
      targetDevice = active.id;
    } else {
      // 2. Prefer official Computer client (e.g. MacBook Air) over third-party librespot
      // because Spotify servers provide official decryption keys without Restriction Violated
      const computer = devices.find((d) => d.type.toLowerCase() === 'computer');
      if (computer) {
        targetDevice = computer.id;
      } else {
        const cliDev = await findCliDevice();
        if (cliDev) {
          targetDevice = cliDev.id;
        } else if (devices.length > 0) {
          targetDevice = devices[0].id;
        }
      }
    }

    // 3. If no device found and running on macOS, silently launch Spotify in background
    if (!targetDevice && process.platform === 'darwin') {
      try {
        const { launchSpotify } = await import('./applescript.ts');
        await launchSpotify(true);
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 400));
          cachedDevices = null;
          devices = await getDevices();
          const found = devices.find((d) => d.type.toLowerCase() === 'computer') || devices[0];
          if (found) {
            targetDevice = found.id;
            break;
          }
        }
      } catch {}
    }
  }

  if (!targetDevice) {
    return {
      success: false,
      code: 'no_device',
      error: 'No active Spotify Connect device found. Run /auth or open Spotify.',
    };
  }

  const query = `?device_id=${targetDevice}`;

  let body: any = undefined;
  if (typeof uriOrOptions === 'object' && uriOrOptions !== null) {
    if (uriOrOptions.contextUri) {
      body = { context_uri: uriOrOptions.contextUri };
      if (uriOrOptions.uri) {
        let u = uriOrOptions.uri;
        if (!u.startsWith('spotify:') && /^[a-zA-Z0-9]{22}$/.test(u)) {
          u = `spotify:track:${u}`;
        }
        body.offset = { uri: u };
      }
    } else if (uriOrOptions.uri) {
      let u = uriOrOptions.uri;
      if (!u.startsWith('spotify:') && /^[a-zA-Z0-9]{22}$/.test(u)) {
        u = `spotify:track:${u}`;
      }
      body = u.includes(':track:') ? { uris: [u] } : { context_uri: u };
    }
    if (typeof uriOrOptions.positionMs === 'number' && uriOrOptions.positionMs > 0) {
      if (!body) body = {};
      body.position_ms = Math.floor(uriOrOptions.positionMs);
    }
  } else if (typeof uriOrOptions === 'string' && uriOrOptions.trim()) {
    let formattedUri = uriOrOptions.trim();
    if (!formattedUri.startsWith('spotify:') && /^[a-zA-Z0-9]{22}$/.test(formattedUri)) {
      formattedUri = `spotify:track:${formattedUri}`;
    }
    body = formattedUri.includes(':track:') ? { uris: [formattedUri] } : { context_uri: formattedUri };
  }

  let res = await apiRequest(`/me/player/play${query}`, 'PUT', body);
  if (!res.ok && res.status === 404 && targetDevice) {
    // Retry once in case device registration was still propagating to cloud
    await new Promise((r) => setTimeout(r, 800));
    cachedDevices = null;
    res = await apiRequest(`/me/player/play${query}`, 'PUT', body);
  }

  // If 403 Restriction Violated (librespot audio key block), automatically fallback to Computer player
  if (!res.ok && res.status === 403) {
    const devices = await getDevices();
    const fallback = devices.find((d) => d.type.toLowerCase() === 'computer' && d.id !== targetDevice);
    if (fallback) {
      const fbQuery = `?device_id=${fallback.id}`;
      res = await apiRequest(`/me/player/play${fbQuery}`, 'PUT', body);
    } else if (process.platform === 'darwin') {
      try {
        const { launchSpotify } = await import('./applescript.ts');
        await launchSpotify(true);
        await new Promise((r) => setTimeout(r, 800));
        cachedDevices = null;
        const freshDevs = await getDevices();
        const comp = freshDevs.find((d) => d.type.toLowerCase() === 'computer');
        if (comp) {
          res = await apiRequest(`/me/player/play?device_id=${comp.id}`, 'PUT', body);
        }
      } catch {}
    }
  }

  if (res.ok) {
    return { success: true, code: 'ok' };
  }

  if (res.status === 404) {
    return {
      success: false,
      code: 'no_device',
      error: 'Spotify device not found. Run /auth or open Spotify.',
    };
  }

  if (res.status === 429) {
    return {
      success: false,
      code: 'api_error',
      error: res.error || 'Spotify API rate limit active. Wait a few moments.',
    };
  }

  if (res.status === 401) {
    return {
      success: false,
      code: 'unauthenticated',
      error: 'Spotify session expired. Type /auth to refresh authentication.',
    };
  }

  if (res.status === 403) {
    return {
      success: false,
      code: 'forbidden',
      error: res.error || 'Playback request restricted by Spotify on this device.',
    };
  }

  return {
    success: false,
    code: 'api_error',
    error: res.error || `Playback request failed (HTTP ${res.status}).`,
  };
}

export async function webPlay(uriOrOptions?: string | WebPlayOptions, deviceId?: string): Promise<boolean> {
  const result = await webPlayDetailed(uriOrOptions, deviceId);
  return result.success;
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
