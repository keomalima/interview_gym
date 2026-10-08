import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { Maximize2, Minimize2, Moon, Sun, PanelLeftClose, PanelLeftOpen, Pause, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, Code2, FileCode2, History, Lightbulb, Play, RefreshCw, Sparkles, Square, X, Timer, ChevronUp } from 'lucide-react';
import type { Challenge } from './shared/challenges';
import { createCodeRun, createTestRun, type ConsoleEntry, type TestResult } from './runner';
import InterviewMode from './InterviewMode';
import { appRouteUrl, parseAppRoute, type AppRoute } from './shared/routing';

type PublicChallenge = Omit<Challenge, 'referenceCode'>;
type Attempt = { id: string; kind: 'timed' | 'continuation'; outcome: 'submitted' | 'expired'; code: string; results: TestResult[] | null; assistance_used: number[]; submitted_at: string; elapsed_seconds: number; session_id?: string; challenge?: PublicChallenge };
type Run = { id: string; phase: 'timed' | 'continuation'; code: string; results: TestResult[]; created_at: string };
type Session = { id: string; challenge_id: string; challenge: PublicChallenge; phase: 'timed' | 'continuation'; started_at: string; continuation_started_at: string | null; paused_ms: number | string; deadline_at: string; paused_at: string | null; draft_code: string; draft_revision: number; continuation_code: string | null; continuation_revision: number; notes: string; notes_revision: number; timed_finished_at?: string | null; timed_outcome?: string | null; attempts: Attempt[]; runs: Run[]; assistance: { hint_index: number }[]; expired: boolean };
type HistoryItem = { id: string; challenge_id: string; title: string; started_at: string; attempt_count: number; timed_outcome: string | null; completed_at: string | null; elapsed_seconds: number | null; success: boolean; outcome: string | null };
type InterviewHistoryItem = { id: string; target_role: string; difficulty: string; duration_minutes: number; finished_at: string; elapsed_seconds: number; exercises: { challenge_id: string; challenge: PublicChallenge; results: TestResult[] | null; hints_used: number[]; time_spent_seconds: number }[] };
const historyStatus = (item: HistoryItem) => item.success ? 'Succeeded' : item.outcome === 'expired' ? 'Time expired' : item.completed_at ? 'Needs practice' : 'In progress';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  let data: any;
  try { data = await response.json(); } catch { throw new Error(`The server returned ${response.status}.`); }
  if (response.status === 401) window.dispatchEvent(new Event('auth-required'));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

