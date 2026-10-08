import type { Challenge } from './challenges.js';

export type InterviewCandidate = Pick<Challenge, 'id' | 'title' | 'category' | 'difficulty' | 'topics' | 'skills' | 'targetRoles' | 'exerciseType' | 'durationMinutes'>;
export type SelectionResult = { exercises: InterviewCandidate[]; explanation: string | null };

const fundamentalsTopics = new Set(['closures', 'state', 'objects', 'iteration', 'parsing', 'strings', 'recursion']);
export function selectInterviewExercises(
  catalog: InterviewCandidate[],
  previousIds: string[] = [],
  completedIds: string[] = [],
  random: () => number = Math.random,
): SelectionResult {
  const candidates = catalog.filter(item => item.exerciseType === 'function');
  const previous = new Set(previousIds);
  const completed = new Set(completedIds);
  const selected: InterviewCandidate[] = [];
  const pick = (predicate: (item: InterviewCandidate) => boolean) => {
    const pool = candidates.filter(item => predicate(item) && !selected.some(chosen => chosen.id === item.id));
    if (!pool.length) return;
    const preferred = pool.filter(item => !previous.has(item.id) && !completed.has(item.id));
    const fresh = pool.filter(item => !previous.has(item.id));
    const unfinished = pool.filter(item => !completed.has(item.id));
    const tier = preferred.length ? preferred : fresh.length ? fresh : unfinished.length ? unfinished : pool;
    selected.push(tier[Math.floor(random() * tier.length)]);
  };
  pick(item => item.category === 'algorithms');
  pick(item => item.topics.some(topic => fundamentalsTopics.has(topic)) && item.category !== 'algorithms');
  pick(item => item.category === 'practical' && !item.topics.some(topic => fundamentalsTopics.has(topic)));
  while (selected.length < 3 && candidates.length) {
    const remaining = candidates.filter(item => !selected.some(chosen => chosen.id === item.id));
    if (!remaining.length) {
      const pool = candidates.filter(item => !previous.has(item.id));
      selected.push((pool.length ? pool : candidates)[Math.floor(random() * (pool.length || candidates.length))]);
    } else {
      const preferred = remaining.filter(item => !previous.has(item.id) && !completed.has(item.id));
      const tier = preferred.length ? preferred : remaining.filter(item => !previous.has(item.id));
      const finalTier = tier.length ? tier : remaining;
      selected.push(finalTier[Math.floor(random() * finalTier.length)]);
    }
  }
  const explanation = selected.length < 3
    ? 'The catalog has fewer than three supported exercises, so this playlist contains all available exercises.'
    : new Set(selected.map(item => item.id)).size < 3
      ? 'The catalog has fewer than three distinct supported exercises, so this playlist repeats an exercise.'
      : null;
  return { exercises: selected, explanation };
}

export function interviewExpired(status: string, deadlineAt: string | Date, now = Date.now()): boolean {
  return status === 'active' && new Date(deadlineAt).getTime() <= now;
}

export type InterviewTestSummary = { name: string; status: 'passed' | 'failed' | 'error' | 'timeout' };
export function allTestsPassed(tests: { name: string }[], results: InterviewTestSummary[] | null | undefined): boolean {
  return !!results && tests.length > 0 && results.length === tests.length &&
    results.every((result, index) => result.name === tests[index].name && result.status === 'passed');
}
export function summarizeInterviewExercise(exercise: { tests: { name: string }[]; results: InterviewTestSummary[] | null; completed?: boolean }) {
  const results = exercise.results ?? [];
  const passed = results.filter(result => result.status === 'passed').length;
  return { attempted: results.length > 0, completed: exercise.completed ?? false, passed, total: exercise.tests.length, failed: results.length - passed };
}
