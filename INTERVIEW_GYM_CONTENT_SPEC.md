# Interview Gym content integration specification

> **Historical snapshot:** this document describes the architecture before the JSON catalog work. For the current exercise contract, validation rules, and import commands, use [EXERCISE_AUTHORING_GUIDE.md](EXERCISE_AUTHORING_GUIDE.md). The JSON catalog/import architecture now supersedes sections 1, 2's TypeScript model, and 5 below.

This document records the earlier repository inspection from 2026-10-08. It remains useful for the original runner, database progress schema, and existing exercise examples, but its catalog/import description is no longer current.

## 1. Current architecture at a glance

- PostgreSQL stores runnable exercise definitions in `challenges.payload` as a JSONB copy of a TypeScript `Challenge` object. It does not normalize exercise fields into separate tables.
- The canonical runnable exercise source is `src/shared/challenges.ts`. At API startup, the migration code upserts that source array into PostgreSQL. The API's challenge-list endpoint returns only IDs present in that source array.
- A practice session stores both a `challenge_id` foreign key and a `challenge_snapshot` JSONB copy. Existing sessions therefore retain the exact challenge content they started with.
- Examples, requirements, starter code, hints, and tests are returned to the browser. The reference solution is removed from normal challenge/session API responses and can be fetched only after a timed attempt exists.
- Tests run in the browser. PostgreSQL records the run output and exact code association; submitted attempts store immutable snapshots.

## 2. Database schema

There is no Prisma schema or migration directory. The following DDL is defined and applied by `server/db.ts`; the later `ALTER TABLE` statements are part of the current schema too. SQL types below are PostgreSQL types.

```sql
CREATE TABLE IF NOT EXISTS access_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS access_login_limits (
  bucket bigint PRIMARY KEY,
  attempts integer NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id text PRIMARY KEY,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notion_exercises (
  id text PRIMARY KEY,
  title text NOT NULL,
  source_url text NOT NULL,
  platform text NOT NULL DEFAULT '',
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY,
  challenge_id text NOT NULL REFERENCES challenges(id),
  challenge_snapshot jsonb NOT NULL,
  phase text NOT NULL CHECK (phase IN ('timed', 'continuation')) DEFAULT 'timed',
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  draft_code text NOT NULL,
  draft_revision integer NOT NULL DEFAULT 0,
  continuation_code text,
  continuation_revision integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  notes_revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_runs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('timed', 'continuation')),
  code text NOT NULL,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistance_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  hint_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, hint_index)
);

CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('timed', 'continuation')),
  outcome text NOT NULL CHECK (outcome IN ('submitted', 'expired')),
  code text NOT NULL,
  results jsonb,
  assistance_used jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_timed_attempt
  ON attempts(session_id) WHERE kind='timed';

ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS paused_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS continuation_started_at timestamptz;
ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer;
```

The migration also backfills `attempts.elapsed_seconds` for older rows using the attempt's submission time minus its session start and accumulated paused time. The DDL is executed in a transaction under an advisory transaction lock.

### Tables and relationships

| Table | Purpose and important fields |
|---|---|
| `challenges` | One row per stable text ID/slug. `version` is an integer; `payload` is the complete challenge JSONB. `updated_at` changes on conflict upsert. Current seed logic always writes version `1`. |
| `practice_sessions` | One practice lifecycle per UUID. `challenge_id` references a challenge; `challenge_snapshot` is the full JSONB version used for the session. Holds timed/continuation draft code and revision counters, notes and revision, deadline, pause state, and continuation start. |
| `practice_runs` | Each test execution that the browser reports and the API accepts. Stores phase, exact code, JSON results, and timestamp. Deleting a session cascades to its runs. |
| `assistance_events` | One event per used hint index per session. `(session_id, hint_index)` is unique. Deleting a session cascades. |
| `attempts` | Submitted or expired immutable snapshots with code, nullable results, used hint indexes, timestamps, and elapsed time. Partial unique index allows at most one timed attempt per session; continuation attempts may be multiple. Deleting a session cascades. |
| `notion_exercises` | Separate read-only imported library; not runnable challenges. Topics are JSONB. |
| `access_sessions`, `access_login_limits` | Application password access session hashes and rate-limit counters. These are not exercise progress. |

There is no `users` table or user foreign key: the product currently has a single shared/local user. There are no separate tables for categories, difficulty, topics, requirements, examples, hints, tests, or solutions. Those values live inside `challenges.payload` and the duplicated `practice_sessions.challenge_snapshot`.