const editorLanguages = { javascript: [javascript()], typescript: [javascript({ typescript: true })] };
const languageName = (value: 'javascript' | 'typescript') => value === 'javascript' ? 'JavaScript' : 'TypeScript';
const formatTime = (seconds: number) => `${Math.floor(Math.max(seconds, 0) / 60).toString().padStart(2, '0')}:${(Math.max(seconds, 0) % 60).toString().padStart(2, '0')}`;
const compactOutput = (value?: string) => {
  if (value === undefined) return 'Run tests to see your output.';
  try { return JSON.stringify(JSON.parse(value)); } catch { return value; }
};
const dateTime = (value: string) => new Date(value).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const preSessionNotesKey = (challengeId: string) => `interviewGym:practiceNotes:${challengeId}`;
const requirementIsConstraint = (value: string) => /\b(at most|at least|no more than|up to|between \d|inputs? contain|input size|time complexity|space complexity|aim for O\(|O\([a-z0-9^]+\)|time limit|characters? long|values? between)\b/i.test(value);
const divideRequirements = (requirements: string[]) => ({ rules: requirements.filter(item => !requirementIsConstraint(item)), constraints: requirements.filter(requirementIsConstraint) });

export function App({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  const [challenges, setChallenges] = useState<PublicChallenge[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<PublicChallenge | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<string[]>([]);
  const [exerciseAttempts, setExerciseAttempts] = useState<Attempt[]>([]);
  const [interviewHistory, setInterviewHistory] = useState<InterviewHistoryItem[]>([]);
  const [openInterviewId, setOpenInterviewId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [now, setNow] = useState(Date.now());
  const [sidebar, setSidebar] = useState<'practice' | 'history' | 'interview'>('practice');
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location));
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'success' | 'all'>('success');
  const [briefTab, setBriefTab] = useState<'brief' | 'notes' | 'attempts'>('brief');
  const [outputTab, setOutputTab] = useState<'tests' | 'console'>('tests');
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [runMessage, setRunMessage] = useState('');
  const [navHidden, setNavHidden] = useState(true);
  const [briefHidden, setBriefHidden] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('interviewGym:theme') === 'light' ? 'light' : 'dark');
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);
  const [outputCollapsed, setOutputCollapsed] = useState(true);
  const [outputHeight, setOutputHeight] = useState(() => Number(localStorage.getItem('interviewGym:outputHeight')) || 220);
  const codeRef = useRef(code);
  const notesRef = useRef(notes);
  const savedCodeRef = useRef('');
  const savedNotesRef = useRef('');
  const revisionRef = useRef(0);
  const notesRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const notesPromiseRef = useRef<Promise<void> | null>(null);
  const runRef = useRef<ReturnType<typeof createTestRun> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const runSequenceRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const expireRefreshRef = useRef<string | null>(null);
  const beginOutputResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = outputHeight;
    const onMove = (moveEvent: PointerEvent) => setOutputHeight(Math.min(Math.max(startHeight + startY - moveEvent.clientY, 110), Math.floor(window.innerHeight * 0.65)));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };
  useEffect(() => { localStorage.setItem('interviewGym:outputHeight', String(outputHeight)); }, [outputHeight]);

  const navigate = useCallback((next: AppRoute, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', appRouteUrl(next));
    setRoute(next);
  }, []);
  const navigateInterview = useCallback((id: string, position: number) => navigate({ view: 'interview', interviewId: id, position }), [navigate]);
  useEffect(() => {
    const onPopState = () => setRoute(parseAppRoute(window.location));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadHistory = useCallback(async () => {
    const [items, progress] = await Promise.all([api<HistoryItem[]>('/history'), api<string[]>('/progress')]);
    setHistory(items); setCompletedChallengeIds(progress);
  }, []);
  const loadSession = useCallback(async (id: string) => {
    const next = await api<Session>(`/sessions/${id}`);
    runSequenceRef.current++;
    runRef.current?.stop();
    sessionRef.current = next;
    setSession(next);
    setSelectedChallenge(next.challenge);
    const nextCode = next.phase === 'timed' ? next.draft_code : next.continuation_code ?? next.draft_code;
    codeRef.current = nextCode; savedCodeRef.current = nextCode; setCode(nextCode);
    notesRef.current = next.notes; savedNotesRef.current = next.notes; setNotes(next.notes);
    revisionRef.current = next.phase === 'timed' ? next.draft_revision : next.continuation_revision;
    notesRevisionRef.current = next.notes_revision;
    setResults(next.runs.find(run => run.phase === next.phase && run.code === nextCode)?.results ?? []);
    setOutputTab('tests'); setExpandedTest(0); setOutputCollapsed(true); setReference(null); setSelectedAttempt(null); setError(''); setRunning(false); setConsoleEntries([]); setRunMessage(''); setNow(Date.now());
    localStorage.setItem('interviewGym:lastSession', id);
    return next;
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const [items, previous, interviews, progress] = await Promise.all([api<PublicChallenge[]>('/challenges'), api<HistoryItem[]>('/history'), api<InterviewHistoryItem[]>('/interviews/history'), api<string[]>('/progress')]);
        if (canceled) return;
        setChallenges(items); setHistory(previous); setInterviewHistory(interviews); setCompletedChallengeIds(progress);
        setCatalogLoaded(true);
      } catch (failure) { if (!canceled) setError((failure as Error).message); }
    })();
    return () => { canceled = true; };
  }, [loadHistory, loadSession]);

  useEffect(() => {
    if (!catalogLoaded) return;
    if (route.view === 'history') { setSidebar('history'); return; }
    if (route.view === 'interview') { setSidebar('interview'); setOpenInterviewId(route.interviewId ?? null); return; }
    setSidebar('practice');
    const target = route.challengeId ? challenges.find(item => item.id === route.challengeId) : undefined;
    const stored = localStorage.getItem('interviewGym:lastSession');
    const active = route.challengeId
      ? history.find(item => item.challenge_id === route.challengeId && !item.completed_at)
      : stored ? history.find(item => item.id === stored && !item.completed_at) ?? history.find(item => !item.completed_at) : history.find(item => !item.completed_at);
    if (active) { if (sessionRef.current?.id !== active.id) void loadSession(active.id); }
    else if (target ?? challenges[0]) {
      const next = target ?? challenges[0];
      if (selectedChallenge?.id !== next.id || sessionRef.current) {
        runSequenceRef.current++; runRef.current?.stop(); sessionRef.current = null; setSession(null); setSelectedChallenge(next);
        codeRef.current = ''; savedCodeRef.current = ''; setCode('');
        const savedNotes = localStorage.getItem(preSessionNotesKey(next.id)) ?? '';
        notesRef.current = savedNotes; savedNotesRef.current = savedNotes; setNotes(savedNotes);
        setResults([]); setSelectedAttempt(null); setReference(null);
      }
    }
  }, [catalogLoaded, route, challenges, history, loadSession]);

  const challenge = session?.challenge ?? selectedChallenge;
  useEffect(() => {
    let canceled = false;
    if (!challenge) { setExerciseAttempts([]); return; }
    api<Attempt[]>(`/attempts?challengeId=${encodeURIComponent(challenge.id)}`).then(items => { if (!canceled) setExerciseAttempts(items); }).catch(failure => { if (!canceled) setError((failure as Error).message); });
    return () => { canceled = true; };
  }, [challenge?.id]);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('interviewGym:theme', theme); }, [theme]);
  useEffect(() => () => { runRef.current?.stop(); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const timedAttempt = session?.attempts.find(attempt => attempt.kind === 'timed');
  const secondsElapsed = session ? session.phase === 'continuation'
    ? Math.max(0, Math.floor((now - new Date(session.continuation_started_at ?? now).getTime()) / 1000))
    : timedAttempt?.elapsed_seconds ?? Math.max(0, Math.floor(((session.timed_finished_at ? new Date(session.timed_finished_at).getTime() : now) - new Date(session.started_at).getTime() - Number(session.paused_ms) - (session.paused_at ? now - new Date(session.paused_at).getTime() : 0)) / 1000))
    : 0;
  const secondsLeft = session ? Math.max(0, Math.ceil((new Date(session.deadline_at).getTime() - (session.paused_at ? new Date(session.paused_at).getTime() : now)) / 1000)) : 0;
  const timedOpen = !!session && session.phase === 'timed' && !timedAttempt && !session.timed_finished_at && secondsLeft > 0;
  useEffect(() => {
    if (!session || session.paused_at || session.phase !== 'timed' || secondsLeft > 0 || timedAttempt || expireRefreshRef.current === session.id) return;
    expireRefreshRef.current = session.id;
    loadSession(session.id).then(loadHistory).catch(failure => setError((failure as Error).message));
  }, [session, secondsLeft, timedAttempt, loadSession, loadHistory]);

  const saveCode = useCallback(async () => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const current = sessionRef.current;
    if (!current) return;
    const task = (async () => {
      while (codeRef.current !== savedCodeRef.current) {
        const value = codeRef.current;
        setSaving(true);
        const response = await api<{ revision: number }>(`/sessions/${current.id}/draft`, { method: 'PATCH', body: JSON.stringify({ phase: current.phase, code: value, revision: revisionRef.current }) });
        revisionRef.current = response.revision;
        savedCodeRef.current = value;
      }
    })();
    savePromiseRef.current = task;
    try { await task; } finally { savePromiseRef.current = null; setSaving(false); }
  }, []);

  const saveNotes = useCallback(async () => {
    if (notesPromiseRef.current) return notesPromiseRef.current;
    const current = sessionRef.current;
    if (!current || notesRef.current === savedNotesRef.current) return;
    const task = (async () => {
      while (notesRef.current !== savedNotesRef.current) {
        const value = notesRef.current;
        const response = await api<{ revision: number }>(`/sessions/${current.id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes: value, revision: notesRevisionRef.current }) });
        notesRevisionRef.current = response.revision; savedNotesRef.current = value;
      }
    })();
    notesPromiseRef.current = task;
    try { await task; } finally { notesPromiseRef.current = null; }
  }, []);

  useEffect(() => {
    if (!session || code === savedCodeRef.current) return;
    const timer = window.setTimeout(() => saveCode().catch(failure => setError((failure as Error).message)), 700);
    return () => clearTimeout(timer);
  }, [code, session, saveCode]);
  useEffect(() => {
    if (!session || notes === savedNotesRef.current) return;
    const timer = window.setTimeout(() => saveNotes().catch(failure => setError((failure as Error).message)), 700);
    return () => clearTimeout(timer);
  }, [notes, session, saveNotes]);
  useEffect(() => {
    if (challenge && !session) localStorage.setItem(preSessionNotesKey(challenge.id), notes);
  }, [challenge?.id, session?.id, notes]);

  const startChallenge = async (challengeId: string) => {
    setBusy(true);
    try {
      await saveCode(); await saveNotes();
      const created = await api<Session>('/sessions', { method: 'POST', body: JSON.stringify({ challengeId, notes: notesRef.current }) });
      await loadSession(created.id); localStorage.removeItem(preSessionNotesKey(challengeId)); await loadHistory(); setSidebar('practice'); setBriefTab('brief'); navigate({ view: 'practice', challengeId });
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const chooseChallenge = async (challengeId: string) => {
    if (sessionRef.current) { await saveCode(); await saveNotes(); }
    const existing = history.find(item => item.challenge_id === challengeId && !item.completed_at);
    if (existing) await loadSession(existing.id);
    else {
      const next = challenges.find(item => item.id === challengeId);
      if (!next) return;
      runSequenceRef.current++; runRef.current?.stop(); sessionRef.current = null; setSession(null); setSelectedChallenge(next);
      const savedNotes = localStorage.getItem(preSessionNotesKey(next.id)) ?? '';
      notesRef.current = savedNotes; savedNotesRef.current = savedNotes; setNotes(savedNotes);
      setSelectedAttempt(null); setReference(null); setBriefTab('brief'); setOutputCollapsed(true); setResults([]); setError('');
    }
    setSidebar('practice'); navigate({ view: 'practice', challengeId });
  };
  const stopRun = () => { stopRequestedRef.current = true; runRef.current?.stop(); };
  const runTests = async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current || running || busy || current.paused_at) return null;
    const sequence = ++runSequenceRef.current;
    stopRequestedRef.current = false;
    setError(''); setRunning(true); setSelectedAttempt(null); setConsoleEntries([]); setRunMessage('Running tests…'); setOutputTab('tests'); setOutputCollapsed(false);
    try {
      await saveCode();
      if (stopRequestedRef.current || sequence !== runSequenceRef.current) throw new Error('Run stopped.');
      const exactCode = codeRef.current;
      const run = createTestRun(exactCode, current.challenge.functionName, current.challenge.tests, entry => setConsoleEntries(previous => [...previous, entry]));
      runRef.current = run;
      const outcome = await run.promise;
      if (sequence !== runSequenceRef.current) return null;
      setResults(outcome); setRunMessage('Test run complete.');
      const saved = await api<{ id: string }>(`/sessions/${current.id}/runs`, { method: 'POST', body: JSON.stringify({ phase: current.phase, code: exactCode, results: outcome }) });
      return sequence === runSequenceRef.current ? saved.id : null;
    } catch (failure) { if (sequence === runSequenceRef.current) { setError((failure as Error).message); setRunMessage((failure as Error).message); } return null; }
    finally { if (sequence === runSequenceRef.current) { runRef.current = null; setRunning(false); } }
  };
  const runCode = async () => {
    if (!session || running || busy || session.paused_at) return;
    const sequence = ++runSequenceRef.current;
    stopRequestedRef.current = false;
    setRunning(true); setError(''); setConsoleEntries([]); setRunMessage('Running…'); setOutputTab('console'); setOutputCollapsed(false);
    try {
      await saveCode();
      if (stopRequestedRef.current || sequence !== runSequenceRef.current) throw new Error('Run stopped.');
      const run = createCodeRun(codeRef.current, entry => setConsoleEntries(previous => [...previous, entry]));
      runRef.current = run;
      const outcome = await run.promise;
      if (sequence !== runSequenceRef.current) return;
      const result = outcome[0];
      setRunMessage(result.status === 'passed' ? 'Run complete.' : result.actual ?? 'Run failed.');
    } catch (failure) { if (sequence === runSequenceRef.current) setRunMessage((failure as Error).message); }
    finally { if (sequence === runSequenceRef.current) { runRef.current = null; setRunning(false); } }
  };
  const togglePause = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await saveCode(); await saveNotes();
      await api(`/sessions/${session.id}/timer`, { method: 'POST', body: JSON.stringify({ action: session.paused_at ? 'resume' : 'pause' }) });
      await loadSession(session.id);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const restartExercise = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await saveCode(); await saveNotes();
      const next = await api<Session>(`/sessions/${session.id}/restart`, { method: 'POST' });
      await loadSession(next.id); await loadHistory(); setBriefTab('brief'); setSelectedAttempt(null);
      navigate({ view: 'practice', challengeId: next.challenge_id });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    const current = sessionRef.current;
    if (!current || running || busy || submitting) return;
    setSubmitting(true);
    try {
      await saveNotes();
      const runId = await runTests();
      if (!runId) return;
      await api(`/sessions/${current.id}/submit`, { method: 'POST', body: JSON.stringify({ phase: current.phase, code: codeRef.current, runId }) });
      await loadSession(current.id); await loadHistory();
    } catch (failure) { await loadSession(current.id).catch(() => {}); setError((failure as Error).message); }
    finally { setSubmitting(false); }
  };
  const continuePractice = async () => {
    if (!session) return;
    setBusy(true);
    try { await saveNotes(); await api(`/sessions/${session.id}/continue`, { method: 'POST' }); await loadSession(session.id); await loadHistory(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const requestHint = async () => {
    if (!session) return;
    const next = session.assistance.length;
    setBusy(true);
    try {
      await saveCode(); await saveNotes();
      await api(`/sessions/${session.id}/hints/${next}`, { method: 'POST' });
      await loadSession(session.id);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const showReference = async () => {
    const id = selectedAttempt?.session_id ?? session?.id;
    if (!id) return;
    try {
      const interviewPosition = selectedAttempt?.id.match(/^([0-9a-f-]+):(\d+)$/i);
      const path = interviewPosition
        ? `/interviews/${interviewPosition[1]}/exercises/${interviewPosition[2]}/reference`
        : `/sessions/${id}/reference`;
      const answer = await api<{ code: string }>(path); setReference(answer.code);
    }
    catch (failure) { setError((failure as Error).message); }
  };
  const formatCode = async () => {
    if (!session || showingReadOnly || interactionLocked || session.paused_at) return;
    setBusy(true);
    try {
      const [prettier, plugin, estree] = await Promise.all([
        import('prettier/standalone'),
        session.challenge.language === 'javascript' ? import('prettier/plugins/babel') : import('prettier/plugins/typescript'),
        import('prettier/plugins/estree'),
      ]);
      const formatted = await prettier.format(codeRef.current, {
        parser: session.challenge.language === 'javascript' ? 'babel' : 'typescript',
        plugins: [plugin, estree], singleQuote: true, semi: true, tabWidth: 2,
      });
      codeRef.current = formatted; setCode(formatted); setResults([]); setError('');
    } catch (failure) { setError(`Formatting failed: ${(failure as Error).message}`); }
    finally { setBusy(false); }
  };
  const openHistory = async (id: string) => { setBusy(true); try { await saveCode(); await saveNotes(); await loadSession(id); setSidebar('history'); navigate({ view: 'history' }); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } };
  const displayChallenge = selectedAttempt?.challenge ?? challenge;
  const visibleResults = selectedAttempt ? selectedAttempt.results ?? [] : results;
  const passed = visibleResults.filter(result => result.status === 'passed').length;
  const activeCode = selectedAttempt?.code ?? reference ?? code;
  const showingReadOnly = !!selectedAttempt || reference !== null;
  const canRun = !!session && (session.phase === 'continuation' || timedOpen) && !session.paused_at && !running && !busy && !submitting && !showingReadOnly;
  useEffect(() => {
    const retry = () => { Promise.all([saveCode(), saveNotes()]).then(() => setError('')).catch(failure => setError((failure as Error).message)); };
    window.addEventListener('auth-restored', retry);
    return () => window.removeEventListener('auth-restored', retry);
  }, [saveCode, saveNotes]);
  const signOut = async () => {
    setBusy(true);
    try { await saveCode(); await saveNotes(); await onSignOut?.(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const interactionLocked = running || busy || submitting;
  const activeChallenge = selectedAttempt?.challenge ?? challenge;
  const title = sidebar === 'interview' ? 'Interview Mode' : activeChallenge?.title ?? 'Practice';

  return <div className={`app-shell ${navHidden || focusMode ? 'nav-hidden' : ''} ${focusMode ? 'focus-mode' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-braces">{'{ }'}</span><span>Interview Gym</span></div>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${sidebar === 'practice' ? 'active' : ''}`} onClick={() => navigate({ view: 'practice', challengeId: challenge?.id })}><Code2 size={19}/>Practice</button>
        <button className={`nav-item ${sidebar === 'interview' ? 'active' : ''}`} onClick={() => navigate({ view: 'interview', interviewId: openInterviewId ?? localStorage.getItem('interviewGym:lastInterview') ?? undefined })}><Timer size={19}/>Interview Mode</button>
        <button className={`nav-item ${sidebar === 'history' ? 'active' : ''}`} onClick={() => navigate({ view: 'history' })}><History size={19}/>History</button>
      </nav>
      <div className="sidebar-rule"/>
      <div className="sidebar-section-title">Exercises</div>
      <div className="challenge-list">{Array.from(new Set(challenges.map(item => item.category))).sort().map(category => { const items = challenges.filter(item => item.category === category); return <details className="category-group" open key={category}><summary>{category.replace(/\b\w/g, letter => letter.toUpperCase())}<span>{items.length}</span><ChevronDown size={14}/></summary><div>{items.map(item => <button key={item.id} disabled={interactionLocked} className={`challenge-link ${(activeChallenge?.id === item.id && sidebar === 'practice') ? 'selected' : ''}`} onClick={() => chooseChallenge(item.id)}>{completedChallengeIds.includes(item.id) ? <CheckCircle2 size={16}/> : <Circle size={16}/>}<span>{item.title}</span></button>)}</div></details>; })}</div>
      <div className="sidebar-foot">Personal workspace</div>
    </aside>
    <main className={`main-area ${sidebar === 'interview' ? 'interview-view' : ''} ${sidebar === 'history' ? 'history-view' : ''}`}>
      <div className="workspace-toolbar">
        <button className="tool-button" onClick={() => { setFocusMode(false); setNavHidden(!navHidden); }} aria-label={navHidden || focusMode ? 'Show navigation' : 'Hide navigation'}>{navHidden || focusMode ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}Exercises</button>
        <div className="toolbar-right">{session && sidebar === 'practice' && <div className="layout-controls"><button className="tool-button compact-tool" onClick={() => { setFocusMode(false); setBriefHidden(!briefHidden); }} title={briefHidden || focusMode ? 'Show brief' : 'Hide brief'} aria-label={briefHidden || focusMode ? 'Show brief' : 'Hide brief'}>{briefHidden || focusMode ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button><button className="tool-button compact-tool" onClick={() => setFocusMode(!focusMode)} title={focusMode ? 'Restore layout' : 'Expand editor'} aria-label={focusMode ? 'Restore layout' : 'Expand editor'}>{focusMode ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></div>}{onSignOut && <button className="tool-button" disabled={interactionLocked} onClick={signOut}>Sign out</button>}<button className="tool-button theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>} <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button></div>
      </div>
      <header className="topbar">
        <div className="heading-wrap"><div className="breadcrumb">{sidebar === 'interview' ? 'Interview Mode' : sidebar === 'history' ? 'History / Practice' : `Practice / ${activeChallenge?.category === 'algorithms' ? 'Algorithms' : 'Practical'}`}</div><h1>{title}</h1>{sidebar !== 'interview' && activeChallenge && <div className="tags"><span className="tag teal">{languageName(activeChallenge.language)}</span><span className="tag teal">{activeChallenge.category === 'algorithms' ? 'Algorithms' : 'Practical'}</span><span className="tag"><Clock3 size={14}/>{activeChallenge.durationMinutes} min</span></div>}</div>
        <div className="top-actions">{sidebar !== 'interview' && <><div className={`timer ${secondsLeft <= 60 && timedOpen ? 'urgent' : ''}`} title={session?.paused_at ? 'Timer paused' : !session ? 'Timer idle' : session.phase === 'continuation' ? 'Continuation time' : 'Time remaining'}><strong>{timedOpen ? formatTime(secondsLeft) : formatTime(secondsElapsed)}</strong></div>{timedOpen && <button className="tool-button timer-button" title={session?.paused_at ? 'Resume timer' : 'Pause timer'} aria-label={session?.paused_at ? 'Resume timer' : 'Pause timer'} onClick={togglePause} disabled={interactionLocked}>{session?.paused_at ? <Play size={15}/> : <Pause size={15}/>}</button>}{session && <button className="tool-button timer-button" title="Restart timer" aria-label="Restart timer" disabled={interactionLocked} onClick={restartExercise}><RefreshCw size={15}/></button>}</>}</div>
      </header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      {sidebar === 'history' && <><section className="history-panel panel"><div className="results-heading"><h2>Practice history</h2><span>Success requires all checks to pass</span></div><div className="panel-tabs"><button className={historyFilter === 'success' ? 'active' : ''} onClick={() => setHistoryFilter('success')}>Succeeded</button><button className={historyFilter === 'all' ? 'active' : ''} onClick={() => setHistoryFilter('all')}>All sessions</button></div><div className="history-table"><table><thead><tr><th>Exercise</th><th>Result</th><th>Date & time</th><th>Time taken</th></tr></thead><tbody>{history.filter(item => historyFilter === 'all' || item.success).map(item => <tr key={item.id} className={session?.id === item.id ? 'current' : ''}><td><button className="text-button" disabled={interactionLocked} onClick={() => openHistory(item.id)}>{item.title}</button></td><td><span className={item.success ? 'success-text' : ''}>{historyStatus(item)}</span></td><td>{dateTime(item.completed_at ?? item.started_at)}</td><td>{item.elapsed_seconds === null ? '—' : formatTime(item.elapsed_seconds)}</td></tr>)}{!history.some(item => historyFilter === 'all' || item.success) && <tr><td colSpan={4}>Your completed exercises will appear here after you submit a solution that passes every check.</td></tr>}</tbody></table></div></section><section className="history-panel panel"><div className="results-heading"><h2>Completed interviews</h2><span>{interviewHistory.length} saved</span></div><div className="history-table"><table><thead><tr><th>Interview</th><th>Exercises</th><th>Score</th><th>Date</th><th>Duration</th></tr></thead><tbody>{interviewHistory.map(item => { const passedTests = item.exercises.reduce((n, exercise) => n + (exercise.results ?? []).filter(result => result.status === 'passed').length, 0); const totalTests = item.exercises.reduce((n, exercise) => n + exercise.challenge.tests.length, 0); return <tr key={item.id}><td><button className="text-button" onClick={() => { setOpenInterviewId(item.id); navigate({ view: 'interview', interviewId: item.id }); }}>{item.target_role} · {item.duration_minutes} min</button></td><td>{item.exercises.length}</td><td>{totalTests ? `${Math.round(passedTests / totalTests * 100)}%` : '—'}</td><td>{dateTime(item.finished_at)}</td><td>{formatTime(item.elapsed_seconds)}</td></tr>; })}{!interviewHistory.length && <tr><td colSpan={5}>Completed interviews will appear here.</td></tr>}</tbody></table></div></section></>}
      {sidebar === 'interview' && <InterviewMode initialInterviewId={openInterviewId} initialPosition={route.position ?? 0} onNavigate={navigateInterview} onBack={() => navigate({ view: 'practice', challengeId: challenge?.id })} onFinished={async () => { setInterviewHistory(await api<InterviewHistoryItem[]>('/interviews/history')); setCompletedChallengeIds(await api<string[]>('/progress')); }}/>}
      {challenge && sidebar === 'practice' ? <>
        <div className={`workspace-grid ${briefHidden || focusMode ? 'brief-hidden' : ''}`}>
          <section className="brief-panel panel">
            <div className="panel-tabs"><button className={briefTab === 'brief' ? 'active' : ''} onClick={() => setBriefTab('brief')}>Brief</button><button className={briefTab === 'notes' ? 'active' : ''} onClick={() => setBriefTab('notes')}>Notes</button><button className={briefTab === 'attempts' ? 'active' : ''} onClick={() => setBriefTab('attempts')}>Attempts{exerciseAttempts.length ? ` (${exerciseAttempts.length})` : ''}</button></div>
            {briefTab === 'brief' ? <><div className="brief-body"><section className="instruction-section"><h2>Task</h2><p className="summary">{challenge.summary}</p></section><section className="instruction-section"><h2>Input / Output</h2><p>Implement <code>{challenge.functionName}</code>. The runner passes each test input as positional arguments and checks the returned value against the expected output.</p><pre className="signature-code">{`${challenge.functionName}(...input) → output`}</pre></section><section className="instruction-section"><h2>Examples</h2><div className="examples">{challenge.examples.map(example => <details key={example.label} open><summary>{example.label}<ChevronDown size={15}/></summary><div className="example-block"><div className="example-input"><strong>Input</strong><code>{JSON.stringify(example.input)}</code></div><div className="example-input"><strong>Output</strong><code>{JSON.stringify(example.output)}</code></div></div></details>)}</div></section>{(() => { const { rules, constraints } = divideRequirements(challenge.requirements); return <>{!!rules.length && <section className="instruction-section"><h2>Rules and edge cases</h2><ul className="requirements">{rules.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></section>}{!!constraints.length && <section className="instruction-section"><h2>Constraints</h2><ul className="requirements">{constraints.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></section>}</>; })()}</div><div className="brief-footer">{session ? <><button className="hint-button" onClick={requestHint} disabled={interactionLocked || session.assistance.length >= challenge.hints.length}><Lightbulb size={16}/> Hint</button><span>{session.assistance.length} hints used</span></> : <><button className="submit-button" onClick={() => startChallenge(challenge.id)} disabled={busy}>Start Exercise</button><span>Timer stays idle until you start.</span></>}</div>{session && !!session.assistance.length && <div className="hint-list">{session.assistance.map(item => <div key={item.hint_index}><strong>Hint {item.hint_index + 1}</strong><p>{challenge.hints[item.hint_index]}</p></div>)}</div>}</> : briefTab === 'notes' ? <div className="notes-body"><label htmlFor="notes">Your notes</label><textarea id="notes" placeholder="Assumptions, edge cases, and questions…" value={notes} onChange={event => { notesRef.current = event.target.value; setNotes(event.target.value); }}/><small>{session ? 'Notes save to this session.' : 'Notes save on this device and move into the session when you start.'}</small></div> : <div className="attempts-content">{exerciseAttempts.length ? <><div className="attempt-list">{exerciseAttempts.map(attempt => { const tests = attempt.challenge?.tests ?? challenge.tests; const succeeded = attempt.outcome === 'submitted' && attempt.results?.length === tests.length && attempt.results.every(result => result.status === 'passed'); return <button disabled={interactionLocked} key={attempt.id} className={selectedAttempt?.id === attempt.id ? 'selected' : ''} onClick={() => { setReference(null); setSelectedAttempt(attempt); setOutputTab('tests'); setOutputCollapsed(false); setBriefTab('attempts'); setExpandedTest(Math.max(0, (attempt.results ?? []).findIndex(result => result.status !== 'passed'))); }}><span><strong>{attempt.kind === 'timed' ? 'Timed attempt' : 'Continuation attempt'}</strong><small>{dateTime(attempt.submitted_at)} · {formatTime(attempt.elapsed_seconds)} · {attempt.assistance_used.length} hints · {attempt.session_id ? 'Earlier session' : 'Session'}</small></span><span>{attempt.outcome === 'expired' ? 'Time expired' : succeeded ? 'Completed' : 'Not completed'} · {(attempt.results ?? []).filter(result => result.status === 'passed').length}/{tests.length} tests</span><ChevronRight size={17}/></button>; })}</div><div className="attempt-actions"><button disabled={interactionLocked} className="text-button" onClick={() => { setSelectedAttempt(null); setReference(null); setOutputCollapsed(true); }}>Back to current draft</button>{(selectedAttempt?.outcome === 'submitted' || session?.attempts.some(attempt => attempt.kind === 'timed')) && <button disabled={interactionLocked} className="text-button" onClick={showReference}>View reference solution</button>}</div></> : <p className="attempts-empty">No attempts for this exercise yet. Your submissions and timed snapshots will appear here.</p>}</div>}
          </section>
          {session || selectedAttempt ? <div className="coding-column" style={{ '--output-height': `${outputHeight}px` } as CSSProperties}>
            <section className="editor-panel panel"><div className="editor-tabs"><span className="editor-tab active"><FileCode2 size={17}/> solution.{challenge.language === 'javascript' ? 'js' : 'ts'}</span><button className="format-button" onClick={formatCode} disabled={showingReadOnly || interactionLocked || !!session?.paused_at}><Sparkles size={14}/> Prettier</button><span className="editor-help">Run your own calls · Test all cases</span></div><div className="editor-frame"><CodeMirror key={`${session?.id ?? 'attempt'}:${session?.phase ?? ''}:${selectedAttempt?.id ?? (reference !== null ? 'reference' : 'draft')}`} value={activeCode} height="100%" theme={theme} extensions={editorLanguages[challenge.language]} onChange={value => { if (!showingReadOnly) { codeRef.current = value; setCode(value); setResults([]); } }} editable={!showingReadOnly && !!session && !session.paused_at && !interactionLocked && (timedOpen || session.phase === 'continuation')} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true }} aria-label={`${languageName(challenge.language)} code editor`}/></div><div className="editor-status"><span>{showingReadOnly ? selectedAttempt ? 'Saved snapshot · read only' : 'Reference solution · read only' : saving ? 'Saving…' : code === savedCodeRef.current ? 'All changes saved' : 'Unsaved changes'}</span><span>{languageName(challenge.language)}</span></div></section>
            {!outputCollapsed && <div className="output-resize-handle" role="separator" aria-label="Resize tests and console panel" aria-orientation="horizontal" onPointerDown={beginOutputResize} title="Drag to resize output panel"/>}<section className={`output-panel panel ${outputCollapsed ? 'collapsed' : ''}`}>
              <div className="output-panel-heading"><div className="panel-tabs output-tabs"><button className={outputTab === 'tests' ? 'active' : ''} onClick={() => setOutputTab('tests')}>Tests{visibleResults.length ? ` (${passed}/${challenge.tests.length})` : ''}</button><button className={outputTab === 'console' ? 'active' : ''} onClick={() => setOutputTab('console')}>Console{consoleEntries.length ? ` (${consoleEntries.length})` : ''}</button>{outputTab === 'console' && !outputCollapsed && <button className="clear-console" disabled={running} onClick={() => { setConsoleEntries([]); setRunMessage(''); }}>Clear console</button>}</div><button className="collapse-output" onClick={() => setOutputCollapsed(!outputCollapsed)} aria-expanded={!outputCollapsed}>{outputCollapsed ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}<span>{outputCollapsed ? 'Expand' : 'Collapse'}</span></button></div>
              {outputCollapsed ? <div className="collapsed-summary">{visibleResults.length ? <><span className={passed === challenge.tests.length ? 'success-text' : 'failure-text'}>{passed === challenge.tests.length ? 'All tests passed' : `${challenge.tests.length - passed} tests need attention`}</span><span>{passed}/{challenge.tests.length} passed</span></> : <span>No test results yet</span>}</div> : outputTab === 'console' ? <div className="console-body" role="log" aria-label="Console output"><p className="run-message">{runMessage || 'Add console.log(...) and your own function calls, then select Run. For async calls, use top-level await.'}</p>{consoleEntries.map((entry, index) => <div className={`console-entry ${entry.level}`} key={index}><span>{entry.caseName === 'Run' ? entry.level : entry.caseName}</span><pre>{entry.text}</pre></div>)}</div> : <div className="testcase-view"><div className="case-tabs" role="tablist" aria-label="Test cases">{challenge.tests.map((test, index) => { const result = visibleResults[index]; return <button role="tab" aria-selected={(expandedTest ?? 0) === index} className={(expandedTest ?? 0) === index ? 'selected' : ''} key={test.name} title={test.name} onClick={() => setExpandedTest(index)}><span className={`case-status ${result?.status ?? 'pending'}`}>{result?.status === 'passed' ? <Check size={13}/> : result ? <X size={13}/> : <Circle size={12}/>}</span>Case {index + 1}</button>; })}</div>{challenge.tests[expandedTest ?? 0] && (() => { const index = expandedTest ?? 0; const test = challenge.tests[index]; const result = visibleResults[index]; const logs = selectedAttempt || reference !== null ? [] : consoleEntries.filter(entry => entry.caseName === test.name); return <div className="case-content" role="tabpanel"><div className="case-title"><strong>{test.name}</strong><span>{result ? `${result.status} · ${result.durationMs ?? 0} ms` : 'Awaiting run'}</span></div><div className="case-field"><strong>Input</strong><pre>{JSON.stringify(test.input)}</pre></div><div className="case-field"><strong>Expected output</strong><pre>{'error' in test ? `Error containing “${test.error}”` : JSON.stringify(test.expected)}</pre></div><div className="case-field"><strong>Your output</strong><pre>{compactOutput(result?.actual)}</pre></div><div className="case-field"><strong>stdout</strong><pre>{logs.length ? logs.map(entry => entry.text).join('\n') : 'No console output for this case.'}</pre></div></div>; })()}</div>}
            </section>
          </div> : <section className="preview-editor panel"><Code2 size={24}/><h2>Ready when you are</h2><p>Start the exercise to open the editor and begin your timed session.</p><button className="submit-button" onClick={() => startChallenge(challenge.id)} disabled={busy}>Start Exercise</button></section>}
        </div>
        {session && <footer className="bottom-bar"><div className="save-indicator">{saving ? <RefreshCw size={17} className="spin"/> : <CheckCircle2 size={17}/>}<span>{saving ? 'Saving draft…' : code === savedCodeRef.current ? 'All changes saved' : 'Changes pending'}</span></div><div className="bottom-actions">{running ? <button className="run-button" onClick={stopRun}><Square size={16}/> Stop</button> : <><button className="run-button" onClick={runCode} disabled={!canRun}><Play size={16}/> Run</button><button className="run-button" onClick={runTests} disabled={!canRun}><CheckCircle2 size={16}/> Run tests</button></>}{session.phase === 'continuation' || timedOpen ? <button className="submit-button" onClick={submit} disabled={!canRun}>{session.phase === 'continuation' ? 'Save continuation' : 'Submit'}</button> : session.phase === 'timed' && (timedAttempt || session.timed_finished_at) ? <button className="submit-button" onClick={continuePractice} disabled={interactionLocked}>Continue practice</button> : null}</div></footer>}
      </> : sidebar === 'interview' || sidebar === 'history' ? null : <div className="loading-state">{error ? 'The workspace could not start. Check the database and API server.' : 'Loading your practice workspace…'}</div>}
    </main>
  </div>;
}
