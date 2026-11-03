import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ThemeName } from './theme.ts';

export interface UserConfig {
  theme: ThemeName;
  volumeStep: number;
  autoDisplayCardOnPlay: boolean;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}

const DEFAULT_CONFIG: UserConfig = {
  theme: 'spotify',
  volumeStep: 5,
  autoDisplayCardOnPlay: true,
};

const CONFIG_DIR = path.join(os.homedir(), '.config', 'spotify-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CACHE_FILE = path.join(CONFIG_DIR, 'track_cache.json');

// Built-in seed cache for instant zero-latency playback of top searched tracks
const INITIAL_TRACK_CACHE: Record<string, string> = {
  'no brainer': 'spotify:track:5WvAo7DNuPRmk4APhdPzi8',
  'no brainer dj khaled': 'spotify:track:5WvAo7DNuPRmk4APhdPzi8',
  'tauba tauba': 'spotify:track:1WaqQIJ0iENGWZ1QmYvYNK',
  'tauba tauba karan aujla': 'spotify:track:1WaqQIJ0iENGWZ1QmYvYNK',
  'do din ka mela': 'spotify:track:4Ongy8kfa8yZ6LCGqcV2WG',
  'do din ka ye mela': 'spotify:track:2lt1LGayyl1TFTJYgslVyz',
  'do din ka ye mela rahul ram': 'spotify:track:2lt1LGayyl1TFTJYgslVyz',
  'do din ka mela gulabo sitabo': 'spotify:track:2lt1LGayyl1TFTJYgslVyz',
  'kabira': 'spotify:track:4bD9z9qa4qg9BhryvYWB7c',
  'kabira encore': 'spotify:track:6C7AqDxRmBxKLoeJ4HxdHU',
  'shape of you': 'spotify:track:0FE9t6xYkqWXU2ahLh6D8X',
  'starboy': 'spotify:track:5aAx2yezTd8zXrkmtKl66Z',
  'bohemian rhapsody': 'spotify:track:2OBofMJx94NryV2SK8p8Zf',
  'kesariya': 'spotify:track:4UMIv5jd9gK98a39BQRD9X',
  'blinding lights': 'spotify:track:0sf12qNH5qcw8qpgymFOqD',
  'believer': 'spotify:track:0pqTrk04U0m9uVj5Kx4YwV',
  'espresso': 'spotify:track:2HRqTpkrFuEMivW9tf4hk2',
  'espresso sabrina carpenter': 'spotify:track:2HRqTpkrFuEMivW9tf4hk2',
};

export function loadTrackCache(): Record<string, string> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return { ...INITIAL_TRACK_CACHE, ...JSON.parse(data) };
    }
  } catch {}
  return { ...INITIAL_TRACK_CACHE };
}

export function findInTrackCache(key: string): string | null {
  const cache = loadTrackCache();
  const raw = key.toLowerCase().trim();
  if (cache[raw]) return cache[raw];

  const norm = raw.replace(/[\(\)\[\]\"\'\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cache[norm]) return cache[norm];

  for (const [k, v] of Object.entries(cache)) {
    const kNorm = k.toLowerCase().replace(/[\(\)\[\]\"\'\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (kNorm === norm || kNorm === raw || norm.startsWith(kNorm) || kNorm.startsWith(norm)) {
      return v;
    }
  }
  return null;
}

export function saveTrackCacheItem(key: string, uri: string): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const current = loadTrackCache();
    current[key.toLowerCase().trim()] = uri.trim();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch {}
}

export function loadConfig(): UserConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch {
    // Fall back to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<UserConfig>): UserConfig {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const current = loadConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch {
    return { ...DEFAULT_CONFIG, ...config };
  }
}

