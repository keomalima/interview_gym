# Ordered milestones

## 1. Practice v1 — local implementation complete; access at 42 pending
- [x] React/TypeScript interface and server-only PostgreSQL access.
- [x] Five exercises with examples, progressive hints, tests, and verified reference solutions.
- [x] Categories corrected to Algorithms and Practical. Two JavaScript algorithm exercises were explicitly added to v1 at the user's request on 2026-10-07.
- [x] Larger, vertically resizable editor; hide navigation/brief; expand/restore editor.
- [x] Remembered dark/light theme.
- [x] Separate Run and Run tests; learner console output with bounded messages.
- [x] Test inputs and expected outputs visible before execution; learner outputs visible afterward.
- [x] Server-backed timer, persisted pause/resume, autosaved drafts/notes, and assistance tracking.
- [x] Restart creates a new session without replacing prior work.
- [x] Immutable timed submissions and separate continuation drafts/submissions.
- [x] History defaults to successful submitted exercises with completion date/time and elapsed practice duration.
- [x] Production start command serves the built interface, API, and isolated runner together.
- [x] Launch instructions in README.md.
- [x] Access method at 42: school computer browser, confirmed by the user.
- [x] Create/link the Vercel `interview-gym` project and prepare API/function configuration and private password access with sign-out.
- [x] Hash login tokens in PostgreSQL, use HttpOnly/SameSite cookies (Secure on the host), reject cross-origin writes, and rate-limit logins.
- [x] Preserve the mounted editor when access expires; retry pending saves after signing in again.
- [x] Connect the existing Neon `interview-gym` production branch and deploy the app to Vercel at https://interview-gym-dusky.vercel.app. The deployed API initialized its PostgreSQL schema and five challenges.
- [x] Make the URL accessible without a Vercel team login. The user turned off Vercel Authentication on 2026-10-08; the app's password screen and API authentication remain active.
- [ ] Remaining browser checks deferred by explicit user request on 2026-10-07. Do not delay school-access work for these.

## 2. Larger question bank — deferred
Search, filtering, difficulty/topic selection, recommendations, and a larger curriculum.

## 3. Additional formats — deferred
Debugging, React previews, SQL, and architecture. The small JavaScript algorithm category above is the user-authorized v1 exception.

## 4. Feedback and progress — deferred
Advanced progress analytics, structured feedback, optional AI evaluation, and Notion sync.

## Verification evidence — 2026-10-07
- Latest `npm run check`, `npm test`, and `npm run build` passed. All five reference solutions match every supplied challenge test and example.
- `npm run verify:flow` passed against real PostgreSQL: draft/notes persistence, stale-save rejection, hints, immutable timed code/results/assistance, separate continuations, completion summaries, expiry, and duplicate submission rejection.
- Extended API checks passed: persisted pause/resume, idempotent timer actions, paused time excluded from elapsed duration, pause protection when the original deadline passes, incomplete suites never marked successful, invalid test names rejected, and closed timed drafts protected.
- Production server started at 127.0.0.1:3002 for an HTTP smoke check. It served the built index, runner.html, and a successful PostgreSQL health response. Production browser execution has not been verified.
- Before browser checks were deferred, Brave verified standalone Run with actual console logs, circular/BigInt serialization, no window/document/localStorage in learner scope, and fetch blocked by runner CSP.
- Brave verified stopping a running infinite loop and automatic termination after 1.5 seconds.
- Brave verified draft and paused timer surviving reload, notes and hints, a passing six-case practical suite, timed submission, continuation submission, success/date/duration history, theme persistence, and editor expansion.
- A browser check exposed delayed CodeMirror snapshot display; the editor now remounts when switching sessions/phases/snapshots. Recheck confirmed the timed view excludes the continuation addition and the current draft includes it.
- Brave verified JavaScript algorithm starter execution: standalone Run logged only its own calls; Run tests returned 3/8 for the incomplete target-pair starter. Test case display showed input, expected output, and actual output. The other algorithm's reference is covered by the reference test suite; its browser flow has not been checked.
- API verification scripts remove their own newly created fixtures. Temporary sessions from manual verification are cleaned using their exact IDs; user-created exercises and attempts are preserved.

