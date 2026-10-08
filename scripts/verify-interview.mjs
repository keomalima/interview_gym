import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = 'http://127.0.0.1:3001/api';
const fixtures = [];
async function request(path, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const before = await request('/interviews', 'POST', {});
  fixtures.push(before.id);
  assert.equal(before.status, 'setup');
  assert.equal(before.duration_minutes, 60);
  assert.equal(before.deadline_at, null, 'setup must not start the clock');
  assert.equal(before.exercises.length, 3);
  assert.equal(before.exercises[0].challenge.category, 'algorithms');
  assert(before.exercises[1].challenge.topics.some(topic => ['closures','state','objects','iteration','parsing','strings','recursion'].includes(topic)));
  assert.equal(before.exercises[2].challenge.category, 'practical');

  const newPlaylist = await request('/interviews', 'POST', {});
  fixtures.push(newPlaylist.id);
  assert.equal(newPlaylist.exercises.length, 3);
  assert.equal(new Set(newPlaylist.exercises.map(item => item.challenge_id)).size, 3);
  assert.equal(newPlaylist.exercises.some(item => before.exercises.some(previous => previous.challenge_id === item.challenge_id)), false, 'new interview prefers exercises not used by the previous playlist when the catalog allows');

  const restored = await request(`/interviews/${before.id}`);
  assert.equal(restored.id, before.id);
  assert.deepEqual(restored.exercises.map(item => item.challenge_id), before.exercises.map(item => item.challenge_id));
  const started = await request(`/interviews/${before.id}/start`, 'POST', {});
  assert.equal(started.status, 'active');
  assert(Math.abs(new Date(started.deadline_at).getTime() - Date.now() - 60 * 60 * 1000) < 5000);

  const first = started.exercises[0];
  const editedCode = `${first.draft_code}\n// persisted interview draft`;
  await request(`/interviews/${before.id}/exercises/0/open`, 'POST', {});
  await request(`/interviews/${before.id}/exercises/0/draft`, 'PATCH', { code: editedCode });
  const failedResult = first.challenge.tests.map((test, index) => ({ name: test.name, status: index === 0 ? 'failed' : 'passed' }));
  await request(`/interviews/${before.id}/exercises/0/run`, 'POST', { code: editedCode, results: failedResult });
  const failedReload = await request(`/interviews/${before.id}`);
  assert.equal(failedReload.exercises[0].summary.completed, false);
  await request(`/interviews/${before.id}/exercises/0/submit`, 'POST', { code: editedCode }, 422);
  const result = first.challenge.tests.map(test => ({ name: test.name, status: 'passed' }));
  await request(`/interviews/${before.id}/exercises/0/run`, 'POST', { code: editedCode, results: result });
  const beforeSubmit = await request(`/interviews/${before.id}`);
  assert.equal(beforeSubmit.exercises[0].summary.completed, false, 'a passing test run alone is not a completion');
  await request(`/interviews/${before.id}/exercises/0/submit`, 'POST', { code: editedCode });
  await request(`/interviews/${before.id}/exercises/0/submit`, 'POST', { code: editedCode });
  const afterReload = await request(`/interviews/${before.id}`);
  assert.equal(afterReload.exercises[0].draft_code, editedCode);
  assert.deepEqual(afterReload.exercises[0].results, result);
  assert.equal(afterReload.exercises[0].summary.completed, true);
  assert((await request(`/attempts?challengeId=${encodeURIComponent(first.challenge_id)}`)).some(item => item.session_id === before.id));
  await request(`/interviews/${before.id}/exercises/0/reference`, 'GET', undefined, 409);

  await request(`/interviews/${before.id}/exercises/1/open`, 'POST', {});
  const switchedBack = await request(`/interviews/${before.id}`);
  assert.equal(switchedBack.exercises[0].draft_code, editedCode);
  await request(`/interviews/${before.id}/finish`, 'POST', {});
  const recap = await request(`/interviews/${before.id}`);
  assert.equal(recap.status, 'completed');
  assert((await request(`/interviews/${before.id}/exercises/0/reference`)).code.length > 0);
  assert((await request('/interviews/history')).some(item => item.id === before.id));

  const expiring = await request('/interviews', 'POST', {});
  fixtures.push(expiring.id);
  await request(`/interviews/${expiring.id}/start`, 'POST', {});
  await db.query("UPDATE interview_sessions SET deadline_at=now()-interval '1 second' WHERE id=$1", [expiring.id]);
  assert.equal((await request(`/interviews/${expiring.id}`)).status, 'completed', 'expired interview finalizes on reload');
  console.log('Interview verified: diverse playlist, idle timer, persisted drafts/results, no completion on run/failure, successful-only idempotent submissions, exercise switching, history, and expiry.');
} finally {
  if (fixtures.length) await db.query('DELETE FROM interview_sessions WHERE id=ANY($1::uuid[])', [fixtures]);
  await db.end();
}
