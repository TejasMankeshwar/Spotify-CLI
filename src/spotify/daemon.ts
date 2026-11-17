import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';

export interface DaemonStatus {
  installed: boolean;
  running: boolean;
  pid: number | null;
  binaryPath: string | null;
  cacheDir: string;
}

export function getConfigDir(): string {
  if (process.env.SPOTIFY_CLI_DIR) return process.env.SPOTIFY_CLI_DIR;
  const userConfigDir = path.join(os.homedir(), '.config', 'spotify-cli');
  try {
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true });
    }
    // Verify write permissions
    const testFile = path.join(userConfigDir, '.test_perm');
    fs.writeFileSync(testFile, 'ok', 'utf-8');
    fs.unlinkSync(testFile);
    return userConfigDir;
  } catch {
    const fallbackDir = path.join(os.tmpdir(), 'spotify-cli');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

export function getLibrespotCacheDir(): string {
  const base = getConfigDir();
  const dir = path.join(base, 'librespot');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch {
    const fallback = path.join(os.tmpdir(), 'spotify-cli', 'librespot');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

export function getLibrespotBinaryPath(): string | null {
  const candidates = [
    '/opt/homebrew/bin/librespot',
    '/usr/local/bin/librespot',
    path.join(os.homedir(), '.cargo', 'bin', 'librespot'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const out = execSync('which librespot 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch {}

  return null;
}

export function isLibrespotInstalled(): boolean {
  return getLibrespotBinaryPath() !== null;
}

function getPidFile(): string {
  return path.join(getLibrespotCacheDir(), 'daemon.pid');
}

export function getDaemonPid(): number | null {
  const pidFile = getPidFile();
  try {
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, 'utf-8').trim();
      const pid = parseInt(content, 10);
      if (!isNaN(pid) && pid > 0) {
        // Test if process is still alive
        process.kill(pid, 0);
        return pid;
      }
    }
  } catch {
    // Process is dead or no permission; clean up stale pid file
    try {
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch {}
  }
  return null;
}

export function isDaemonRunning(): boolean {
  return getDaemonPid() !== null;
}

export function getDaemonStatus(): DaemonStatus {
  const binaryPath = getLibrespotBinaryPath();
  const pid = getDaemonPid();
  return {
    installed: binaryPath !== null,
    running: pid !== null,
    pid,
    binaryPath,
    cacheDir: getLibrespotCacheDir(),
  };
}

export function startLibrespotDaemon(options?: {
  enableOauth?: boolean;
  oauthPort?: number;
  verbose?: boolean;
}): { success: boolean; pid?: number; message?: string } {
  const binary = getLibrespotBinaryPath();
  if (!binary) {
    return {
      success: false,
      message: 'librespot binary not found. Install it with: brew install librespot',
    };
  }

  const existingPid = getDaemonPid();
  if (existingPid) {
    return {
      success: true,
      pid: existingPid,
      message: `librespot is already running (PID: ${existingPid})`,
    };
  }

  const cacheDir = getLibrespotCacheDir();
  const audioCache = path.join(cacheDir, 'cache');
  const systemCache = path.join(cacheDir, 'system');
  const logFile = path.join(cacheDir, 'daemon.log');

  if (!fs.existsSync(audioCache)) fs.mkdirSync(audioCache, { recursive: true });
  if (!fs.existsSync(systemCache)) fs.mkdirSync(systemCache, { recursive: true });

  const args: string[] = [
    '--name',
    'Spotify-CLI',
    '--bitrate',
    '320',
    '--backend',
    'rodio',
    '--cache',
    audioCache,
    '--system-cache',
    systemCache,
    '--enable-volume-normalisation',
  ];

  if (options?.enableOauth) {
    args.push('--enable-oauth');
    if (options.oauthPort) {
      args.push('--oauth-port', options.oauthPort.toString());
    }
  }

  try {
    const outStream = fs.openSync(logFile, 'a');
    const child = spawn(binary, args, {
      detached: true,
      stdio: ['ignore', outStream, outStream],
    });

    child.unref();

    if (child.pid) {
      fs.writeFileSync(getPidFile(), child.pid.toString(), 'utf-8');
      return {
        success: true,
        pid: child.pid,
        message: `librespot daemon started successfully (PID: ${child.pid}, Quality: 320kbps CoreAudio)`,
      };
    }

    return { success: false, message: 'Failed to obtain process PID from spawned daemon' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to spawn daemon process' };
  }
}

export function stopLibrespotDaemon(): { success: boolean; message: string } {
  const pid = getDaemonPid();
  if (!pid) {
    return { success: true, message: 'librespot daemon is not currently running' };
  }

  try {
    process.kill(pid, 'SIGTERM');
    // Short wait to ensure it stopped
    try {
      const pidFile = getPidFile();
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch {}
    return { success: true, message: `Stopped librespot daemon (PID: ${pid})` };
  } catch (err: any) {
    try {
      process.kill(pid, 'SIGKILL');
      return { success: true, message: `Force stopped librespot daemon (PID: ${pid})` };
    } catch {
      return { success: false, message: `Failed to stop daemon: ${err.message}` };
    }
  }
}