- Vercel production build passed. Generated deployment routing was checked for nested auth, session, draft, and hint paths.
- Hosted-access verification: `node scripts/verify-auth.mjs` passed against a dedicated temporary PostgreSQL schema: login, cookie flags, unauthorized API rejection, token hashing/revocation, cross-origin rejection, and login throttling. The script drops only its own schema.
- Type checking, all reference tests, build, and the existing PostgreSQL flow passed after the hosted-access changes. Browser checks remain deferred.

## Verification evidence — 2026-10-08
- `npm run check`, `npm test`, and `npm run build` passed after fixing explicit `.js` imports required by Vercel's Node runtime. All five reference solutions passed the supplied challenge tests.
- `npm run verify:flow` passed against local PostgreSQL after the import fix, including stale-save conflicts, expiry, immutable timed snapshots, and separate continuation attempts. `npm run verify:auth` passed against its temporary schema.
- Vercel deployment `dpl_upvwRb5zBRp4RzYxeSeketDFXmkt` is ready at https://interview-gym-dusky.vercel.app. The authenticated deployment request to `/api/auth/status` returned `{ "required": true, "authenticated": false }`; Neon contains seven application tables and five challenges, with no practice sessions or attempts yet.
- After the user changed Vercel Deployment Protection, unauthenticated public requests returned HTTP 200 for `/` and `/runner.html`, HTTP 200 with `{ "required": true, "authenticated": false }` for `/api/auth/status`, and HTTP 401 for `/api/challenges`. Full hosted browser flow remains unverified by the earlier user request to defer browser checks.
- The hosted Neon database already contained all five v1 exercises. The UI now presents examples and test inputs/outputs as compact JSON, shows an elapsed timer with smaller icon controls, and has a Prettier button that lazily loads JavaScript/TypeScript formatting support (including the Estree plugin). Prettier smoke checks passed for JavaScript and TypeScript; `npm run check`, `npm test`, and `npm run build` passed. The user's Notion Coding Practice database was imported as a read-only library of 53 source-backed exercise pages; 11 cheatsheets were excluded. The original pages are available in the library, but their legacy notes have not been converted into runnable challenges or invented test cases. Production deployment `dpl_AkzmY9XbouYekLUha189Y5vtgyQp` is ready at https://interview-gym-dusky.vercel.app; the live endpoint was not rechecked because network DNS is unavailable in the sandbox.

## Remaining limitations
- School-browser access to the URL is available; signing in and the full hosted practice flow have not been checked in that browser.
- Build emits a large-bundle warning: the TypeScript compiler worker is about 3.59 MB and the client bundle about 766 KB before compression. Optimization is deferred.
- Console output is transient and cleared on reload. Await asynchronous calls at module top level for standalone Run.
- Browser isolation/time limits do not guarantee protection against every browser resource-exhaustion case. Results are personal feedback, not trusted examination grades.
- Browser test coverage is currently Brave on this machine. Console flooding, mobile layout, and full production browser flow remain unchecked/deferred.
- Some older durations are inferred from preexisting timestamps; continuation time adds active continuation duration to the timed snapshot duration and excludes the gap before continuation starts.

## Final UX and local fresh start — 2026-10-08
- Removed the paused timer banner. The timer now shows the remaining timed-session budget (elapsed duration after the timed phase) with compact pause/resume and restart icon controls. Restart saves the current code and notes, closes the old timed clock without creating an attempt, and creates a fresh full-duration timed session with the saved code carried forward.
- Added lightweight query-string navigation for direct exercise links, History, and interview ID plus selected exercise position. App navigation updates browser history and handles popstate, so browser back/forward restores the selected page and interview tab. Interview exercise tabs now share a fixed height with centered numbering and truncating titles.
- Sidebar category groups are discovered from the exercise catalog instead of a hardcoded category list. Interview playlist generation continues to select randomly from the full supported catalog and avoid the immediately previous playlist when alternatives exist.
- Verified the configured database target as local PostgreSQL at `127.0.0.1:55432`, database `interview_gym`. Created `.local/backups/interview_gym-before-reset-2026-10-08T16-54-33-239Z.dump` before truncating practice sessions, attempts, runs, assistance, interviews, and interview completions. The 25 exercise rows and 53 Notion source rows were retained; importing the JSON catalog afterward reported 25 unchanged. All practice and interview history tables were confirmed empty and `/api/progress` returns no completion IDs.
- Verification after implementation: `npm run check`, `npm test` (36 tests), `npm run build`, `npm run verify:flow`, `npm run verify:interview`, and `npm run exercises:validate` passed. The flow check includes timer restart duration/code preservation and no generated attempt; interview check verifies a new playlist avoids the preceding playlist. Build still reports the existing large-chunk warning.
- Automated checks verify URL round-trips and database persistence. A full interactive browser refresh/back-forward walkthrough and visual measurement of tab alignment were not repeated; mobile layout remains outstanding.

