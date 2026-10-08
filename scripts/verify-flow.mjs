import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = 'http://127.0.0.1:3001/api';
const fixtures = [];
async function request(path, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  if (path === '/sessions' && method === 'POST' && response.ok) fixtures.push(data.id);
  return data;
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const challengeId = 'token-usage';
  const challenge = (await request('/challenges')).find(item => item.id === challengeId);
  assert(challenge && !('referenceCode' in challenge));
  const session = await request('/sessions', 'POST', { challengeId, notes: 'Planning before starting' });
  assert.equal(session.challenge_id, challengeId);
  assert.equal(session.notes, 'Planning before starting', 'pre-session notes carry into the new session');
  assert(!('referenceCode' in session.challenge));

  const restart = await request('/sessions', 'POST', { challengeId });
  const preservedCode = `${restart.draft_code}\n// keep this code across timer restart`;
  await request(`/sessions/${restart.id}/draft`, 'PATCH', { phase: 'timed', code: preservedCode, revision: 0 });
  const restarted = await request(`/sessions/${restart.id}/restart`, 'POST', {});
  fixtures.push(restarted.id);
  assert.notEqual(restarted.id, restart.id);
  assert.equal(restarted.draft_code, preservedCode);
  assert(Math.abs(new Date(restarted.deadline_at).getTime() - Date.now() - restart.challenge.durationMinutes * 60000) < 5000);
  assert.equal((await request(`/sessions/${restart.id}`)).attempts.length, 0, 'restarting does not create an attempt');

  const timedCode = `export function calculateTokenCosts() { return { totalCents: 777, byModel: [] }; }`;
  const save = await request(`/sessions/${session.id}/draft`, 'PATCH', { phase: 'timed', code: timedCode, revision: 0 });
  assert.equal(save.revision, 1);
  await request(`/sessions/${session.id}/draft`, 'PATCH', { phase: 'timed', code: 'stale', revision: 0 }, 409);
  const notes = await request(`/sessions/${session.id}/notes`, 'PATCH', { notes: 'Check fractional cents', revision: 0 });
  assert.equal(notes.revision, 1);
  await request(`/sessions/${session.id}/hints/0`, 'POST');
  const failedResults = challenge.tests.map((test, index) => ({ name: test.name, status: index === 0 ? 'failed' : 'passed' }));
  const failedRun = await request(`/sessions/${session.id}/runs`, 'POST', { phase: 'timed', code: timedCode, results: failedResults });
  await request(`/sessions/${session.id}/submit`, 'POST', { phase: 'timed', code: timedCode, runId: failedRun.id }, 422);
  assert.equal((await request(`/sessions/${session.id}`)).attempts.length, 0, 'failed tests do not create attempts');
  const successfulCode = timedCode.replace('777', '61');
  await request(`/sessions/${session.id}/draft`, 'PATCH', { phase: 'timed', code: successfulCode, revision: 1 });
  const results = challenge.tests.map(test => ({ name: test.name, status: 'passed' }));
  const run = await request(`/sessions/${session.id}/runs`, 'POST', { phase: 'timed', code: successfulCode, results });
  await request(`/sessions/${session.id}/submit`, 'POST', { phase: 'timed', code: successfulCode, runId: run.id });
  await request(`/sessions/${session.id}/submit`, 'POST', { phase: 'timed', code: successfulCode, runId: run.id }, 409);
  const afterTimed = await request(`/sessions/${session.id}`);
  assert.equal(afterTimed.attempts.length, 1);
  assert.equal(afterTimed.attempts[0].code, successfulCode);
  assert.deepEqual(afterTimed.attempts[0].results, results);
  assert.deepEqual(afterTimed.attempts[0].assistance_used, [0]);
  assert.equal(afterTimed.notes, 'Check fractional cents');
  assert.equal((await request(`/sessions/${session.id}/reference`)).code.length > 0, true);

  const continued = await request(`/sessions/${session.id}/continue`, 'POST');
  assert.equal(continued.phase, 'continuation');
  const continuationCode = successfulCode;
  await request(`/sessions/${session.id}/draft`, 'PATCH', { phase: 'continuation', code: continuationCode, revision: 0 });
  const successResults = challenge.tests.map(test => ({ name: test.name, status: 'passed' }));
  const laterRun = await request(`/sessions/${session.id}/runs`, 'POST', { phase: 'continuation', code: continuationCode, results: successResults });
  await request(`/sessions/${session.id}/submit`, 'POST', { phase: 'continuation', code: continuationCode, runId: laterRun.id });
  const final = await request(`/sessions/${session.id}`);
  assert.equal(final.attempts.length, 2);
  assert.equal(final.attempts[0].code, successfulCode);
  assert.equal(final.attempts[0].code, continuationCode);
  const dbRows = (await db.query('SELECT kind,code,results,assistance_used FROM attempts WHERE session_id=$1 ORDER BY submitted_at', [session.id])).rows;
  assert.equal(dbRows.length, 2);
  assert.equal(dbRows[0].kind, 'timed');
  assert.equal(dbRows[0].code, successfulCode);
  assert.deepEqual(dbRows[0].results, results);
  assert.deepEqual(dbRows[0].assistance_used, [0]);
  assert.equal(dbRows[1].kind, 'continuation');
  assert.equal(dbRows[1].code, continuationCode);
  assert((await request('/history')).some(item => item.id === session.id && item.attempt_count === 2));

  const summary = (await request('/history')).find(item => item.id === session.id);
  assert.equal(summary.success, true);
  assert.equal(summary.completed_at, final.attempts[0].submitted_at);
  assert.equal(summary.elapsed_seconds, final.attempts[0].elapsed_seconds);
  assert.equal((await request(`/sessions/${session.id}`)).attempts[0].elapsed_seconds, afterTimed.attempts[0].elapsed_seconds);

  const pausedSession = await request('/sessions', 'POST', { challengeId });
  const paused = await request(`/sessions/${pausedSession.id}/timer`, 'POST', { action: 'pause' });
  assert(paused.paused_at);
  // Simulate a minute away without sleeping or changing any existing user session.
  await db.query("UPDATE practice_sessions SET started_at=started_at-interval '120 seconds', paused_at=paused_at-interval '60 seconds' WHERE id=$1", [pausedSession.id]);
  const stillPaused = await request(`/sessions/${pausedSession.id}`);
  assert(stillPaused.paused_at);
  assert.equal(stillPaused.attempts.length, 0);
  await request(`/sessions/${pausedSession.id}/runs`, 'POST', { phase: 'timed', code: pausedSession.draft_code, results: successResults }, 409);
  const pausedAgain = await request(`/sessions/${pausedSession.id}/timer`, 'POST', { action: 'pause' });
  assert.equal(pausedAgain.paused_at, stillPaused.paused_at);
  const resumed = await request(`/sessions/${pausedSession.id}/timer`, 'POST', { action: 'resume' });
  assert.equal(resumed.paused_at, null);
  assert(Number(resumed.paused_ms) >= 60000);
  assert(new Date(resumed.deadline_at).getTime() - new Date(pausedSession.deadline_at).getTime() >= 60000);
  const resumedAgain = await request(`/sessions/${pausedSession.id}/timer`, 'POST', { action: 'resume' });
  assert.equal(resumedAgain.deadline_at, resumed.deadline_at);
  const pausedRun = await request(`/sessions/${pausedSession.id}/runs`, 'POST', { phase: 'timed', code: resumed.draft_code, results: successResults });
  await request(`/sessions/${pausedSession.id}/submit`, 'POST', { phase: 'timed', code: resumed.draft_code, runId: pausedRun.id });
  // The simulated pause is excluded from recorded practice duration.
  const pauseFinished = await request(`/sessions/${pausedSession.id}`);
  assert(pauseFinished.attempts[0].elapsed_seconds >= 60 && pauseFinished.attempts[0].elapsed_seconds < 65);
  await request(`/sessions/${pausedSession.id}/timer`, 'POST', { action: 'pause' }, 409);
  await request(`/sessions/${pausedSession.id}/draft`, 'PATCH', { phase: 'timed', code: 'overwrite', revision: 0 }, 409);
  await request(`/sessions/${session.id}/runs`, 'POST', { phase: 'continuation', code: continuationCode, results: [{ name: 'invented check', status: 'passed' }] }, 400);
  const incomplete = await request('/sessions', 'POST', { challengeId });
  const partial = await request(`/sessions/${incomplete.id}/runs`, 'POST', { phase: 'timed', code: incomplete.draft_code, results: successResults.slice(0, 1) });
  await request(`/sessions/${incomplete.id}/submit`, 'POST', { phase: 'timed', code: incomplete.draft_code, runId: partial.id }, 422);
  assert.equal((await request(`/sessions/${incomplete.id}`)).attempts.length, 0);
  assert.equal((await request('/history')).find(item => item.id === incomplete.id).success, false);

  const pausePastDeadline = await request('/sessions', 'POST', { challengeId });
  await request(`/sessions/${pausePastDeadline.id}/timer`, 'POST', { action: 'pause' });
  await db.query("UPDATE practice_sessions SET paused_at=now()-interval '60 seconds', deadline_at=now()-interval '30 seconds' WHERE id=$1", [pausePastDeadline.id]);
  const protectedPause = await request(`/sessions/${pausePastDeadline.id}`);
  assert.equal(protectedPause.expired, false);
  assert.equal(protectedPause.attempts.length, 0);
  assert(!(await request('/history')).find(item => item.id === pausePastDeadline.id).completed_at);
  const protectedResume = await request(`/sessions/${pausePastDeadline.id}/timer`, 'POST', { action: 'resume' });
  assert.equal(protectedResume.expired, false);
  assert(new Date(protectedResume.deadline_at).getTime() > Date.now());

  const expiry = await request('/sessions', 'POST', { challengeId: 'usage-billing' });
  await db.query("UPDATE practice_sessions SET deadline_at=now()-interval '1 second' WHERE id=$1", [expiry.id]);
  const expired = await request(`/sessions/${expiry.id}`);
  assert.equal(expired.attempts.length, 0);
  assert.equal(expired.timed_outcome, 'expired');
  assert.equal(expired.timed_finished_at !== null, true);
  await request(`/sessions/${expiry.id}/submit`, 'POST', { phase: 'timed', code: expiry.draft_code, runId: run.id }, 409);
  console.log('Flow verified: pause/resume persistence and idempotency, pause duration excluded, complete-suite success history, invalid checks rejected, PostgreSQL persistence, stale-save rejection, hint/notes, successful-only immutable attempts, history, reference, and expiry without attempts.');
} finally {
  if (fixtures.length) await db.query('DELETE FROM practice_sessions WHERE id=ANY($1::uuid[])', [fixtures]);
  await db.end();
}
