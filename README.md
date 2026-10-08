# Interview Gym

Personal interview practice with Practical TypeScript exercises and JavaScript Algorithms. Drafts, notes, hints, test runs, and submitted attempts are stored in PostgreSQL. Learner code runs in the isolated browser runner.

## Run on your own computer

Requirements: Node.js 22.12 or newer, npm, and PostgreSQL 15 or newer (`pg_config` available on PATH).

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:5173. The local database bootstrap creates a private `.env` file; keep it out of Git. An existing PostgreSQL database can also be configured using `.env.example`.

## Run the built version

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. The API serves the built interface and execution sandbox from the same origin. PostgreSQL must be running and `DATABASE_URL` configured. Install development dependencies too: the start command uses `tsx`.

This command binds to loopback and is accessible from the computer running it. The hosted deployment is described below.

## Practice

- Choose Algorithms (JavaScript) or Practical (TypeScript).
- Expand any test case to see its input and expected output before execution.
- **Run** executes your editor code once. Add your own calls and `console.log(...)`; use top-level `await` for asynchronous calls.
- **Run tests** checks every supplied case. **Stop** cancels execution; each execution also has a 1.5-second deadline.
- Pause/resume the timed session; Restart starts a new session and preserves previous work.
- Submit records a snapshot. Continue practice creates a separate continuation draft.
- History defaults to successful submitted exercises with completion date/time and elapsed practice duration.

## Verification

```sh
npm run check
npm test
npm run build
# With the development API and database running:
npm run verify:flow
```

Reference solutions are verified against every supplied test and example. API verification uses temporary sessions and removes its own fixtures afterward. Browser checks already performed and checks deferred by the user are recorded in `docs/tasks.md`.

## Access from a school browser

The user authorized private remote access on 2026-10-07. The app is deployed at https://interview-gym-dusky.vercel.app with Neon PostgreSQL. Open it in a school browser and enter the app password; no Vercel team login is required.

Configure these **server-only** Vercel environment variables for production and preview:

- `DATABASE_URL`: the provider's pooled PostgreSQL connection URL, with TLS enabled as provided.
- `APP_PASSWORD`: a random password of at least 20 characters. Hosted startup fails without it.

Deploy using the Vite preset and `vercel.json`. The `api/index.ts` function serves the API; the built interface and isolated runner are static assets. Database setup is automatic, transactional, and serialized between cold starts. Login lasts eight hours, stores only token hashes in PostgreSQL, and can be revoked with **Sign out**. Practice code runs exclusively in the isolated browser runner.

Local and hosted databases are separate. Existing local history is not automatically copied to the host. Browser verification was deferred at the user's request.

Run `npm run verify:auth` to verify login against an isolated temporary schema in the configured PostgreSQL database. This check requires permission to create/drop a schema; it does not touch existing practice sessions.
