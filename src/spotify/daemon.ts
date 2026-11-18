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
  accessToken?: string;
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

  const credsFile = path.join(systemCache, 'credentials.json');
  let token = options?.accessToken;
  if (!token) {
    const authFile = path.join(getConfigDir(), 'auth.json');
    try {
      if (fs.existsSync(authFile)) {
        const parsed = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        token = parsed.accessToken;
      }
    } catch {}
  }

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

  if (!fs.existsSync(credsFile)) {
    return {
      success: false,
      message: 'Spotify authentication required for headless streaming. Run /auth to link your Spotify Premium account.',
    };
  }

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

export async function startLibrespotOAuth(): Promise<{
  success: boolean;
  message: string;
}> {
  const binary = getLibrespotBinaryPath();
  if (!binary) {
    return {
      success: false,
      message: 'librespot binary not found. Install it with: brew install librespot',
    };
  }

  stopLibrespotDaemon();
  await new Promise((r) => setTimeout(r, 250));

  const cacheDir = getLibrespotCacheDir();
  const audioCache = path.join(cacheDir, 'cache');
  const systemCache = path.join(cacheDir, 'system');
  const credsFile = path.join(systemCache, 'credentials.json');

  if (!fs.existsSync(audioCache)) fs.mkdirSync(audioCache, { recursive: true });
  if (!fs.existsSync(systemCache)) fs.mkdirSync(systemCache, { recursive: true });

  // Clean stale/invalid credentials so librespot triggers the OAuth sign-in flow
  try {
    if (fs.existsSync(credsFile)) {
      fs.unlinkSync(credsFile);
    }
  } catch {}

  const port = 5588;
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
    '--enable-oauth',
    '--oauth-port',
    port.toString(),
  ];

  return new Promise((resolve) => {
    let resolved = false;
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let browserOpened = false;

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/Browse to:\s+(https:\/\/accounts\.spotify\.com\/[^\s]+)/i);
      if (match && !browserOpened) {
        browserOpened = true;
        const authUrl = match[1];
        process.stdout.write(`\n  If your browser does not open automatically, open this URL:\n  \x1b[38;2;29;185;84m${authUrl}\x1b[0m\n\n`);
        try {
          spawn('open', [authUrl], { stdio: 'ignore' });
        } catch {}
      }

      if (text.includes('Authenticated as') || text.includes('Country:') || text.includes('active device is')) {
        if (!resolved) {
          resolved = true;
          // Wait 600ms for credentials.json to be flushed to disk, then spawn detached background daemon
          setTimeout(() => {
            try {
              child.kill('SIGTERM');
            } catch {}
            const daemonRes = startLibrespotDaemon();
            resolve({
              success: daemonRes.success,
              message: daemonRes.success
                ? 'Successfully authenticated Spotify Premium account! Headless playback ready.'
                : (daemonRes.message || 'Authenticated, but headless daemon failed to start.'),
            });
          }, 600);
        }
      }
    };

    child.stdout?.on('data', handleData);
    child.stderr?.on('data', handleData);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, message: `Failed to launch librespot: ${err.message}` });
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          message: `librespot exited with code ${code}.`,
        });
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { child.kill('SIGTERM'); } catch {}
        resolve({ success: false, message: 'Authentication timed out after 2 minutes.' });
      }
    }, 120000);
  });
}

export async function startLibrespotInteractiveAuth(): Promise<{
  success: boolean;
  message: string;
  url?: string;
}> {
  // 1. Ensure Web API OAuth is linked
  const { getValidUserToken, startInteractiveOAuthLogin } = await import('./oauth.ts');
  const token = await getValidUserToken();
  if (!token) {
    const webRes = await startInteractiveOAuthLogin();
    if (!webRes.success) {
      return webRes;
    }
  }

  // 2. Ensure librespot streaming session is authenticated
  return startLibrespotOAuth();
}

