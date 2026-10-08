import { describe, expect, it } from 'vitest';
import { readCatalog } from '../server/exercises/catalog';
import { validateExecutable } from '../server/exercises/validate';

const records = await readCatalog();
describe('exercise catalog', () => {
  it('loads the complete JSON exercise catalog with unique IDs', () => {
    expect(records.length).toBeGreaterThanOrEqual(5);
    expect(records.flatMap(record => record.errors)).toEqual([]);
    expect(new Set(records.map(record => record.challenge?.id)).size).toBe(records.length);
  });

  it.each(records)('$path exports its function and passes every example and test', async record => {
    expect(record.challenge).toBeDefined();
    expect(await validateExecutable(record.challenge!)).toEqual([]);
  });
});
