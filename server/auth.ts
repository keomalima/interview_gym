import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from './db.js';

const password = process.env.APP_PASSWORD;
export const authRequired = !!password;
const hosted = !!process.env.VERCEL || (!!process.env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(process.env.HOST));
if (hosted && (!password || password.length < 20)) throw new Error('Hosted access requires APP_PASSWORD with at least 20 characters.');
const secureCookie = hosted || process.env.COOKIE_SECURE === 'true';
const cookieName = secureCookie ? '__Host-interviewGym' : 'interviewGym';
const lifetimeSeconds = 8 * 60 * 60;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function token(req: Request): string | null {
  const value = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function authenticated(req: Request): Promise<boolean> {
  if (!authRequired) return true;
  const value = token(req);
  if (!value) return false;
  return !!(await pool.query('SELECT 1 FROM access_sessions WHERE token_hash=$1 AND expires_at>now()', [hash(value)])).rows[0];
}
function setCookie(res: Response, value: string, maxAge: number) {
  res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`);
}

export function installAuth(app: Express) {
  // JSON writes and same-origin fetches only. Cookies cannot authorize cross-site writes.
  app.use('/api', (req, res, next) => {
    if (authRequired && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // req.is() returns null for bodyless POSTs even when they declare JSON,
      // which rejects actions such as restarting a timer that need no payload.
      const contentType = req.get('content-type') ?? '';
      if (!/^application\/json(?:\s*;|$)/i.test(contentType) || req.get('sec-fetch-site') === 'cross-site') {
        res.status(403).json({ error: 'Use a same-origin JSON request.' }); return;
      }
      const origin = req.get('origin');
      if (origin) {
        try {
          if (new URL(origin).host !== req.get('host')) { res.status(403).json({ error: 'Cross-origin requests are unavailable.' }); return; }
        } catch { res.status(403).json({ error: 'Invalid request origin.' }); return; }
      }
    }
    next();
  });
  app.get('/api/auth/status', async (req, res) => {
    res.json({ required: authRequired, authenticated: await authenticated(req) });
  });
  app.post('/api/auth/login', async (req, res) => {
    if (!authRequired) { res.json({ ok: true }); return; }
    const { password: supplied } = z.object({ password: z.string().min(1).max(256) }).parse(req.body);
    const bucket = Math.floor(Date.now() / 60000);
    const attempt = (await pool.query<{ attempts: number }>(`INSERT INTO access_login_limits(bucket,attempts) VALUES($1,1)
      ON CONFLICT(bucket) DO UPDATE SET attempts=access_login_limits.attempts+1 RETURNING attempts`, [bucket])).rows[0];
    if (attempt.attempts > 10) { res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Too many sign-in attempts. Try again in a minute.' }); return; }
    if (!timingSafeEqual(Buffer.from(hash(supplied), 'hex'), Buffer.from(hash(password!), 'hex'))) {
      res.status(401).json({ error: 'Incorrect password.' }); return;
    }
    const value = randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM access_sessions WHERE expires_at<=now()');
    await pool.query('DELETE FROM access_login_limits WHERE bucket<$1', [bucket - 2]);
    // Remove a previous login cookie when this browser signs in again.
    const previous = token(req);
    if (previous) await pool.query('DELETE FROM access_sessions WHERE token_hash=$1', [hash(previous)]);
    await pool.query("INSERT INTO access_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')", [hash(value)]);
    setCookie(res, value, lifetimeSeconds);
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const value = token(req);
    if (value) await pool.query('DELETE FROM access_sessions WHERE token_hash=$1', [hash(value)]);
    setCookie(res, '', 0);
    res.json({ ok: true });
  });
  app.use('/api', async (req, res, next) => {
    if (!await authenticated(req)) { res.status(401).json({ error: 'Sign in to access your practice.' }); return; }
    next();
  });
}
