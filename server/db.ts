import 'dotenv/config';
import pg from 'pg';
import { notionExercises } from '../src/shared/notion-exercises.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run npm run db:local or configure .env.');

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });

let initialization: Promise<void> | undefined;
export function initializeDatabase(): Promise<void> {
  return initialization ??= migrate().catch(error => { initialization = undefined; throw error; });
}

async function migrate() {
  const client = await pool.connect();
  try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73461982)');
  await client.query(`
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
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id uuid PRIMARY KEY,
      target_role text NOT NULL CHECK (target_role IN ('frontend','backend','fullstack','general')),
      difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','mixed')),
      duration_minutes integer NOT NULL CHECK (duration_minutes IN (30,60,90)),
      prefer_unseen boolean NOT NULL DEFAULT false,
      status text NOT NULL CHECK (status IN ('setup','active','completed')) DEFAULT 'setup',
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      deadline_at timestamptz,
      finished_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS interview_exercises (
      interview_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      challenge_id text NOT NULL REFERENCES challenges(id),
      challenge_snapshot jsonb NOT NULL,
      draft_code text NOT NULL,
      results jsonb,
      hints_used integer[] NOT NULL DEFAULT '{}',
      active_since timestamptz,
      time_spent_seconds integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(interview_id,position),
      UNIQUE(interview_id,challenge_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_timed_attempt ON attempts(session_id) WHERE kind='timed';
    ALTER TABLE interview_exercises DROP CONSTRAINT IF EXISTS interview_exercises_interview_id_challenge_id_key;
  `);
  await client.query(`
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS paused_at timestamptz;
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS paused_ms bigint NOT NULL DEFAULT 0;
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS continuation_started_at timestamptz;
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS timed_finished_at timestamptz;
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS timed_outcome text;
    CREATE TABLE IF NOT EXISTS interview_completions (
      interview_id uuid NOT NULL,
      position integer NOT NULL,
      challenge_id text NOT NULL REFERENCES challenges(id),
      code text NOT NULL,
      results jsonb NOT NULL,
      hints_used integer[] NOT NULL DEFAULT '{}',
      elapsed_seconds integer NOT NULL DEFAULT 0,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(interview_id,position),
      FOREIGN KEY(interview_id,position) REFERENCES interview_exercises(interview_id,position) ON DELETE CASCADE
    );
    ALTER TABLE interview_completions ADD COLUMN IF NOT EXISTS elapsed_seconds integer NOT NULL DEFAULT 0;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS elapsed_seconds integer;
    UPDATE attempts a SET elapsed_seconds=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (a.submitted_at-s.started_at)) - s.paused_ms/1000.0))
      FROM practice_sessions s WHERE s.id=a.session_id AND a.elapsed_seconds IS NULL;
  `);
  await client.query(`INSERT INTO notion_exercises(id,title,source_url,platform,topics,notes,content)
    SELECT id,title,"sourceUrl",platform,topics,notes,content
    FROM jsonb_to_recordset($1::jsonb) AS x(id text,title text,"sourceUrl" text,platform text,topics jsonb,notes text,content text)
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,source_url=EXCLUDED.source_url,platform=EXCLUDED.platform,
      topics=EXCLUDED.topics,notes=EXCLUDED.notes,content=EXCLUDED.content,updated_at=now()`, [JSON.stringify(notionExercises)]);
  await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