### Current TypeScript exercise model

This is the exact public source interface from `src/shared/challenges.ts`:

```ts
export type Example = { label: string; input: unknown[]; output: unknown };
export type ChallengeTest = { name: string; input: unknown[]; expected?: unknown; error?: string };
export type Challenge = {
  id: string;
  title: string;
  eyebrow: string;
  category: 'practical' | 'algorithms';
  language: 'javascript' | 'typescript';
  summary: string;
  durationMinutes: number;
  functionName: string;
  requirements: string[];
  starterCode: string;
  hints: string[];
  examples: Example[];
  tests: ChallengeTest[];
  referenceCode: string;
};
```

`publicChallenge(challenge)` removes only `referenceCode`; it returns all other fields, defaulting category to `practical` and language to `typescript` if absent. Current challenge data explicitly includes both fields. `ChallengeTest.expected` and `error` are optional at the TypeScript level; current tests use `expected` for ordinary outputs and `error` for expected thrown-error substrings.

### Progress data and invariants

- Starting an exercise creates a UUID session and copies the challenge payload into `challenge_snapshot`. Initial `draft_code` is `starterCode`; deadline uses `durationMinutes`.
- Timed draft writes require the current `draft_revision`; successful writes increment it. An expired/submitted timed draft cannot be overwritten. Continuation drafts use their own code and revision.
- Notes have their own revision. The API returns HTTP 409 for stale revisions.
- A run includes `phase`, exact `code`, and JSON result array. The API accepts at most 40 result rows; names must match a prefix of the challenge tests in order. It allows partial runs, though the UI's normal test action runs all tests.
- Submission requires a persisted run for the same session, phase, and exact code string. That run's results are copied into the attempt in a transaction. Timed attempt is unique and immutable after submit/expiry. Continuation submissions are separate rows.
- Expiry snapshots the last server-acknowledged timed draft, matching last run if one exists, and hints used. An unrun expiry stores `results: null`.
- A successful history completion means a submitted attempt has one result for every challenge test and every result is `passed`. History keeps up to the latest 100 sessions in its endpoint.
- Session ID is the stable link between exercise-attempt history and its challenge ID/snapshot. Attempt IDs and run IDs are separate UUIDs. Exercise ID is a stable slug, not a title.

## 3. Exercise execution system

### Runner behavior and exact test format

The browser runner is `src/runner.ts`, `src/compile.worker.ts`, and `public/runner.html`:

1. TypeScript source (including JavaScript source) is compiled with the TypeScript compiler in a disposable Web Worker. Source is capped at 65,536 characters. Imports and dynamic imports are rejected; supplied exercises must be standalone functions.
2. Learner code executes in an opaque-origin sandboxed iframe (`sandbox="allow-scripts"`) and a disposable Web Worker created inside it. The runner page has a CSP with no network connections (`connect-src 'none'`) and no access to the app DOM or API from the learner worker.
3. The runner loads the learner module once, then for each test locates the named exported function and calls it with the test's `input` array spread as positional arguments. It awaits the function, so async functions returning Promises work.
4. Returned values must be JSON serializable, not `undefined`, and no more than 20 KB serialized. Comparison canonicalizes object key order recursively; array order is significant. If `error` is supplied, a thrown error passes when its message contains that substring.
5. Each test has a 1.5 second hard deadline. Compile and sandbox startup each have a 5 second timeout. Stop terminates the iframe/worker. Console output is bounded to 100 entries/about 24 KB per execution; a test run caps displayed entries at 200, with each entry capped at 2,000 characters. Console output is transient and is not persisted.

Tests are defined as positional function arguments and expected JSON values:

```ts
// Ordinary result
{
  name: 'Finds a matching pair',
  input: [[4, 9, 2, 7], 11],
  expected: [1, 2]
}

// Expected throw (substring match against error message)
{
  name: 'Rejects unknown models',
  input: [[{ model: 'mystery', inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }]],
  error: 'Unknown model'
}
```

`input` is always an array; each element is passed as one argument to `functionName`. `expected` is an arbitrary JSON-compatible value. Do not encode an expected exception as an expected string; use the optional `error` field.

### Public/hidden tests and supported exercise types

