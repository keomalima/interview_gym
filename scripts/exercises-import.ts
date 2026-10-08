import { readCatalog } from '../server/exercises/catalog.js';
import { validateExecutable } from '../server/exercises/validate.js';

const records = await readCatalog();
const byId = new Map<string, string>();
const errors: string[] = [];
const rejectedPaths = new Set<string>();
for (const record of records) {
  for (const error of record.errors) { errors.push(`${record.path}: ${error}`); rejectedPaths.add(record.path); }
  if (record.challenge) {
    const previous = byId.get(record.challenge.id);
    if (previous) { errors.push(`${record.path}: duplicate id "${record.challenge.id}" (also in ${previous})`); rejectedPaths.add(record.path); rejectedPaths.add(previous); }
    else byId.set(record.challenge.id, record.path);
  }
}
for (const record of records) {
  if (!record.challenge || record.errors.length) continue;
  for (const prerequisite of record.challenge.prerequisites) if (!byId.has(prerequisite)) { errors.push(`${record.path}: unknown prerequisite "${prerequisite}"`); rejectedPaths.add(record.path); }
  const exerciseErrors = await validateExecutable(record.challenge);
  if (exerciseErrors.length) rejectedPaths.add(record.path);
  errors.push(...exerciseErrors);
}
if (!records.length) errors.push('No .json exercise files found under exercises/');
if (errors.length) {
  console.error(`Import rejected: ${errors.length} validation issue${errors.length === 1 ? '' : 's'}; database was not changed.`);
  for (const error of errors) console.error(`- ${error}`);
  console.log(`Summary: created 0, updated 0, unchanged 0, rejected ${rejectedPaths.size}.`);
  process.exitCode = 1;
} else {
  const { initializeDatabase, pool } = await import('../server/db.js');
  const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  try {
    await initializeDatabase();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(73461982)');
      const existing = (await client.query<{ id: string; version: number; payload: unknown }>('SELECT id,version,payload FROM challenges WHERE id = ANY($1::text[]) FOR UPDATE', [records.map(r => r.challenge!.id)])).rows;
      const current = new Map(existing.map(row => [row.id, row]));
      const stable = (value: any): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}` : JSON.stringify(value);
      for (const record of records) {
        const challenge = record.challenge!;
        const old = current.get(challenge.id);
        if (old && stable(old.payload) === stable(challenge)) { counts.unchanged++; continue; }
        const version = old ? Number(old.version) + 1 : 1;
        await client.query(`INSERT INTO challenges(id,version,payload) VALUES($1,$2,$3)
          ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload,updated_at=now()`, [challenge.id, version, challenge]);
        if (old) counts.updated++; else counts.created++;
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    console.log(`Import complete: created ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged}, rejected ${counts.rejected}.`);
  } catch (error) {
    console.error(`Import failed; transaction rolled back: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
