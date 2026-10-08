export type AppRoute = {
  view: 'practice' | 'interview' | 'history';
  challengeId?: string;
  interviewId?: string;
  position?: number;
};

export function parseAppRoute(location: Pick<Location, 'search'>): AppRoute {
  const query = new URLSearchParams(location.search);
  const view = query.get('view');
  if (view === 'history') return { view };
  if (view === 'interview') {
    const rawPosition = Number(query.get('exercise') ?? 0);
    return { view, interviewId: query.get('interview') ?? undefined, position: Number.isInteger(rawPosition) && rawPosition >= 0 ? rawPosition : 0 };
  }
  return { view: 'practice', challengeId: query.get('exercise') ?? undefined };
}

export function appRouteUrl(route: AppRoute): string {
  const query = new URLSearchParams();
  query.set('view', route.view);
  if (route.challengeId) query.set('exercise', route.challengeId);
  if (route.interviewId) query.set('interview', route.interviewId);
  if (route.view === 'interview' && route.position) query.set('exercise', String(route.position));
  return `/?${query.toString()}`;
}
