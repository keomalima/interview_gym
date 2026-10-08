import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = resolve('.local');
const data = join(root, 'postgres');
const envFile = resolve('.env');
const port = '55432';
mkdirSync(root, { recursive: true, mode: 0o700 });
const bindir = process.env.PG_BINDIR || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const run = (name, args) => execFileSync(join(bindir, name), args, { stdio: 'inherit' });

if (!existsSync(data)) {
  if (existsSync(envFile)) throw new Error('A .env file already exists. Set DATABASE_URL yourself or move it before local DB initialization.');
  const password = randomBytes(24).toString('base64url');
  const passwordFile = join(root, 'pg-password');
  writeFileSync(passwordFile, password, { mode: 0o600 });
  run('initdb', ['-D', data, '-U', 'interview_gym', '--pwfile', passwordFile, '--auth-local=trust', '--auth-host=scram-sha-256', '--no-instructions']);
  writeFileSync(envFile, `DATABASE_URL=postgresql://interview_gym:${password}@127.0.0.1:${port}/interview_gym\nPORT=3001\n`, { mode: 0o600 });
}

try {
  execFileSync(join(bindir, 'pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore' });
  process.stdout.write('Local PostgreSQL is already running.\n');
} catch {
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, 'start']);
}
const line = readFileSync(envFile, 'utf8').split('\n').find(x => x.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL is missing from .env');
process.env.PGPASSWORD = new URL(line.slice('DATABASE_URL='.length)).password;
const database = execFileSync(join(bindir, 'psql'), ['-h', '127.0.0.1', '-p', port, '-U', 'interview_gym', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'interview_gym'"], { encoding: 'utf8' }).trim();
if (database !== '1') run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'interview_gym', 'interview_gym']);
process.stdout.write('Database ready. Start the app with npm run dev.\n');