## Visual reference update — 2026-10-08
- Updated the default practice screen to open directly into a full-width split view, with the challenge brief on the left and editor plus output on the right. Tightened the header, panel spacing, and output sizing to follow the supplied screenshot while retaining the exercise drawer, notes, timer, and session controls.
- `npm run check`, `npm test` (5 tests), and `npm run build` passed after the layout update. The build retains the existing large-chunk warning.
- Browser-level visual comparison at desktop and mobile sizes has not been performed.
- Saved attempts are now available in an Attempts tab beside Notes in the challenge panel; the below-workspace list has been removed. `npm run check`, `npm test` (5 tests), and `npm run build` passed after this change. The build still reports the existing large-chunk warning.
- The exercise header was compacted after the user supplied a screenshot showing overlapping controls: brief/editor controls now sit in the top toolbar, and the title, tags, and timer take less vertical space. `npm run check`, `npm test` (5 tests), and `npm run build` passed. The build still reports the existing large-chunk warning. Browser visual inspection is outstanding because no browser surface was available in the session.
- The output panel now uses horizontal case tabs with a selected case detail pane for input, expected output, actual output, and that case's transient stdout. The Console tab sits at the bottom and still shows manual Run logs. `npm run check`, `npm test` (5 tests), and `npm run build` passed. Browser visual inspection remains outstanding; console entries are still transient and are not attached to saved attempts.

## Exercise content catalog — 2026-10-08
- Moved the five runnable exercises from a TypeScript array into standalone JSON files under `exercises/algorithms/` and `exercises/practical/`. Added schema version, difficulty, topics, skills, target roles, function execution type, and prerequisites without changing exercise IDs or their execution content.
- The API now lists imported PostgreSQL challenge payloads directly. Database initialization no longer overwrites exercise payloads on every startup; existing sessions and attempts remain linked to their stable challenge IDs and keep their challenge snapshots.
- Added a strict Zod schema, recursive catalog discovery, executable validation, and an atomic database importer. Changed payloads increment version; identical payloads are not rewritten. Initial import updated five records; a repeat import reported five unchanged.
- Added `EXERCISE_AUTHORING_GUIDE.md` as the version 1 content contract. `npm run exercises:validate` passed for all five exercises and their examples/tests. `npm run check`, `npm test` (6 tests), and `npm run build` passed; the build retains the existing large-bundle warning.
- Importer rollback behavior for an intentionally invalid batch and API/browser use against a fresh database have not been separately exercised. A new/empty database must run `npm run exercises:import` before the API can list exercises. The production Neon database was not modified by this work.
- Integrated `interview_gym_batch_01/exercises/` into the live JSON catalog, preserving its subfolders and content. `npm run exercises:validate` passed: 25 exercises total, with all examples and tests verified. `npm run exercises:import` created 20, updated 0, left 5 unchanged, and rejected 0.
- Local authenticated `GET /api/challenges` returned 25 exercises, including all 20 batch IDs and all five original IDs. Import only upserts challenge rows and did not delete or rewrite session/attempt/history rows. No exercise requirements were changed. Production Neon was not modified.

