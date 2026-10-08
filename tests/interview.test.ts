import { describe, expect, it } from 'vitest';
import { allTestsPassed, interviewExpired, selectInterviewExercises, summarizeInterviewExercise, type InterviewCandidate } from '../src/shared/interview';

const challenge = (id: string, category: string, topics: string[], skills: string[], extra: Partial<InterviewCandidate> = {}): InterviewCandidate => ({
  id, title: id, category, difficulty: 'easy', topics, skills, targetRoles: ['general', 'fullstack'], exerciseType: 'function', durationMinutes: 20, ...extra,
});
describe('interview selection and lifecycle', () => {
  it('chooses one algorithm, fundamentals, and practical exercise, skipping unsupported types', () => {
    const catalog = [
      challenge('js', 'practical', ['closures'], ['fundamentals']),
      challenge('arrays', 'algorithms', ['arrays'], ['problem-solving']),
      challenge('async', 'practical', ['promises'], ['async']),
      challenge('react', 'practical', ['react'], ['components'], { exerciseType: 'react' }),
      challenge('old', 'algorithms', ['arrays'], ['problem-solving']),
    ];
    const result = selectInterviewExercises(catalog);
    expect(result.exercises.map(item => item.id)).not.toContain('react');
    expect(result.exercises).toHaveLength(3);
    expect(result.exercises.filter(item => item.category === 'algorithms')).toHaveLength(1);
    expect(result.exercises.filter(item => item.topics.includes('closures'))).toHaveLength(1);
    expect(result.exercises.filter(item => item.category === 'practical' && !item.topics.includes('closures'))).toHaveLength(1);
  });

  it('fills a small catalog with repeated supported exercises', () => {
    const result = selectInterviewExercises([challenge('one', 'practical', ['closures'], ['coding'])], [], [], () => 0);
    expect(result.exercises.map(item => item.id)).toEqual(['one', 'one', 'one']);
    expect(result.explanation).toContain('repeats');
  });

  it('prefers exercises outside the immediately preceding playlist and unfinished exercises', () => {
    const catalog = [
      challenge('algo-old', 'algorithms', ['arrays'], ['problem-solving']),
      challenge('algo-new', 'algorithms', ['trees'], ['problem-solving']),
      challenge('js-old', 'practical', ['closures'], ['fundamentals']),
      challenge('js-new', 'practical', ['objects'], ['fundamentals']),
      challenge('practical-old', 'practical', ['business-logic'], ['coding']),
      challenge('practical-new', 'practical', ['promises'], ['async']),
    ];
    const result = selectInterviewExercises(catalog, ['algo-old', 'js-old', 'practical-old'], ['algo-new', 'js-new', 'practical-new'], () => 0);
    expect(result.exercises.map(item => item.id)).toEqual(['algo-new', 'js-new', 'practical-new']);
    const next = selectInterviewExercises(catalog, result.exercises.map(item => item.id), [], () => 0);
    expect(next.exercises.map(item => item.id)).toEqual(['algo-old', 'js-old', 'practical-old']);
  });

  it('chooses an unfinished exercise over a completed alternative in the same group', () => {
    const catalog = [
      challenge('algo-done', 'algorithms', ['arrays'], ['problem-solving']),
      challenge('algo-open', 'algorithms', ['trees'], ['problem-solving']),
      challenge('js-done', 'practical', ['closures'], ['fundamentals']),
      challenge('js-open', 'practical', ['objects'], ['fundamentals']),
      challenge('practical-done', 'practical', ['business-logic'], ['coding']),
      challenge('practical-open', 'practical', ['queues'], ['data-processing']),
    ];
    const result = selectInterviewExercises(catalog, [], ['algo-done', 'js-done', 'practical-done'], () => 0);
    expect(result.exercises.map(item => item.id)).toEqual(['algo-open', 'js-open', 'practical-open']);
  });

  it('counts completion only when each named test passes', () => {
    const tests = [{ name: 'a' }, { name: 'b' }];
    expect(allTestsPassed(tests, [{ name: 'a', status: 'passed' }, { name: 'b', status: 'passed' }])).toBe(true);
    expect(allTestsPassed(tests, [{ name: 'a', status: 'passed' }, { name: 'b', status: 'failed' }])).toBe(false);
    expect(allTestsPassed(tests, [{ name: 'b', status: 'passed' }])).toBe(false);
  });

  it('starts its deadline only after start and expires at the deadline', () => {
    const deadline = '2026-10-08T10:00:00Z';
    expect(interviewExpired('setup', deadline, Date.parse('2026-10-08T10:01:00Z'))).toBe(false);
    expect(interviewExpired('active', deadline, Date.parse('2026-10-08T09:59:59Z'))).toBe(false);
    expect(interviewExpired('active', deadline, Date.parse(deadline))).toBe(true);
  });

  it('summarizes incomplete and completed test results', () => {
    const tests = [{ name: 'a' }, { name: 'b' }];
    expect(summarizeInterviewExercise({ tests, results: null })).toMatchObject({ attempted: false, completed: false, passed: 0, total: 2 });
    expect(summarizeInterviewExercise({ tests, results: [{ name: 'a', status: 'passed' }, { name: 'b', status: 'passed' }] })).toMatchObject({ attempted: true, completed: false, passed: 2, total: 2 });
    expect(summarizeInterviewExercise({ tests, results: [{ name: 'a', status: 'passed' }, { name: 'b', status: 'passed' }], completed: true })).toMatchObject({ completed: true });
  });
});