- **There are no hidden tests.** `GET /api/challenges` exposes `tests`, their inputs, expected values/error substrings, and names to the browser. The API validates result row names/order but does not independently execute or verify learner code. Results are practice feedback, not trusted grading.
- **Supported languages:** JavaScript and TypeScript as standalone exported functions. Both go through `typescript.transpileModule`; TypeScript gets transpilation, not full project type checking. No imports, package installation, filesystem, network, or Node APIs are available.
- **Async JavaScript/TypeScript:** supported for a returned Promise because the runner awaits the function. Top-level await in learner module works for the manual Run path; a challenge's exported function can be async too.
- **React:** not currently supported. There is no React DOM renderer, component test harness, browser preview, or framework bundler in the challenge runner.
- **SQL:** not currently supported. No SQL exercise schema, query runner, PGlite, or database sandbox is provided. Never direct learner SQL to the app's PostgreSQL database.
- **Backend/API exercises:** not supported as executable server work. The sandbox cannot accept network access or run server processes. The current format can still represent a pure function that models business logic over JSON inputs.
- **Multi-file or dependency-based exercises:** not supported. Each solution is one source string and imports are blocked.

## 4. Existing exercise format: complete source records

The following are complete objects serialized from the current `Challenge[]`, including all requirements, examples, tests, starter code, hints, and reference solutions. Strings are exact source content; newlines are represented as JSON escapes in the stored object.