## UX and Interview Mode — 2026-10-08
- Exercise briefs now present Task, Input / Output, Examples, Rules and edge cases, and Constraints using the existing content fields. Attempts loads all saved submissions for the selected exercise across practice sessions, newest first, and opens the submitted snapshot read-only with its results.
- Practice now previews an exercise with an idle timer; Start Exercise creates the timed session. Existing unfinished sessions still restore. The Tests / Console panel starts collapsed, retains the selected tab, expands after tests run, and gives a compact result summary when collapsed. Desktop sidebar and workspace have independent scroll regions; Notion Library navigation was removed while its table remains intact.
- Interview Mode creates a saved three exercise playlist with one supported algorithm, one JavaScript fundamentals exercise, and one practical programming exercise. Setup has no role or difficulty form. Start Interview begins one 60 minute timer. Drafts, results, switching, refresh restoration, finish, expiry, and a simple recap use persisted interview tables. New Interview creates another playlist. Selection is metadata based and excludes unsupported runners.
- `npm run check`, `npm test` (30 tests), and `npm run build` passed. `npm run verify:flow` and `npm run verify:interview` passed against local PostgreSQL. The updated local browser UI showed the idle 60:00 interview clock, three diverse exercises, no role/difficulty form, and no competing practice timer in Interview Mode. Starting the interview and browser refresh were verified through the database-backed API test; browser visual checks at mobile sizes remain outstanding.

## Workspace simplification and successful completion — 2026-10-08
- Practice and Interview now use the same split instruction/editor/output workspace classes. The desktop app uses a viewport-height layout, independent sidebar and instruction scrolling, and a compact Interview toolbar with exercise tabs, shared timer, Start/Finish, and New Interview. Tests/Console remains collapsible and the editor yields space when the panel expands. Recent Practice was removed from navigation.
- Interview selection now randomizes within metadata-defined algorithm, fundamentals, and practical groups, favors exercises outside the previous playlist, then unfinished exercises, and fills a small catalog with repeats. Selection remains stored in the interview rows. Replacing an active interview asks first, then finishes and saves it before creating the next playlist.
- New practice attempts are inserted only when the exact saved run passes every challenge test. Failed submissions return 422 without creating attempts; expiry marks the session expired without creating an attempt. Timed completion state is stored on the session so code remains available for continuation. Interview test runs also remain non-completions until the user submits a passing run. Interview completions are stored separately, surfaced in Attempts, included in successful exercise progress, and unlock reference solutions only after the interview is finished. Existing attempt rows are retained.
- Verification: `npm run check`, `npm test`, `npm run build`, `npm run verify:flow`, and `npm run verify:interview` passed against the local PostgreSQL instance. Selection unit tests cover previous-playlist avoidance, completion preference, distinct picks, and small-catalog repetition. The build reports the existing large-chunk warning.
- A desktop browser tree snapshot confirmed the existing Practice screen, collapsed Tests panel, exercise tabs, and timer controls remain present. A full visual browser comparison and mobile viewport walkthrough were not completed.

## Junior-friendly solutions and timer/hint fixes — 2026-10-08
- Replaced the 145 matching exercise JSON payloads from `interview_gym_junior_friendly_solutions.zip`; the five original exercises remained unchanged. Production import updated 145 challenge payloads and left 5 unchanged. The import was upsert-only; practice/interview progress and history were preserved.
- Practice and Interview timers now refresh from persisted deadline/pause timestamps on each tick and immediately on focus/visibility return. Interview countdown is derived from `deadline_at` rather than the stale `seconds_left` response field. Pause/resume continues to use persisted server timestamps.
- Interview hints now render from each selected exercise's persisted `hints_used` indexes, so switching tabs and refresh restore that exercise's hints without carrying another exercise's hint text.
- Verification passed: `npm run exercises:validate` (150 exercises, all examples/tests), `npm run check`, `npm test` (163 tests), `npm run build`, `npm run verify:flow`, and `npm run verify:interview`. Build retains the existing large-chunk warning.
- Production deployment `dpl_DurmXsiciLe8MEQwqZhhZECe4Yy3` is Ready at `https://interview-gym-dusky.vercel.app` (also aliased to `https://gym.keomalima.com`). The deploy was triggered by the GitHub `main` push. Interactive browser verification was not available in this session; the local browser inventory had no browser sessions.

## Exercise descriptions — 2026-10-09
- Expanded learner-facing problem statements for all 150 exercises with clearer context and goals. Existing exercise contracts and tests were retained.
- Verified all 150 reference solutions with `npm run exercises:validate`; `npm run check`, `npm test` (163 tests), and `npm run build` passed. The build retains the existing large-chunk warning.
- Updated and read back all 150 summaries on the production Neon branch. The discount exercise requirements were also synchronized. Existing sessions and attempts were not changed.
