import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { initializeDatabase, pool } from './db.js';
import { installAuth } from './auth.js';
import { publicChallenge, type Challenge } from '../src/shared/challenges.js';
import { allTestsPassed, interviewExpired, selectInterviewExercises, summarizeInterviewExercise } from '../src/shared/interview.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb' }));
app.use((_, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', async (_req, _res, next) => {
  try { await initializeDatabase(); next(); } catch (error) { next(error); }
});
installAuth(app);
type Row = Record<string, any>;
const uuid = z.uuid();
const codeSchema = z.string().max(65536);
const resultsSchema = z.array(z.object({ name: z.string().max(180), status: z.enum(['passed', 'failed', 'error', 'timeout']), expected: z.string().max(4000).optional(), actual: z.string().max(4000).optional(), durationMs: z.number().nonnegative().finite().optional() })).max(40);
const send = (res: express.Response, value: unknown) => res.json(value);
const notFound = (res: express.Response) => res.status(404).json({ error: 'Session not found' });
function elapsedSeconds(session: Row, at = Date.now(), timed?: Row): number {
  if (session.phase === 'continuation' && session.continuation_started_at) {
    return (timed?.elapsed_seconds ?? 0) + Math.max(0, Math.floor((at - new Date(session.continuation_started_at).getTime()) / 1000));
  }
  return Math.max(0, Math.floor((at - new Date(session.started_at).getTime() - Number(session.paused_ms)) / 1000));
}
const conflict = (res: express.Response, message: string) => res.status(409).json({ error: message });