```json
[
  {
    "id": "token-usage",
    "category": "practical",
    "language": "typescript",
    "title": "Calculate token-usage costs",
    "eyebrow": "TypeScript · Business logic",
    "summary": "Turn raw model usage into a customer-facing cost report. Prices below are fictional and supplied for this exercise.",
    "durationMinutes": 25,
    "functionName": "calculateTokenCosts",
    "requirements": [
      "Return totalCents and a byModel array sorted by model name.",
      "The fictional prices per 1,000 tokens are: swift input 20¢, cached input 5¢, output 80¢; deep input 60¢, cached input 15¢, output 240¢.",
      "For each row, bill inputTokens minus cachedInputTokens at the normal input price, cachedInputTokens at the cached price, and outputTokens at the output price.",
      "Sum each model’s fractional cents before rounding once to the nearest whole cent. totalCents is the sum of rounded model amounts.",
      "Reject an unknown model, negative/noninteger token count, or cachedInputTokens greater than inputTokens by throwing an Error.",
      "Include zero-cost models that appear in the input; return an empty array and 0 for no usage."
    ],
    "starterCode": "type Usage = { model: 'swift' | 'deep'; inputTokens: number; cachedInputTokens: number; outputTokens: number };\ntype CostReport = { totalCents: number; byModel: { model: string; cents: number }[] };\n\nexport function calculateTokenCosts(usage: Usage[]): CostReport {\n  // Prices are in cents per 1,000 tokens.\n  return { totalCents: 0, byModel: [] };\n}\n",
    "hints": [
      "Use a price lookup keyed by model. Validate every row before adding its cost.",
      "Keep fractional cents in the accumulator. Round only after all rows for a model are combined.",
      "For a row: (inputTokens - cachedInputTokens) × inputRate / 1000 + cachedInputTokens × cachedRate / 1000 + outputTokens × outputRate / 1000."
    ],
    "examples": [
      {
        "label": "One swift request",
        "input": [
          [
            {
              "model": "swift",
              "inputTokens": 1200,
              "cachedInputTokens": 200,
              "outputTokens": 500
            }
          ]
        ],
        "output": {
          "totalCents": 61,
          "byModel": [
            {
              "model": "swift",
              "cents": 61
            }
          ]
        }
      },
      {
        "label": "Empty usage",
        "input": [
          []
        ],
        "output": {
          "totalCents": 0,
          "byModel": []
        }
      }
    ],
    "tests": [
      {
        "name": "Prices normal, cached, and output tokens",
        "input": [
          [
            {
              "model": "swift",
              "inputTokens": 1200,
              "cachedInputTokens": 200,
              "outputTokens": 500
            }
          ]
        ],
        "expected": {
          "totalCents": 61,
          "byModel": [
            {
              "model": "swift",
              "cents": 61
            }
          ]
        }
      },
      {
        "name": "Groups and sorts models",
        "input": [
          [
            {
              "model": "swift",
              "inputTokens": 1000,
              "cachedInputTokens": 0,
              "outputTokens": 0
            },
            {
              "model": "deep",
              "inputTokens": 1000,
              "cachedInputTokens": 0,
              "outputTokens": 0
            }
          ]
        ],
        "expected": {
          "totalCents": 80,
          "byModel": [
            {
              "model": "deep",
              "cents": 60
            },
            {
              "model": "swift",
              "cents": 20
            }
          ]
        }
      },
      {
        "name": "Rounds after aggregation",
        "input": [
          [
            {
              "model": "swift",
              "inputTokens": 25,
              "cachedInputTokens": 0,
              "outputTokens": 0
            },
            {
              "model": "swift",
              "inputTokens": 25,
              "cachedInputTokens": 0,
              "outputTokens": 0
            }
          ]
        ],
        "expected": {
          "totalCents": 1,
          "byModel": [
            {
              "model": "swift",
              "cents": 1
            }
          ]
        }
      },
      {
        "name": "Keeps zero-cost and empty reports",
        "input": [
          [
            {
              "model": "deep",
              "inputTokens": 0,
              "cachedInputTokens": 0,
              "outputTokens": 0
            }
          ]
        ],
        "expected": {
          "totalCents": 0,
          "byModel": [
            {
              "model": "deep",
              "cents": 0
            }
          ]
        }
      },
      {
        "name": "Rejects unknown models",
        "input": [
          [
            {
              "model": "mystery",
              "inputTokens": 1,
              "cachedInputTokens": 0,
              "outputTokens": 0
            }
          ]
        ],
        "error": "Unknown model"
      },
      {
        "name": "Rejects invalid token counts",
        "input": [
          [
            {
              "model": "swift",
              "inputTokens": 2,
              "cachedInputTokens": 3,
              "outputTokens": 0
            }
          ]
        ],
        "error": "Invalid token count"
      }
    ],
    "referenceCode": "type Usage = { model: 'swift' | 'deep'; inputTokens: number; cachedInputTokens: number; outputTokens: number };\ntype CostReport = { totalCents: number; byModel: { model: string; cents: number }[] };\n\nexport function calculateTokenCosts(usage: Usage[]): CostReport {\n  const prices: Record<string, { input: number; cached: number; output: number }> = {\n    swift: { input: 20, cached: 5, output: 80 },\n    deep: { input: 60, cached: 15, output: 240 },\n  };\n  const totals = new Map<string, number>();\n  for (const row of usage) {\n    const price = prices[row.model];\n    if (!price) throw new Error('Unknown model: ' + row.model);\n    const counts = [row.inputTokens, row.cachedInputTokens, row.outputTokens];\n    if (counts.some(n => !Number.isSafeInteger(n) || n < 0) || row.cachedInputTokens > row.inputTokens) {\n      throw new Error('Invalid token count');\n    }\n    const cents = ((row.inputTokens - row.cachedInputTokens) * price.input + row.cachedInputTokens * price.cached + row.outputTokens * price.output) / 1000;\n    totals.set(row.model, (totals.get(row.model) ?? 0) + cents);\n  }\n  const byModel = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([model, cents]) => ({ model, cents: Math.round(cents) }));\n  return { totalCents: byModel.reduce((sum, row) => sum + row.cents, 0), byModel };\n}\n"
  },
  {
    "id": "matching-brackets",
    "category": "algorithms",
    "language": "javascript",
    "title": "Check matching brackets",
    "eyebrow": "JavaScript · Stacks",
    "summary": "Decide whether a string of brackets is correctly paired and nested.",
    "durationMinutes": 20,
    "functionName": "hasMatchingBrackets",
    "requirements": [
      "Accept text, a string containing only (, ), [, ], {, and }. Return a boolean.",
      "Every opening bracket must have a closing bracket of the same kind, in the correct nesting order.",
      "A closing bracket cannot appear before its opening bracket. No unmatched brackets may remain.",
      "An empty string is valid. Separate balanced groups are valid, as are nested groups.",
      "Inputs contain at most 10,000 characters. Aim for O(n) time using a stack."
    ],
    "starterCode": "export function hasMatchingBrackets(text) {\n  return false;\n}\n\n// Try your own input with Run:\n// console.log(hasMatchingBrackets('([]){}'));\n",
    "hints": [
      "A stack lets you check the most recently opened bracket first.",
      "Push opening brackets. For a closing bracket, compare it with the opening bracket you pop.",
      "Reject a mismatch or a close with an empty stack. At the end, the stack must be empty."
    ],
    "examples": [
      {
        "label": "Nested and separate groups",
        "input": [
          "([]){}"
        ],
        "output": true
      },
      {
        "label": "Wrong nesting order",
        "input": [
          "([)]"
        ],
        "output": false
      },
      {
        "label": "Empty text",
        "input": [
          ""
        ],
        "output": true
      }
    ],
    "tests": [
      {
        "name": "Accepts nested and separate groups",
        "input": [
          "([]){}"
        ],
        "expected": true
      },
      {
        "name": "Rejects crossed bracket pairs",
        "input": [
          "([)]"
        ],
        "expected": false
      },
      {
        "name": "Rejects a closing bracket first",
        "input": [
          ")("
        ],
        "expected": false
      },
      {
        "name": "Rejects an unmatched opening bracket",
        "input": [
          "(()"
        ],
        "expected": false
      },
      {
        "name": "Rejects the wrong closing kind",
        "input": [
          "(]"
        ],
        "expected": false
      },
      {
        "name": "Accepts an empty string",
        "input": [
          ""
        ],
        "expected": true
      },
      {
        "name": "Accepts deeper nesting",
        "input": [
          "{[()()]}"
        ],
        "expected": true
      }
    ],
    "referenceCode": "export function hasMatchingBrackets(text) {\n  const stack = [];\n  const openingFor = { ')': '(', ']': '[', '}': '{' };\n  for (const char of text) {\n    if (char === '(' || char === '[' || char === '{') stack.push(char);\n    else if (stack.pop() !== openingFor[char]) return false;\n  }\n  return stack.length === 0;\n}\n"
  }
]
```

