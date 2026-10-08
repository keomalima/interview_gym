import { readCatalog } from '../server/exercises/catalog.js';
import { validateExecutable } from '../server/exercises/validate.js';

const records = await readCatalog();
const problems: string[] = [];
const ids = new Map<string, string>();
for (const record of records) {
  for (const error of record.errors) problems.push(`${record.path}: ${error}`);
  if (record.challenge) {
    const previous = ids.get(record.challenge.id);
    if (previous) problems.push(`${record.path}: duplicate id "${record.challenge.id}" (also in ${previous})`);
    else ids.set(record.challenge.id, record.path);
  }
}
for (const record of records) {
  if (!record.challenge || record.errors.length) continue;
  for (const prerequisite of record.challenge.prerequisites) if (!ids.has(prerequisite)) problems.push(`${record.path}: unknown prerequisite "${prerequisite}"`);
  problems.push(...await validateExecutable(record.challenge));
}
if (!records.length) problems.push('No .json exercise files found under exercises/');
if (problems.length) {
  console.error(`Exercise validation failed (${problems.length} issue${problems.length === 1 ? '' : 's'}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else console.log(`Exercise validation passed: ${records.length} exercises, all examples and tests verified.`);