async function expireIfNeeded(sessionId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = (await client.query<Row>('SELECT * FROM practice_sessions WHERE id=$1 FOR UPDATE', [sessionId])).rows[0];
    if (!session) { await client.query('ROLLBACK'); return null; }
    if (!session.paused_at && !session.timed_finished_at && new Date(session.deadline_at).getTime() <= Date.now()) {
      await client.query("UPDATE practice_sessions SET timed_finished_at=deadline_at,timed_outcome='expired',updated_at=now() WHERE id=$1", [sessionId]);
    }
    const current = (await client.query<Row>('SELECT * FROM practice_sessions WHERE id=$1', [sessionId])).rows[0];
    await client.query('COMMIT');
    return current;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getSession(id: string): Promise<Row | null> {
  const session = await expireIfNeeded(id);
  if (!session) return null;
  const [attempts, runs, assistance] = await Promise.all([
    pool.query<Row>('SELECT * FROM attempts WHERE session_id=$1 ORDER BY submitted_at, id', [id]),
    pool.query<Row>('SELECT id,phase,code,results,created_at FROM practice_runs WHERE session_id=$1 ORDER BY created_at DESC LIMIT 20', [id]),
    pool.query<Row>('SELECT hint_index,created_at FROM assistance_events WHERE session_id=$1 ORDER BY hint_index', [id])
  ]);
  return {
    ...session,
    challenge: publicChallenge(session.challenge_snapshot as Challenge),
    challenge_snapshot: undefined,
    attempts: attempts.rows,
    runs: runs.rows,
    assistance: assistance.rows,
    expired: !!session.timed_finished_at && session.timed_outcome === 'expired' || !session.paused_at && !session.timed_finished_at && new Date(session.deadline_at).getTime() <= Date.now(),
  };
}

async function finalizeInterviewIfExpired(id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const interview = (await client.query<Row>('SELECT * FROM interview_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!interview) { await client.query('ROLLBACK'); return; }
    if (interviewExpired(interview.status, interview.deadline_at)) {
      await client.query(`UPDATE interview_exercises SET time_spent_seconds=time_spent_seconds+
        GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($2-active_since)))::int),active_since=NULL,updated_at=now()
        WHERE interview_id=$1 AND active_since IS NOT NULL`, [id, interview.deadline_at]);
      await client.query("UPDATE interview_sessions SET status='completed',finished_at=deadline_at WHERE id=$1", [id]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getInterview(id: string): Promise<Row | null> {
  await finalizeInterviewIfExpired(id);
  const interview = (await pool.query<Row>('SELECT * FROM interview_sessions WHERE id=$1', [id])).rows[0];
  if (!interview) return null;
  const exercises = (await pool.query<Row>(`SELECT e.*, c.submitted_at AS completed_at
    FROM interview_exercises e LEFT JOIN interview_completions c USING(interview_id,position)
    WHERE e.interview_id=$1 ORDER BY e.position`, [id])).rows;
  const now = Date.now();
  const started = interview.started_at ? new Date(interview.started_at).getTime() : null;
  const end = interview.finished_at ? new Date(interview.finished_at).getTime() : now;
  const elapsedSeconds = started ? Math.min(interview.duration_minutes * 60, Math.max(0, Math.floor((end - started) / 1000))) : 0;
  return {
    ...interview,
    elapsed_seconds: elapsedSeconds,
    seconds_left: interview.status === 'active' ? Math.max(0, Math.ceil((new Date(interview.deadline_at).getTime() - now) / 1000)) : 0,
    exercises: exercises.map(row => {
      const challenge = row.challenge_snapshot as Challenge;
      const timeSpent = Number(row.time_spent_seconds) + (row.active_since && interview.status === 'active' ? Math.max(0, Math.floor((now - new Date(row.active_since).getTime()) / 1000)) : 0);
      return { ...row, challenge: publicChallenge(challenge), time_spent_seconds: timeSpent,
        summary: summarizeInterviewExercise({ tests: challenge.tests, results: row.results, completed: !!row.completed_at }) };
    }),
  };
}

app.get('/api/health', async (_req, res) => { await pool.query('SELECT 1'); send(res, { ok: true, database: 'postgresql' }); });
app.get('/api/notion-exercises', async (_req, res) => {
  const rows = (await pool.query<Row>('SELECT id,title,source_url,platform,topics,notes,content FROM notion_exercises ORDER BY title,id')).rows;
  send(res, rows);
});
app.get('/api/challenges', async (_req, res) => {
  const rows = (await pool.query<Row>(`SELECT payload FROM challenges
    ORDER BY payload->>'category', payload->>'title', id`)).rows;
  send(res, rows.map(row => publicChallenge(row.payload as Challenge)));
});
app.get('/api/progress', async (_req, res) => {
  const rows = (await pool.query<Row>(`SELECT s.challenge_id FROM attempts a JOIN practice_sessions s ON s.id=a.session_id
    WHERE a.outcome='submitted' AND jsonb_array_length(a.results)=jsonb_array_length(s.challenge_snapshot->'tests')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.results) r WHERE r->>'status'<>'passed')
    UNION SELECT challenge_id FROM interview_completions`)).rows;
  send(res, rows.map(row => row.challenge_id));
});
app.get('/api/attempts', async (req, res) => {
  const { challengeId } = z.object({ challengeId: z.string().min(1) }).parse(req.query);
  const rows = (await pool.query<Row>(`SELECT a.id::text AS id,s.id AS session_id,a.kind,a.outcome,a.code,a.results,a.assistance_used,a.submitted_at,a.elapsed_seconds,s.challenge_snapshot
    FROM attempts a JOIN practice_sessions s ON s.id=a.session_id
    WHERE s.challenge_id=$1
    UNION ALL
    SELECT c.interview_id::text||':'||c.position::text AS id,c.interview_id AS session_id,'timed' AS kind,'submitted' AS outcome,c.code,c.results,
      to_jsonb(c.hints_used) AS assistance_used,c.submitted_at,c.elapsed_seconds,e.challenge_snapshot
    FROM interview_completions c JOIN interview_exercises e USING(interview_id,position)
    WHERE c.challenge_id=$1
    ORDER BY submitted_at DESC,id DESC`, [challengeId])).rows;
  send(res, rows.map(row => ({ ...row, challenge: publicChallenge(row.challenge_snapshot as Challenge), challenge_snapshot: undefined })));
});
app.get('/api/interviews/history', async (_req, res) => {
  const rows = (await pool.query<Row>("SELECT id FROM interview_sessions WHERE status='completed' ORDER BY finished_at DESC LIMIT 100")).rows;
  const completed = await Promise.all(rows.map(row => getInterview(row.id)));
  send(res, completed.filter(Boolean));
});
app.post('/api/interviews', async (req, res) => {
  z.object({}).strict().parse(req.body ?? {});
  const catalog = await pool.query<Row>('SELECT payload FROM challenges');
  const allChallenges = catalog.rows.map(row => row.payload as Challenge);
  const prior = (await pool.query<Row>(`SELECT e.challenge_id FROM interview_exercises e
    WHERE e.interview_id=(SELECT id FROM interview_sessions ORDER BY created_at DESC LIMIT 1)`)).rows.map(row => row.challenge_id);
  const completedIds = (await pool.query<Row>(`SELECT s.challenge_id FROM attempts a JOIN practice_sessions s ON s.id=a.session_id
    WHERE a.outcome='submitted' AND jsonb_array_length(a.results)=jsonb_array_length(s.challenge_snapshot->'tests')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.results) r WHERE r->>'status'<>'passed')
    UNION SELECT challenge_id FROM interview_completions`)).rows.map(row => row.challenge_id);
  const selection = selectInterviewExercises(allChallenges, prior, completedIds);
  if (!selection.exercises.length) { res.status(422).json({ error: 'No supported exercises are available for an interview.' }); return; }
  const client = await pool.connect();
  const id = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO interview_sessions(id,target_role,difficulty,duration_minutes,prefer_unseen) VALUES($1,'general','mixed',60,true)", [id]);
    for (const [position, item] of selection.exercises.entries()) {
      const challenge = catalog.rows.map(row => row.payload as Challenge).find(row => row.id === item.id)!;
      await client.query('INSERT INTO interview_exercises(interview_id,position,challenge_id,challenge_snapshot,draft_code) VALUES($1,$2,$3,$4,$5)', [id, position, challenge.id, challenge, challenge.starterCode]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  send(res, { ...(await getInterview(id)), selection_explanation: selection.explanation });
});
app.get('/api/interviews/:id', async (req, res) => {
  const interview = await getInterview(uuid.parse(req.params.id));
  if (!interview) { notFound(res); return; }
  send(res, interview);
});
app.post('/api/interviews/:id/start', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await pool.query(`UPDATE interview_sessions SET status='active',started_at=COALESCE(started_at,now()),deadline_at=COALESCE(deadline_at,now()+(duration_minutes||' minutes')::interval)
    WHERE id=$1 AND status='setup'`, [id]);
  const interview = await getInterview(id);
  if (!interview) { notFound(res); return; }
  if (interview.status === 'completed') { conflict(res, 'This interview is already finished.'); return; }
  send(res, interview);
});
app.post('/api/interviews/:id/exercises/:position/open', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  await finalizeInterviewIfExpired(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const interview = (await client.query<Row>('SELECT * FROM interview_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!interview) { await client.query('ROLLBACK'); notFound(res); return; }
    if (interview.status !== 'active') { await client.query('ROLLBACK'); conflict(res, 'Start the interview before opening exercises.'); return; }
    const target = (await client.query('SELECT position FROM interview_exercises WHERE interview_id=$1 AND position=$2', [id, position])).rows[0];
    if (!target) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Interview exercise not found' }); return; }
    await client.query(`UPDATE interview_exercises SET time_spent_seconds=time_spent_seconds+GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (now()-active_since)))::int),active_since=NULL
      WHERE interview_id=$1 AND active_since IS NOT NULL AND position<>$2`, [id, position]);
    await client.query('UPDATE interview_exercises SET active_since=COALESCE(active_since,now()),updated_at=now() WHERE interview_id=$1 AND position=$2', [id, position]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  send(res, await getInterview(id));
});
app.patch('/api/interviews/:id/exercises/:position/draft', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  const { code } = z.object({ code: codeSchema }).parse(req.body);
  await finalizeInterviewIfExpired(id);
  const row = (await pool.query<Row>(`UPDATE interview_exercises e SET draft_code=$3,updated_at=now()
    WHERE e.interview_id=$1 AND e.position=$2 AND EXISTS(SELECT 1 FROM interview_sessions i WHERE i.id=$1 AND i.status='active') RETURNING e.position`, [id, position, code])).rows[0];
  if (!row) { conflict(res, 'Interview ended or exercise was not found.'); return; }
  send(res, { saved: true });
});
app.post('/api/interviews/:id/exercises/:position/run', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  const { code, results } = z.object({ code: codeSchema, results: resultsSchema }).parse(req.body);
  await finalizeInterviewIfExpired(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const interview = (await client.query<Row>('SELECT * FROM interview_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const exercise = (await client.query<Row>('SELECT * FROM interview_exercises WHERE interview_id=$1 AND position=$2 FOR UPDATE', [id, position])).rows[0];
    if (!interview || !exercise) { await client.query('ROLLBACK'); notFound(res); return; }
    const challenge = exercise.challenge_snapshot as Challenge;
    if (interview.status !== 'active' || code !== exercise.draft_code || results.length > challenge.tests.length || results.some((result: Row, index: number) => result.name !== challenge.tests[index].name)) {
      await client.query('ROLLBACK'); conflict(res, 'Interview ended or test results do not match the saved exercise draft.'); return;
    }
    await client.query('UPDATE interview_exercises SET results=$3,updated_at=now() WHERE interview_id=$1 AND position=$2', [id, position, JSON.stringify(results)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  send(res, { saved: true });
});
app.post('/api/interviews/:id/exercises/:position/submit', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  const { code } = z.object({ code: codeSchema }).parse(req.body);
  await finalizeInterviewIfExpired(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const interview = (await client.query<Row>('SELECT * FROM interview_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const exercise = (await client.query<Row>('SELECT * FROM interview_exercises WHERE interview_id=$1 AND position=$2 FOR UPDATE', [id, position])).rows[0];
    if (!interview || !exercise) { await client.query('ROLLBACK'); notFound(res); return; }
    const challenge = exercise.challenge_snapshot as Challenge;
    const results = exercise.results as Row[] | null;
    const passed = allTestsPassed(challenge.tests, results as { name: string; status: 'passed' | 'failed' | 'error' | 'timeout' }[] | null);
    if (interview.status !== 'active' || code !== exercise.draft_code || !passed) {
      await client.query('ROLLBACK'); res.status(422).json({ error: 'Run every test successfully on the saved code before submitting.' }); return;
    }
    const hints = exercise.hints_used ?? [];
    const elapsed = Number(exercise.time_spent_seconds) + (exercise.active_since ? Math.max(0, Math.floor((Date.now() - new Date(exercise.active_since).getTime()) / 1000)) : 0);
    await client.query('UPDATE interview_exercises SET time_spent_seconds=$3,active_since=now() WHERE interview_id=$1 AND position=$2', [id, position, elapsed]);
    await client.query(`INSERT INTO interview_completions(interview_id,position,challenge_id,code,results,hints_used,elapsed_seconds)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(interview_id,position) DO NOTHING`,
    [id, position, exercise.challenge_id, code, JSON.stringify(results), hints, elapsed]);
    await client.query('COMMIT');
    send(res, { completed: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
app.post('/api/interviews/:id/exercises/:position/hints', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  await finalizeInterviewIfExpired(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const interview = (await client.query<Row>('SELECT status FROM interview_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const exercise = (await client.query<Row>('SELECT * FROM interview_exercises WHERE interview_id=$1 AND position=$2 FOR UPDATE', [id, position])).rows[0];
    if (!interview || !exercise) { await client.query('ROLLBACK'); notFound(res); return; }
    if (interview.status !== 'active') { await client.query('ROLLBACK'); conflict(res, 'Hints are available during an active interview.'); return; }
    const hints = exercise.challenge_snapshot.hints as string[]; const index = exercise.hints_used.length;
    if (index >= hints.length) { await client.query('ROLLBACK'); res.status(404).json({ error: 'No more hints are available.' }); return; }
    await client.query('UPDATE interview_exercises SET hints_used=array_append(hints_used,$3),updated_at=now() WHERE interview_id=$1 AND position=$2', [id, position, index]);
    await client.query('COMMIT'); send(res, { index, hint: hints[index] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
app.post('/api/interviews/:id/finish', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await finalizeInterviewIfExpired(id);
  await pool.query(`UPDATE interview_exercises SET time_spent_seconds=time_spent_seconds+GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (now()-active_since)))::int),active_since=NULL
    WHERE interview_id=$1 AND active_since IS NOT NULL`, [id]);
  await pool.query("UPDATE interview_sessions SET status='completed',finished_at=COALESCE(finished_at,now()) WHERE id=$1 AND status='active'", [id]);
  const interview = await getInterview(id);
  if (!interview) { notFound(res); return; }
  send(res, interview);
});
app.get('/api/interviews/:id/exercises/:position/reference', async (req, res) => {
  const id = uuid.parse(req.params.id); const position = z.coerce.number().int().nonnegative().parse(req.params.position);
  const interview = await getInterview(id);
  if (!interview) { notFound(res); return; }
  if (interview.status !== 'completed') { conflict(res, 'Reference solutions unlock when the interview is finished.'); return; }
  const challenge = (await pool.query<Row>('SELECT challenge_snapshot FROM interview_exercises WHERE interview_id=$1 AND position=$2', [id, position])).rows[0]?.challenge_snapshot as Challenge | undefined;
  if (!challenge) { res.status(404).json({ error: 'Interview exercise not found' }); return; }
  send(res, { code: challenge.referenceCode });
});
app.get('/api/history', async (_req, res) => {
  const due = (await pool.query<Row>(`SELECT s.id FROM practice_sessions s WHERE s.paused_at IS NULL AND s.deadline_at<=now()
    AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.session_id=s.id AND a.kind='timed')`)).rows;
  for (const session of due) await expireIfNeeded(session.id);
  // Summarize the first successful submitted attempt, otherwise the latest attempt.
  const rows = (await pool.query<Row>(`SELECT s.id, s.challenge_id, s.started_at, s.deadline_at,
    s.phase, s.challenge_snapshot->>'title' AS title,
    (SELECT count(*)::int FROM attempts a WHERE a.session_id=s.id) AS attempt_count,
    COALESCE((SELECT outcome FROM attempts a WHERE a.session_id=s.id AND kind='timed'),s.timed_outcome) AS timed_outcome,
    chosen.submitted_at AS completed_at, chosen.elapsed_seconds,
    COALESCE(chosen.success, false) AS success, COALESCE(chosen.outcome,s.timed_outcome) AS outcome
    FROM practice_sessions s
    LEFT JOIN LATERAL (
      SELECT a.*, (a.outcome='submitted' AND jsonb_array_length(a.results)=jsonb_array_length(s.challenge_snapshot->'tests')
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.results) r WHERE r->>'status' <> 'passed')) AS success
      FROM attempts a WHERE a.session_id=s.id
      ORDER BY success DESC NULLS LAST, CASE WHEN a.outcome='submitted'
        AND jsonb_array_length(a.results)=jsonb_array_length(s.challenge_snapshot->'tests')
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.results) r WHERE r->>'status' <> 'passed')
        THEN a.submitted_at END ASC, a.submitted_at DESC LIMIT 1
    ) chosen ON true
    ORDER BY s.started_at DESC LIMIT 100`)).rows;
  send(res, rows);
});
app.post('/api/sessions', async (req, res) => {
  const { challengeId, notes = '' } = z.object({ challengeId: z.string(), notes: z.string().max(20000).optional() }).parse(req.body);
  const challenge = (await pool.query<Row>('SELECT payload FROM challenges WHERE id=$1', [challengeId])).rows[0]?.payload as Challenge | undefined;
  if (!challenge) { res.status(404).json({ error: 'Challenge not found' }); return; }
  const id = randomUUID();
  await pool.query(`INSERT INTO practice_sessions(id,challenge_id,challenge_snapshot,deadline_at,draft_code,notes)
    VALUES($1,$2,$3,now()+($4 || ' minutes')::interval,$5,$6)`, [id, challengeId, challenge, String(challenge.durationMinutes), challenge.starterCode, notes]);
  send(res, await getSession(id));
});
app.get('/api/sessions/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const session = await getSession(id);
  if (!session) { notFound(res); return; }
  send(res, session);
});
app.post('/api/sessions/:id/restart', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const current = await getSession(id);
  if (!current) { notFound(res); return; }
  const currentCode = current.phase === 'continuation' ? current.continuation_code ?? current.draft_code : current.draft_code;
  const nextId = randomUUID();
  const snapshot = (await pool.query<Row>('SELECT challenge_snapshot FROM practice_sessions WHERE id=$1', [id])).rows[0].challenge_snapshot;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE practice_sessions SET timed_finished_at=COALESCE(timed_finished_at,now()),timed_outcome=CASE WHEN timed_finished_at IS NULL THEN 'restarted' ELSE timed_outcome END,paused_at=NULL,updated_at=now() WHERE id=$1 AND phase='timed' AND NOT EXISTS(SELECT 1 FROM attempts WHERE session_id=$1 AND kind='timed')", [id]);
    await client.query(`INSERT INTO practice_sessions(id,challenge_id,challenge_snapshot,deadline_at,draft_code,notes)
      VALUES($1,$2,$3,now()+($4 || ' minutes')::interval,$5,$6)`, [nextId, current.challenge_id, snapshot, String((current.challenge as Challenge).durationMinutes), currentCode, current.notes]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  send(res, await getSession(nextId));
});
app.patch('/api/sessions/:id/draft', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { phase, code, revision } = z.object({ phase: z.enum(['timed','continuation']), code: codeSchema, revision: z.number().int().nonnegative() }).parse(req.body);
  const session = await expireIfNeeded(id);
  if (!session) { notFound(res); return; }
  if (phase !== session.phase) { conflict(res, 'Session phase changed. Reload the session.'); return; }
    if (phase === 'timed') {
      const row = (await pool.query<Row>(`UPDATE practice_sessions SET draft_code=$2,draft_revision=draft_revision+1,updated_at=now()
      WHERE id=$1 AND draft_revision=$3 AND (paused_at IS NOT NULL OR deadline_at>now()) AND timed_finished_at IS NULL AND NOT EXISTS(SELECT 1 FROM attempts WHERE session_id=$1 AND kind='timed') RETURNING draft_revision`, [id, code, revision])).rows[0];
    if (!row) { conflict(res, 'Timed draft changed or time expired. Reload the session.'); return; }
    send(res, { revision: row.draft_revision });
  } else {
    const row = (await pool.query<Row>(`UPDATE practice_sessions SET continuation_code=$2,continuation_revision=continuation_revision+1,updated_at=now()
      WHERE id=$1 AND continuation_revision=$3 RETURNING continuation_revision`, [id, code, revision])).rows[0];
    if (!row) { conflict(res, 'Continuation draft changed. Reload the session.'); return; }
    send(res, { revision: row.continuation_revision });
  }
});
app.patch('/api/sessions/:id/notes', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { notes, revision } = z.object({ notes: z.string().max(20000), revision: z.number().int().nonnegative() }).parse(req.body);
  const row = (await pool.query<Row>('UPDATE practice_sessions SET notes=$2,notes_revision=notes_revision+1 WHERE id=$1 AND notes_revision=$3 RETURNING notes_revision', [id, notes, revision])).rows[0];
  if (!row) { conflict(res, 'Notes changed elsewhere. Reload the session.'); return; }
  send(res, { revision: row.notes_revision });
});
app.post('/api/sessions/:id/hints/:index', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const index = z.coerce.number().int().nonnegative().parse(req.params.index);
  const session = await getSession(id);
  if (!session) { notFound(res); return; }
  const challenge = session.challenge as Challenge;
  if (index >= challenge.hints.length) { res.status(404).json({ error: 'Hint not found' }); return; }
  await pool.query('INSERT INTO assistance_events(id,session_id,hint_index) VALUES($1,$2,$3) ON CONFLICT(session_id,hint_index) DO NOTHING', [randomUUID(), id, index]);
  send(res, { hint: challenge.hints[index], index });
});
app.post('/api/sessions/:id/runs', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { phase, code, results } = z.object({ phase: z.enum(['timed','continuation']), code: codeSchema, results: resultsSchema }).parse(req.body);
  const session = await getSession(id);
  if (!session) { notFound(res); return; }
  const tests = (session.challenge as Challenge).tests;
  if (results.length > tests.length || results.some((result, index) => result.name !== tests[index].name)) {
    res.status(400).json({ error: 'Results must match the challenge checks in order.' }); return;
  }
  const expectedCode = phase === 'timed' ? session.draft_code : session.continuation_code;
  if (phase !== session.phase || code !== expectedCode) { conflict(res, 'Save this exact draft before recording a run.'); return; }
  if (phase === 'timed' && (session.paused_at || session.expired || session.timed_finished_at || session.attempts.some((a: Row) => a.kind === 'timed'))) { conflict(res, 'Timed session is closed.'); return; }
  const runId = randomUUID();
  await pool.query('INSERT INTO practice_runs(id,session_id,phase,code,results) VALUES($1,$2,$3,$4,$5)', [runId, id, phase, code, JSON.stringify(results)]);
  send(res, { id: runId });
});
app.post('/api/sessions/:id/submit', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { phase, code, runId } = z.object({ phase: z.enum(['timed','continuation']), code: codeSchema, runId: uuid }).parse(req.body);
  await expireIfNeeded(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = (await client.query<Row>('SELECT * FROM practice_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!session) { await client.query('ROLLBACK'); notFound(res); return; }
    const timed = (await client.query('SELECT id,elapsed_seconds FROM attempts WHERE session_id=$1 AND kind=$2', [id, 'timed'])).rows[0];
    if (phase !== session.phase || code !== (phase === 'timed' ? session.draft_code : session.continuation_code) || (phase === 'timed' && (session.paused_at || timed || session.timed_finished_at || new Date(session.deadline_at).getTime() <= Date.now()))) {
      await client.query('ROLLBACK'); conflict(res, 'Draft changed or the timed attempt is closed. Reload the session.'); return;
    }
    const run = (await client.query<Row>('SELECT results FROM practice_runs WHERE id=$1 AND session_id=$2 AND phase=$3 AND code=$4', [runId, id, phase, code])).rows[0];
    if (!run) { await client.query('ROLLBACK'); conflict(res, 'Run tests on this exact draft before submitting.'); return; }
    const challenge = session.challenge_snapshot as Challenge;
    const runResults = run.results as Row[];
    const allPassed = allTestsPassed(challenge.tests, runResults as { name: string; status: 'passed' | 'failed' | 'error' | 'timeout' }[]);
    if (!allPassed) { await client.query('ROLLBACK'); res.status(422).json({ error: 'A completed attempt requires every test to pass.' }); return; }
    const duplicate = (await client.query<Row>('SELECT id FROM attempts WHERE session_id=$1 AND kind=$2 AND outcome=$3 AND code=$4 ORDER BY submitted_at LIMIT 1', [id, phase, 'submitted', code])).rows[0];
    if (duplicate) { await client.query('COMMIT'); send(res, { id: duplicate.id, duplicate: true }); return; }
    const assistance = (await client.query('SELECT hint_index FROM assistance_events WHERE session_id=$1 ORDER BY hint_index', [id])).rows.map(row => row.hint_index);
    const attemptId = randomUUID();
    await client.query('INSERT INTO attempts(id,session_id,kind,outcome,code,results,assistance_used,elapsed_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [attemptId, id, phase, 'submitted', code, JSON.stringify(runResults), JSON.stringify(assistance), elapsedSeconds(session, Date.now(), timed)]);
    if (phase === 'timed') await client.query("UPDATE practice_sessions SET timed_finished_at=now(),timed_outcome='submitted',updated_at=now() WHERE id=$1", [id]);
    await client.query('COMMIT');
    send(res, { id: attemptId });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
app.post('/api/sessions/:id/timer', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { action } = z.object({ action: z.enum(['pause', 'resume']) }).parse(req.body);
  await expireIfNeeded(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = (await client.query<Row>('SELECT * FROM practice_sessions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!session) { await client.query('ROLLBACK'); notFound(res); return; }
    const attempt = (await client.query("SELECT id FROM attempts WHERE session_id=$1 AND kind='timed'", [id])).rows[0];
    if (session.phase !== 'timed' || attempt || session.timed_finished_at || (!session.paused_at && new Date(session.deadline_at).getTime() <= Date.now())) {
      await client.query('ROLLBACK'); conflict(res, 'Timed session is closed.'); return;
    }
    if (action === 'pause' && !session.paused_at) {
      await client.query('UPDATE practice_sessions SET paused_at=now(),updated_at=now() WHERE id=$1', [id]);
    } else if (action === 'resume' && session.paused_at) {
      await client.query(`UPDATE practice_sessions SET deadline_at=deadline_at+(now()-paused_at),
        paused_ms=paused_ms+FLOOR(EXTRACT(EPOCH FROM (now()-paused_at))*1000)::bigint,
        paused_at=NULL,updated_at=now() WHERE id=$1`, [id]);
    }
    await client.query('COMMIT');
    send(res, await getSession(id));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
app.post('/api/sessions/:id/continue', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await expireIfNeeded(id);
  const row = (await pool.query<Row>(`UPDATE practice_sessions s SET phase='continuation',continuation_code=COALESCE(continuation_code,draft_code),continuation_started_at=COALESCE(continuation_started_at,now()),updated_at=now()
    WHERE id=$1 AND (timed_finished_at IS NOT NULL OR EXISTS(SELECT 1 FROM attempts a WHERE a.session_id=s.id AND a.kind='timed')) RETURNING id`, [id])).rows[0];
  if (!row) { conflict(res, 'Complete or expire the timed session first.'); return; }
  send(res, await getSession(id));
});
app.get('/api/sessions/:id/reference', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const session = await getSession(id);
  if (!session) {
    const completedInterview = (await pool.query<Row>(`SELECT e.challenge_snapshot FROM interview_sessions i
      JOIN interview_completions c ON c.interview_id=i.id
      JOIN interview_exercises e USING(interview_id,position)
      WHERE i.id=$1 AND i.status='completed' ORDER BY c.submitted_at DESC LIMIT 1`, [id])).rows[0];
    if (!completedInterview) { notFound(res); return; }
    send(res, { code: (completedInterview.challenge_snapshot as Challenge).referenceCode }); return;
  }
  if (!session.attempts.some((a: Row) => a.kind === 'timed' && a.outcome === 'submitted') && !session.timed_finished_at) { conflict(res, 'Reference solution unlocks after the timed session.'); return; }
  const row = (await pool.query<Row>('SELECT challenge_snapshot FROM practice_sessions WHERE id=$1', [id])).rows[0];
  send(res, { code: (row.challenge_snapshot as Challenge).referenceCode });
});
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API endpoint not found' }); });
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const webRoot = resolve('dist');
  if (!existsSync(resolve(webRoot, 'index.html'))) throw new Error('Build the app first with npm run build.');
  app.use(express.static(webRoot));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(resolve(webRoot, 'index.html')));
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) { res.status(400).json({ error: 'Invalid request', issues: error.issues }); return; }
  console.error(error);
  res.status(500).json({ error: 'Database or server error. Your change was not saved.' });
});

export default app;
if (!process.env.VERCEL) {
  await initializeDatabase();
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log(`Interview Gym API listening on http://${host}:${port}`));
}
