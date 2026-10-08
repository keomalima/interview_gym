# Interview Gym exercise authoring guide

This is the content contract for exercise JSON files. Create one JSON object per file under `exercises/`, grouped into any descriptive subfolders. The catalog recursively discovers `*.json` files; a file's folder does not change its exercise metadata. Use the stable exercise `id` as the filename where practical.

## Definitive schema

Every object must use `schemaVersion: 1` and exactly these fields. Unknown keys are rejected.

```ts
type Exercise = {
  schemaVersion: 1;
  id: string; // stable kebab-case unique ID
  title: string;
  eyebrow: string; // short display label, e.g. "JavaScript · Arrays & hash maps"
  category: 'practical' | 'algorithms'; // current navigation grouping
  language: 'javascript' | 'typescript';
  difficulty: 'easy' | 'medium' | 'hard';
  topics: string[]; // free-form, concise normalized topic labels
  skills: string[]; // free-form skills assessed
  targetRoles: ('frontend' | 'backend' | 'fullstack' | 'general')[];
  exerciseType: 'function' | 'react-component' | 'sql-query' | 'backend-api';
  prerequisites: string[]; // optional; IDs must exist in this catalog
  summary: string;
  durationMinutes: number; // integer 1..240
  functionName: string; // exported function used by the function runner
  requirements: string[];
  starterCode: string; // one standalone source file, <= 65,536 characters
  hints: string[]; // ordered from subtle to direct
  examples: { label: string; input: unknown[]; output: unknown }[];
  tests:
    | { name: string; input: unknown[]; expected: unknown }[]
    | { name: string; input: unknown[]; error: string }[];
  referenceCode: string; // complete standalone solution, <= 65,536 characters
};
```

Although `prerequisites` may be omitted, the importer normalizes it to `[]`. Every other listed property is required. Examples and tests each require an input array; its elements are spread as positional arguments to the named exported function.

### Complete valid example

This example is intentionally small and illustrates the exact JSON shape.

```json
{
  "schemaVersion": 1,
  "id": "count-even-values",
  "title": "Count even values",
  "eyebrow": "JavaScript · Arrays",
  "category": "algorithms",
  "language": "javascript",
  "difficulty": "easy",
  "topics": ["arrays", "parity"],
  "skills": ["iteration", "edge-case reasoning"],
  "targetRoles": ["general", "backend", "fullstack"],
  "exerciseType": "function",
  "prerequisites": [],
  "summary": "Count the even integers in an array.",
  "durationMinutes": 15,
  "functionName": "countEvenValues",
  "requirements": [
    "Return the number of values divisible by 2.",
    "Return 0 for an empty array. Do not mutate the input."
  ],
  "starterCode": "export function countEvenValues(values) {\n  return 0;\n}\n",
  "hints": [
    "Visit each value once.",
    "A value is even when its remainder after division by 2 is zero."
  ],
  "examples": [
    { "label": "Mixed values", "input": [[1, 2, 4, 7]], "output": 2 },
    { "label": "Empty list", "input": [[]], "output": 0 }
  ],
  "tests": [
    { "name": "Counts mixed values", "input": [[1, 2, 4, 7]], "expected": 2 },
    { "name": "Counts negative even values", "input": [[-4, -3, 0]], "expected": 2 },
    { "name": "Handles an empty list", "input": [[]], "expected": 0 }
  ],
  "referenceCode": "export function countEvenValues(values) {\n  return values.filter(value => value % 2 === 0).length;\n}\n"
}
```

The example above documents the format; it is not added to the exercise catalog by this task.

## Accepted metadata values

- `difficulty` must be `easy`, `medium`, or `hard`.
- `targetRoles` entries must be `frontend`, `backend`, `fullstack`, or `general`.
- `category` is currently `practical` or `algorithms`; it controls current navigation grouping.
- `language` is currently `javascript` or `typescript`.
- `exerciseType` is a separate execution-format field. The schema recognizes `function`, `react-component`, `sql-query`, and `backend-api` so the contract can grow without conflating organization with execution. **Only `function` is currently executable/importable.** The other values are deliberately rejected by validation/import until a corresponding isolated runner exists.
- `topics` and `skills` are nonempty free-form string arrays, not closed enums. Use short lowercase labels consistently (for example `arrays`, `bfs`, `promises`, `parsing`, `sql`, `input validation`, `complexity analysis`). Do not add selection logic or ranking rules to these content values.
- `prerequisites` is a list of IDs from the same discovered catalog. The importer rejects missing references.

Folders may use topic/category names such as `exercises/algorithms/graphs/` or `exercises/practical/promises/`; folder names do not imply category, difficulty, or runner type.

## Executable tests and runner limits

1. Export the exact `functionName` from both starter and reference source. Use a standalone function; do not import modules or packages.
2. `input` must be a JSON array of positional arguments. Each example's `output` and each normal test's `expected` must be a JSON-compatible value.
3. To check an expected throw, use the `error` field with a nonempty substring of the error message. Use `expected` for all successful return values. A test object must contain exactly one of those fields.
4. Match the requirements, examples, reference implementation, and every test. The validator runs reference code against every example and test, compares JSON values with object key order ignored and array order preserved, and awaits async returns.
5. Keep each test under 1.5 seconds and each serialized return value under 20 KB. Do not rely on timers, network, Node APIs, filesystem, browser DOM, or package installation. The browser runner blocks imports and runs code in an isolated iframe/worker with network access disabled.
6. TypeScript is transpiled, not checked as a full TypeScript project. Keep code understandable after transpilation and avoid type-only constructs that require project declarations.
7. All tests are visible to learners today. Do not put secrets, hidden grading criteria, or sensitive values in exercise payloads.

Current execution supports only standalone JavaScript/TypeScript functions, including async functions. React components, SQL queries, real backend/API exercises, multiple files, external dependencies, and networked tasks cannot execute yet. Do not label those as `function` exercises to bypass this limitation.

## Validation and importing

```sh
npm run exercises:validate
npm run exercises:import
```

Validation parses every discovered file, rejects duplicate IDs and missing prerequisites, verifies the expected exports, and executes each reference solution against all examples and tests. It does not require a database. The import command repeats validation before connecting to PostgreSQL, then imports the entire valid catalog in one transaction. If any file is invalid, no rows are written. Re-running it is safe: identical payloads are unchanged; changed payloads are updated and their version increments; new IDs are created at version 1. It never deletes exercises or progress.

Configure the app's existing PostgreSQL connection locally before importing (for example with `npm run db:local`). The importer uses that configured connection and does not print credentials. Existing sessions retain their saved challenge snapshots and attempts; new sessions use the currently imported database payload. Keep IDs stable to preserve history links and prerequisite references.

## ChatGPT batch-generation constraints

- Return complete JSON exercise objects matching schema version 1, preferably one object per file, and include every required field.
- Use stable unique IDs; check the existing inventory and generated batch for duplicates.
- Set metadata honestly and keep topic/skill labels consistent across the batch.
- Supply standalone starter and reference functions, deterministic JSON-only examples and tests, ordered hints, and requirements that fully define edge behavior.
- Run `npm run exercises:validate` and correct every reported file/test before requesting an import.
- Do not generate React, SQL, or backend execution formats as importable content until their runner support is implemented.
