import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const schema = `auth_check_${randomBytes(8).toString('hex')}`;
const password = randomBytes(32).toString('base64url');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let child;
try {
  await db.query(`CREATE SCHEMA ${schema}`);
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set('options', `-c search_path=${schema}`);
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, DATABASE_URL: connection.toString(), APP_PASSWORD: password, PORT: '3003', NODE_ENV: 'development', HOST: '127.0.0.1', VERCEL: '', COOKIE_SECURE: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const base = 'http://127.0.0.1:3003/api';
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Auth server exited: ${output}`);
    try { if ((await fetch(base + '/auth/status')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Auth server did not start');
  let cookie = '';
  async function request(path, status = 200, body, extraHeaders = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status, `${path}: ${await response.clone().text()}`);
    return response;
  }
  assert.deepEqual(await (await request('/auth/status')).json(), { required: true, authenticated: false });
  await request('/challenges', 401); await request('/history', 401);
  await request('/auth/login', 401, { password: 'wrong' });
  await request('/auth/login', 403, { password }, { Origin: 'https://another-site.example' });
  await request('/auth/login', 403, { password }, { 'Sec-Fetch-Site': 'cross-site' });
  const login = await request('/auth/login', 200, { password });
  const header = login.headers.get('set-cookie');
  assert(header.includes('HttpOnly') && header.includes('SameSite=Strict') && header.includes('Max-Age=28800'));
  cookie = header.split(';')[0];
  assert.equal((await (await request('/auth/status')).json()).authenticated, true);
  assert.equal((await (await request('/challenges')).json()).length, 5);
  const rows = (await db.query(`SELECT token_hash FROM ${schema}.access_sessions`)).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].token_hash.length, 64);
  assert(!rows[0].token_hash.includes(cookie.split('=')[1]));
  const session = await (await request('/sessions', 200, { challengeId: 'target-pair' })).json();
  assert.equal((await (await request(`/sessions/${session.id}`)).json()).id, session.id);
  const oldCookie = cookie;
  await request('/auth/logout', 200, {});
  await request('/challenges', 401); // Revoked cookie cannot be reused.
  cookie = oldCookie.replace(/.$/, oldCookie.endsWith('x') ? 'y' : 'x');
  await request('/history', 401);
  cookie = '';
  for (let i = 0; i < 8; i++) await request('/auth/login', 401, { password: 'wrong' });
  await request('/auth/login', 429, { password });
  console.log('Password access, cookie flags, private API, token hashing/revocation, cross-origin rejection, and login limit passed against PostgreSQL.');
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await db.end();
}
