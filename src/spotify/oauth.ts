import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { getConfigDir } from './daemon.ts';
import { loadConfig } from '../config.ts';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp ms
  scope?: string;
  clientId: string;
}

const DEFAULT_CLIENT_ID = '65b708073fc0480ea92a077233ca87bd';
const REDIRECT_PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'playlist-read-private',
  'user-library-read',
];

function getAuthFilePath(): string {
  return path.join(getConfigDir(), 'auth.json');
}

export function loadSavedAuth(): AuthTokens | null {
  const file = getAuthFilePath();
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (data.accessToken && data.refreshToken) {
        return data;
      }
    }
  } catch {}
  return null;
}

export function saveAuthTokens(tokens: AuthTokens): void {
  const file = getAuthFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch {}
}

export function clearSavedAuth(): void {
  const file = getAuthFilePath();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

export function getEffectiveClientId(): string {
  const conf = loadConfig();
  return conf.spotifyClientId || process.env.SPOTIFY_CLIENT_ID || DEFAULT_CLIENT_ID;
}

export async function getValidUserToken(): Promise<string | null> {
  const auth = loadSavedAuth();
  if (!auth) return null;

  const now = Date.now();
  // If token is valid for at least another 60 seconds, return it
  if (auth.expiresAt > now + 60000) {
    return auth.accessToken;
  }

  // Refresh token
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: auth.clientId || getEffectiveClientId(),
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    if (data.access_token) {
      const updated: AuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || auth.refreshToken,
        expiresAt: now + (data.expires_in || 3600) * 1000,
        scope: data.scope || auth.scope,
        clientId: auth.clientId,
      };
      saveAuthTokens(updated);
      return updated.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function startInteractiveOAuthLogin(): Promise<{
  success: boolean;
  message: string;
}> {
  const clientId = getEffectiveClientId();
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SCOPES.join(' '),
    }).toString();

  return new Promise((resolve) => {
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${REDIRECT_PORT}`);

        if (reqUrl.pathname === '/callback') {
          const code = reqUrl.searchParams.get('code');
          const returnedState = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html><body style="font-family:system-ui;text-align:center;padding:50px;background:#181818;color:#ff5555">
                <h2>Authentication Failed</h2>
                <p>${error}</p>
              </body></html>
            `);
            if (!resolved) {
              resolved = true;
              server.close();
              resolve({ success: false, message: `Spotify authorization failed: ${error}` });
            }
            return;
          }

          if (!code || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html><body style="font-family:system-ui;text-align:center;padding:50px;background:#181818;color:#ffaa00">
                <h2>Invalid Request State</h2>
              </body></html>
            `);
            if (!resolved) {
              resolved = true;
              server.close();
              resolve({ success: false, message: 'OAuth state mismatch' });
            }
            return;
          }

          // Exchange authorization code for tokens
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: REDIRECT_URI,
              client_id: clientId,
              code_verifier: verifier,
            }).toString(),
            signal: AbortSignal.timeout(6000),
          });

          if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html><body style="font-family:system-ui;text-align:center;padding:50px;background:#181818;color:#ff5555">
                <h2>Token Exchange Failed</h2>
                <pre>${errText}</pre>
              </body></html>
            `);
            if (!resolved) {
              resolved = true;
              server.close();
              resolve({ success: false, message: `Token exchange failed: ${errText}` });
            }
            return;
          }

          const tokenData: any = await tokenRes.json();
          const tokens: AuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
            scope: tokenData.scope,
            clientId,
          };

          saveAuthTokens(tokens);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="font-family:system-ui;text-align:center;padding:60px;background:#121212;color:#1DB954">
              <h1>✔ Connected to Spotify-CLI!</h1>
              <p style="color:#e0e0e0;font-size:16px;">Headless playback authorization is complete.</p>
              <p style="color:#888;">You can close this window and return to your terminal.</p>
            </body></html>
          `);

          if (!resolved) {
            resolved = true;
            server.close();
            resolve({
              success: true,
              message: 'Successfully authenticated Spotify Premium account!',
            });
          }
        }
      } catch (err: any) {
        if (!resolved) {
          resolved = true;
          server.close();
          resolve({ success: false, message: err.message || 'Authentication error' });
        }
      }
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      // Open URL in macOS browser
      try {
        spawn('open', [authUrl], { stdio: 'ignore' });
      } catch {}
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        resolve({ success: false, message: 'Authentication timed out after 2 minutes.' });
      }
    }, 120000);
  });
}
