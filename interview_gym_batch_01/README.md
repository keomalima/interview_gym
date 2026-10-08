# Interview Gym — curated exercise batch 01

This archive contains **20 original exercises**, one JSON object per file, following `EXERCISE_AUTHORING_GUIDE.md` (schemaVersion 1). The 5 known existing IDs were excluded. The folder tree is rooted at `exercises/`; unpack it into the repository root while preserving folders.

## Import procedure (run inside the Interview Gym repository)

1. Inspect JSON files and check IDs against the live catalog.
2. Run `npm run exercises:validate`.
3. Only after validation passes, run `npm run exercises:import` with the correct PostgreSQL connection.

Do not import before checking the current database and the test runner. The included tests were independently executed using the TypeScript compiler and Node's VM against the reference solutions; this is **not** a substitute for validating with the application's browser runner and import schema.

All 20 exercises have `exerciseType: function`. React DOM, SQL, external-network and real HTTP server execution are intentionally excluded until the application has dedicated runners. Backend-themed exercises here test pure business logic only. All tests are public in the current product.

`MANIFEST.json` lists titles, categories, topics, durations, and file paths.
