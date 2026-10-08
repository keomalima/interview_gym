import { describe, expect, it } from 'vitest';
import { appRouteUrl, parseAppRoute } from '../src/shared/routing';

describe('URL based page state', () => {
  it('round trips a direct exercise link', () => {
    const url = appRouteUrl({ view: 'practice', challengeId: 'safe-deep-get' });
    expect(parseAppRoute(new URL(url, 'http://localhost'))).toEqual({ view: 'practice', challengeId: 'safe-deep-get' });
  });

  it('round trips an interview and selected exercise', () => {
    const url = appRouteUrl({ view: 'interview', interviewId: 'interview-123', position: 2 });
    expect(parseAppRoute(new URL(url, 'http://localhost'))).toEqual({ view: 'interview', interviewId: 'interview-123', position: 2 });
  });

  it('keeps History as its own URL state', () => {
    expect(parseAppRoute(new URL(appRouteUrl({ view: 'history' }), 'http://localhost'))).toEqual({ view: 'history' });
  });
});
