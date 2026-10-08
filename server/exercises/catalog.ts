import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { challengeSchema, type Challenge } from '../../src/shared/challenges.js';

export type CatalogRecord = { path: string; challenge?: Challenge; errors: string[] };

async function jsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }));
  return nested.flat().sort();
}

export async function readCatalog(root = resolve(process.cwd(), 'exercises')): Promise<CatalogRecord[]> {
  const files = await jsonFiles(root);
  return Promise.all(files.map(async path => {
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
      const parsed = challengeSchema.safeParse(raw);
      if (!parsed.success) return { path: relative(root, path), errors: parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`) };
      return { path: relative(root, path), challenge: parsed.data, errors: [] };
    } catch (error) {
      return { path: relative(root, path), errors: [error instanceof Error ? error.message : String(error)] };
    }
  }));
}

