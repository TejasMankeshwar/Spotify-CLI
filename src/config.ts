import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ThemeName } from './theme.ts';

export interface UserConfig {
  theme: ThemeName;
  volumeStep: number;
  autoDisplayCardOnPlay: boolean;
}

const DEFAULT_CONFIG: UserConfig = {
  theme: 'spotify',
  volumeStep: 5,
  autoDisplayCardOnPlay: true,
};

const CONFIG_DIR = path.join(os.homedir(), '.config', 'spotify-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

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