The two records above are representative complete source records: `token-usage` is the practical TypeScript/business-logic exercise, and `matching-brackets` is the JavaScript algorithm exercise. They include the exact current visible tests. Because all tests are public, neither example has a hidden test set.

## 5. Import and seeding system

### Current insertion path

`server/db.ts` applies the schema and seeds runnable exercises during server startup. For each item in the statically imported `challenges` array, it executes the equivalent of:

```sql
INSERT INTO challenges (id, version, payload)
VALUES ($1, 1, $2)
ON CONFLICT (id) DO UPDATE
SET version = EXCLUDED.version,
    payload = EXCLUDED.payload,
    updated_at = now();
```

The ID is the primary key, so a duplicate ID updates the existing row. Current seed logic overwrites its payload and resets `version` to `1`; it is not a version-aware content migration. Since `GET /api/challenges` enumerates the static source array and then fetches those database records, inserting a row directly into PostgreSQL alone does not make a new exercise appear in the application. Add it to the canonical source list as well, or introduce a deliberate catalog/import mechanism in a future implementation.

The separate `src/shared/notion-exercises.ts` list seeds `notion_exercises`; those are archive/reference records, not runnable challenges. There is no general JSON bulk-import command, content upload endpoint, or import validation tool. `scripts/verify-flow.mjs` is a browser-flow verification helper, not an exercise importer.

### Safe integration approach for generated datasets

For the existing architecture, generate a JSON array whose objects conform exactly to the `Challenge` interface, review it, then convert/add those records to the canonical TypeScript catalog. Preserve a stable lowercase kebab-case `id` across edits; do not derive the ID from mutable titles. Validate required keys, enum values, unique IDs, positive durations, `functionName`/starter export consistency, JSON-compatible test inputs/expected outputs, and solution behavior before integrating. Keep the parameterized SQL and primary-key upsert pattern if writing through a future importer.

An upsert by `id` prevents duplicate rows, but does not preserve old content: it replaces the stored payload. The session snapshot protects sessions already created, while newly started sessions use the latest payload. If content versioning matters, the importer should increment `version` only when content changes and should report the prior/new version. The existing startup seed does not do that, so bulk content should not be imported by running ad hoc SQL and assuming the static catalog will stay synchronized.

## 6. Current exercise inventory

Difficulty is not currently represented. Tags are also not a dedicated field: the `eyebrow` string loosely communicates language and topic. Values below are copied from the existing catalog; “topics” are the descriptive portion of `eyebrow`, not normalized metadata.

| ID / slug | Title | Category | Difficulty | Topics / tags (display text) | Duration |
|---|---|---|---|---|---:|
| `token-usage` | Calculate token-usage costs | practical | Not stored | Business logic (eyebrow: `TypeScript · Business logic`) | 25 min |
| `usage-billing` | Build monthly usage invoices | practical | Not stored | Billing (eyebrow: `TypeScript · Billing`) | 30 min |
| `request-logs` | Summarize API request logs | practical | Not stored | Data processing (eyebrow: `TypeScript · Data processing`) | 30 min |
| `target-pair` | Find a target pair | algorithms | Not stored | Arrays & hash maps (eyebrow: `JavaScript · Arrays & hash maps`) | 20 min |
| `matching-brackets` | Check matching brackets | algorithms | Not stored | Stacks (eyebrow: `JavaScript · Stacks`) | 20 min |

