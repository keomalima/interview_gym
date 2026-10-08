# Interview Gym

Build a local, single-user technical interview practice tool. Use `mock.png` as the visual reference. Milestone 1 is the only implementation scope; see `docs/v1.md` and `docs/tasks.md`.

## Development
- Use React, TypeScript, and PostgreSQL. Keep database access and secrets on the API server.
- Execute learner code only in the isolated browser runner, never on the API server or in the app window. Preserve cancellation and hard time limits.
- Submitted attempts are immutable. Continuation drafts and submissions must never overwrite the timed attempt.
- Keep challenge requirements, examples, tests, and reference solutions consistent. All prices are explicitly fictional.
- Use parameterized SQL, validate API input, and report persistence failures honestly.
- Do not implement later milestones, AI evaluation, Notion sync, or public deployment.

## Verification
- Run `npm run check`, `npm test`, and `npm run build` before handoff.
- Verify all reference solutions against every challenge test.
- Verify the browser flow: edit, execute, stop runaway code, autosave/reload, hint, submit, continue, and inspect history.
- Verify database persistence and immutable timed snapshots; include timeout and conflicting-save cases.
- Update `docs/tasks.md` with actual checks and outstanding limitations. Never claim unrun checks passed.