There are five runnable challenges in `src/shared/challenges.ts`. The separate Notion archive is excluded because it lacks the runnable challenge contract (starter function, tests, reference code, and duration).

## 7. Recommended content format and architecture fit

### Recommended ChatGPT output

For content that can run today, use a JSON array of complete `Challenge` objects (the same shape shown in section 2 and section 4). A JSON array maps cleanly to PostgreSQL JSONB and avoids inventing fields the application cannot yet consume. Each item should include:

- `id`: stable unique kebab-case slug.
- `title`, `eyebrow`, `category`, `language`, `summary`, `durationMinutes`.
- `functionName`: exported function the runner calls.
- `requirements`: learner-facing constraints and behavior, including input assumptions and edge cases.
- `starterCode`: one standalone JavaScript or TypeScript source file with the expected exported function signature.
- `hints`: ordered strings, from subtle to direct.
- `examples`: labeled positional input arrays and expected output.
- `tests`: named positional input arrays and expected JSON output, or an expected error substring.
- `referenceCode`: complete standalone reference implementation. This is stored in the database payload but removed from ordinary challenge/session payloads; the server has a separate gated route that reveals it only after a timed attempt exists.

Keep test cases deterministic and use JSON values only. Include clear cases for ordinary behavior, boundaries, empty inputs where relevant, and invalid input only if the requirements specify the expected behavior. Ensure examples agree with the implementation and tests. Avoid embedding hidden evaluation expectations: current tests are public and the API does not independently execute them.

### Supported now versus additions required

| Content / metadata | Current support | Integration notes |
|---|---|---|
| Algorithms and practical business-logic exercises | Supported | Both categories are represented in the interface. |
| JavaScript and TypeScript | Supported | Standalone function source only; TypeScript is transpiled, not type-checked as a project. |
| Async function behavior | Supported | The runner awaits the returned Promise, subject to the per-test timeout. |
| Requirements, summary, examples, hints, visible tests, reference solution | Supported | Stored as payload fields; all but the reference solution are sent to the client. |
| Estimated duration | Supported | `durationMinutes` drives the timed session deadline. |
| Difficulty, normalized topics/tags, prerequisites, learning objectives, companies, role/seniority | Requires schema/interface and UI/API changes | Current `eyebrow` is a single display string, not a structured topic list. |
| Hidden tests / partial credit / per-test weighting | Requires runner and API design changes | Current test payload is public, and results are client-reported. Server-side trusted grading would need a separate secure execution design. |
| React component exercises | Not executable now | Needs an isolated React build/render/test harness and framework-specific starter format. |
| SQL query exercises | Not executable now | Needs a disposable database/schema fixture and isolated query execution. Do not use the application database. |
| Backend/API/server exercises | Not executable now | Needs an isolated server runtime and controlled request harness; the current worker is offline and function-oriented. |
| Multiple files, npm dependencies, external APIs, filesystem tasks | Not executable now | Imports/network are blocked and the runner accepts one source string. |
| Structured setup/teardown, fixtures, language/runtime versions | Requires schema/interface and runner changes | Current inputs are plain JSON positional arguments; no per-exercise environment configuration exists. |

If the bank needs richer metadata or multiple exercise kinds, introduce a versioned content contract and explicit `exerciseType`/runtime fields, then update validation, API responses, runner dispatch, catalog selection, and tests together. Keep `referenceCode` server-side and continue stripping it from learner-facing responses. A future importer should validate at runtime (not rely only on TypeScript types), reject duplicate IDs within a batch, use parameterized SQL, run a transaction, and produce a clear create/update report.

## 8. Source files consulted

- `server/db.ts` — PostgreSQL DDL, migrations, and startup upserts.
- `src/shared/challenges.ts` — challenge interfaces and canonical five-exercise catalog.
- `src/runner.ts`, `src/compile.worker.ts`, `public/runner.html` — compilation, isolation, execution limits, and comparison behavior.
- `server/index.ts` — challenge/session/run/attempt/hint APIs and snapshot invariants.
- `src/shared/notion-exercises.ts` — separate Notion archive records.
- `docs/v1.md`, `docs/tasks.md` — milestone scope and project requirements.

No secrets, environment values, credentials, or database contents are included in this document.
