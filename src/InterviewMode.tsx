import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, Lightbulb, Play, Square } from 'lucide-react';
import type { Challenge } from './shared/challenges';
import { createTestRun, type ConsoleEntry, type TestResult } from './runner';

type PublicChallenge = Omit<Challenge, 'referenceCode'>;
type InterviewExercise = { position: number; challenge_id: string; challenge: PublicChallenge; draft_code: string; results: TestResult[] | null; hints_used: number[]; time_spent_seconds: number; summary: { attempted: boolean; completed: boolean; passed: number; total: number; failed: number } };
type Interview = { id: string; duration_minutes: number; status: 'setup' | 'active' | 'completed'; started_at: string | null; finished_at: string | null; deadline_at: string | null; elapsed_seconds: number; seconds_left: number; exercises: InterviewExercise[]; selection_explanation?: string | null };
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method?.toUpperCase();
  const response = await fetch(`/api${path}`, { ...options, ...(method === 'POST' && options?.body === undefined ? { body: '{}' } : {}), headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
const fmt = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const languageExtensions = { javascript: [javascript()], typescript: [javascript({ typescript: true })] };

export default function InterviewMode({ initialInterviewId, initialPosition = 0, onNavigate, onBack, onFinished }: { initialInterviewId?: string | null; initialPosition?: number; onNavigate: (id: string, position: number) => void; onBack: () => void; onFinished: () => void }) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [position, setPosition] = useState(0);
  const [code, setCode] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [hintText, setHintText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outputCollapsed, setOutputCollapsed] = useState(true);
  const [outputTab, setOutputTab] = useState<'tests' | 'console'>('tests');
  const [outputHeight, setOutputHeight] = useState(() => Number(localStorage.getItem('interviewGym:interviewOutputHeight')) || 220);
  const [referenceSolutions, setReferenceSolutions] = useState<Record<number, string>>({});
  const [now, setNow] = useState(Date.now());
  const runRef = useRef<ReturnType<typeof createTestRun> | null>(null);
  const codeRef = useRef('');
  const saveTimer = useRef<number | null>(null);
  const createInFlight = useRef(false);
  const exercise = interview?.exercises[position];
  const beginOutputResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = outputHeight;
    const onMove = (moveEvent: PointerEvent) => setOutputHeight(Math.min(Math.max(startHeight + startY - moveEvent.clientY, 110), Math.floor(window.innerHeight * 0.65)));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };
  useEffect(() => { localStorage.setItem('interviewGym:interviewOutputHeight', String(outputHeight)); }, [outputHeight]);
  const accept = useCallback((next: Interview, nextPosition = 0) => {
    const index = Math.min(nextPosition, Math.max(0, next.exercises.length - 1));
    setInterview(next); setPosition(index);
    const selected = next.exercises[index];
    if (selected) { codeRef.current = selected.draft_code; setCode(selected.draft_code); setResults(selected.results ?? []); setHintText(''); }
  }, []);
  const refresh = useCallback(async (id: string, selected = position) => { const next = await api<Interview>(`/interviews/${id}`); accept(next, selected); return next; }, [accept, position]);
  const createInterview = useCallback(async () => {
    if (createInFlight.current) return;
    createInFlight.current = true;
    setBusy(true); setError('');
    try {
      const next = await api<Interview>('/interviews', { method: 'POST', body: JSON.stringify({}) });
      localStorage.setItem('interviewGym:lastInterview', next.id); accept(next, 0); onNavigate(next.id, 0);
    } catch (failure) { setError((failure as Error).message); }
    finally { createInFlight.current = false; setBusy(false); }
  }, [accept, onNavigate]);
  useEffect(() => {
    let canceled = false;
    const id = initialInterviewId || localStorage.getItem('interviewGym:lastInterview');
    if (id) api<Interview>(`/interviews/${id}`).then(value => { if (!canceled) accept(value, initialPosition); }).catch(() => { localStorage.removeItem('interviewGym:lastInterview'); if (!canceled) void createInterview(); });
    else void createInterview();
    return () => { canceled = true; };
  }, [initialInterviewId, initialPosition, accept, createInterview]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => () => { runRef.current?.stop(); if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    if (interview?.status !== 'active' || !interview.deadline_at || now < new Date(interview.deadline_at).getTime()) return;
    refresh(interview.id).then(next => { if (next.status === 'completed') onFinished(); }).catch(failure => setError(failure.message));
  }, [interview?.status, interview?.deadline_at, interview?.id, now, refresh, onFinished]);
  const saveDraft = async (text = codeRef.current, p = position, int = interview) => {
    if (!int || int.status !== 'active') return;
    await api(`/interviews/${int.id}/exercises/${p}/draft`, { method: 'PATCH', body: JSON.stringify({ code: text }) });
  };
  useEffect(() => {
    if (!interview || interview.status !== 'active' || !exercise || code === exercise.draft_code) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDraft(code).catch(failure => setError(failure.message)), 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [code, interview?.id, interview?.status, position]);
  const start = async () => {
    if (!interview) return; setBusy(true); setError('');
    try { const next = await api<Interview>(`/interviews/${interview.id}/start`, { method: 'POST' }); await api<Interview>(`/interviews/${next.id}/exercises/0/open`, { method: 'POST' }).then(value => accept(value, 0)); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const move = async (nextPosition: number) => {
    if (!interview || nextPosition < 0 || nextPosition >= interview.exercises.length || nextPosition === position) return;
    setBusy(true); try { await saveDraft(codeRef.current); const next = await api<Interview>(`/interviews/${interview.id}/exercises/${nextPosition}/open`, { method: 'POST' }); accept(next, nextPosition); onNavigate(interview.id, nextPosition); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const runTests = async () => {
    if (!interview || !exercise || interview.status !== 'active' || busy) return;
    setBusy(true); setError(''); setConsoleEntries([]);
    try {
      await saveDraft(codeRef.current);
      const runner = createTestRun(codeRef.current, exercise.challenge.functionName, exercise.challenge.tests, entry => setConsoleEntries(prev => [...prev, entry])); runRef.current = runner;
      const outcome = await runner.promise;
      setResults(outcome); setOutputCollapsed(false);
      await api(`/interviews/${interview.id}/exercises/${position}/run`, { method: 'POST', body: JSON.stringify({ code: codeRef.current, results: outcome }) });
      await refresh(interview.id, position);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); runRef.current = null; }
  };
  const submitExercise = async () => {
    if (!interview || !exercise || interview.status !== 'active' || busy) return;
    setBusy(true); setError('');
    try {
      await saveDraft(codeRef.current);
      const response = await api<{ completed: boolean }>(`/interviews/${interview.id}/exercises/${position}/submit`, { method: 'POST', body: JSON.stringify({ code: codeRef.current }) });
      if (response.completed) { await refresh(interview.id, position); await onFinished(); }
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const useHint = async () => {
    if (!interview || !exercise || interview.status !== 'active') return;
    setBusy(true); try { const data = await api<{ hint: string }>(`/interviews/${interview.id}/exercises/${position}/hints`, { method: 'POST' }); setHintText(data.hint); await refresh(interview.id, position); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const finish = async () => {
    if (!interview) return; setBusy(true);
    try { await saveDraft(); const next = await api<Interview>(`/interviews/${interview.id}/finish`, { method: 'POST' }); accept(next); onFinished(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const showReference = async (exercisePosition: number) => {
    if (!interview || interview.status !== 'completed') return;
    setBusy(true);
    try {
      const result = await api<{ code: string }>(`/interviews/${interview.id}/exercises/${exercisePosition}/reference`);
      setReferenceSolutions(previous => ({ ...previous, [exercisePosition]: result.code }));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const toggleReference = (exercisePosition: number) => {
    if (referenceSolutions[exercisePosition]) {
      setReferenceSolutions(previous => { const next = { ...previous }; delete next[exercisePosition]; return next; });
    } else void showReference(exercisePosition);
  };
  const newInterview = async () => {
    if (!interview) { await createInterview(); return; }
    const hasUnfinishedWork = interview.status !== 'completed' && (
      interview.status === 'active' || interview.exercises.some(item =>
        item.draft_code !== item.challenge.starterCode || item.results?.length || item.hints_used.length)
    );
    if (hasUnfinishedWork && !window.confirm('Finish this interview and start a new one? Its saved work will remain available in History.')) return;
    if (interview.status === 'active') {
      setBusy(true); setError('');
      try {
        await saveDraft();
        const finished = await api<Interview>(`/interviews/${interview.id}/finish`, { method: 'POST' });
        accept(finished, position);
        await onFinished();
      } catch (failure) { setError((failure as Error).message); return; }
      finally { setBusy(false); }
    }
    await createInterview();
  };
  if (!interview) return <section className="interview-panel panel"><p>{error || 'Preparing your interview playlist…'}</p><button className="submit-button" onClick={createInterview} disabled={busy}>Try again</button></section>;
  const completed = interview.status === 'completed';
  const totalPassed = interview.exercises.reduce((sum, item) => sum + (item.results ?? []).filter(result => result.status === 'passed').length, 0);
  const totalCases = interview.exercises.reduce((sum, item) => sum + item.challenge.tests.length, 0);
  return <section className="interview-panel">
    <div className="interview-toolbar">
      <div className="interview-progress">{interview.exercises.map((item, i) => <button key={item.position} className={i === position ? 'selected' : ''} onClick={() => { if (interview.status === 'active') void move(i); else { accept(interview, i); onNavigate(interview.id, i); } }} disabled={busy}><span className="interview-tab-number">{i + 1}</span><span className="interview-tab-title">{item.challenge.title}</span>{item.summary.completed && <CheckCircle2 size={14}/>}</button>)}</div>
      <div className="interview-controls"><Clock3 size={15}/><strong>{interview.status === 'active' ? fmt(interview.seconds_left) : completed ? fmt(interview.elapsed_seconds) : '60:00'}</strong>{interview.status === 'setup' && <button className="run-button" onClick={start} disabled={busy}>Start Interview</button>}{interview.status === 'active' && <button className="finish-button" onClick={finish} disabled={busy}><Square size={14}/> Finish</button>}<button className="text-button" onClick={newInterview} disabled={busy}>New Interview</button></div>
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {completed ? <div className="interview-report"><strong>Interview recap</strong><p>{interview.exercises.filter(item => item.summary.attempted).length} of {interview.exercises.length} exercises attempted · {fmt(interview.elapsed_seconds)} total time</p><div className="interview-report-list">{interview.exercises.map((item, i) => <article key={item.position}><div><strong>{i + 1}. {item.challenge.title}</strong><span>{item.summary.completed ? `${item.summary.passed}/${item.summary.total} tests passed · completed` : item.summary.attempted ? `${item.summary.passed}/${item.summary.total} tests passed` : 'Not attempted'}</span></div><button className="text-button" onClick={() => toggleReference(item.position)} disabled={busy}>{referenceSolutions[item.position] ? 'Hide solution' : 'View solution'}</button>{referenceSolutions[item.position] && <pre>{referenceSolutions[item.position]}</pre>}</article>)}</div></div> : exercise && <div className="workspace-grid interview-workspace">
      <section className="brief-panel panel"><div className="panel-tabs"><span className="active">Brief</span></div><div className="brief-body interview-brief-body"><section className="instruction-section"><h2>{exercise.challenge.title}</h2><p className="summary">{exercise.challenge.summary}</p></section><section className="instruction-section"><h2>Input / Output</h2><p>Implement <code>{exercise.challenge.functionName}</code>. The runner passes each test input as positional arguments and checks the returned value.</p><pre className="signature-code">{exercise.challenge.functionName}(...input) → output</pre></section><section className="instruction-section"><h2>Examples</h2><div className="examples">{exercise.challenge.examples.map(ex => <details key={ex.label} open><summary>{ex.label}</summary><div className="example-block"><div className="example-input"><strong>Input</strong><code>{JSON.stringify(ex.input)}</code></div><div className="example-input"><strong>Output</strong><code>{JSON.stringify(ex.output)}</code></div></div></details>)}</div></section><section className="instruction-section"><h2>Rules and edge cases</h2><ul className="requirements">{exercise.challenge.requirements.map((rule, i) => <li key={i}>{rule}</li>)}</ul></section>{interview.status === 'active' && hintText && <p className="interview-hint">{hintText}</p>}</div><div className="brief-footer">{interview.status === 'active' ? <button className="hint-button" onClick={useHint} disabled={busy || exercise.hints_used.length >= exercise.challenge.hints.length}><Lightbulb size={15}/> Hint · {exercise.hints_used.length}</button> : <span>Timer starts when you begin.</span>}</div></section>
      <div className="coding-column" style={{ '--output-height': `${outputHeight}px` } as CSSProperties}><section className="editor-panel panel"><div className="editor-tabs"><span className="editor-tab active">solution.{exercise.challenge.language === 'javascript' ? 'js' : 'ts'}</span><span className="editor-help">Run tests to inspect results</span></div><div className="editor-frame"><CodeMirror key={`${interview.id}:${position}`} value={code} height="100%" theme="dark" extensions={languageExtensions[exercise.challenge.language]} onChange={value => { codeRef.current = value; setCode(value); }} editable={interview.status === 'active' && !busy} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}/></div><div className="editor-status"><span>{interview.status === 'active' ? 'Draft saves automatically' : 'Interview preview'}</span><span>{exercise.challenge.language}</span></div></section>{!outputCollapsed && <div className="output-resize-handle" role="separator" aria-label="Resize tests and console panel" aria-orientation="horizontal" onPointerDown={beginOutputResize} title="Drag to resize output panel"/>}<section className={`output-panel panel ${outputCollapsed ? 'collapsed' : ''}`}><div className="output-panel-heading"><div className="panel-tabs output-tabs"><button className={outputTab === 'tests' ? 'active' : ''} onClick={() => setOutputTab('tests')}>Tests{results.length ? ` (${results.filter(r => r.status === 'passed').length}/${exercise.challenge.tests.length})` : ''}</button><button className={outputTab === 'console' ? 'active' : ''} onClick={() => setOutputTab('console')}>Console{consoleEntries.length ? ` (${consoleEntries.length})` : ''}</button></div><button className="collapse-output" onClick={() => setOutputCollapsed(!outputCollapsed)}>{outputCollapsed ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}<span>{outputCollapsed ? 'Expand' : 'Collapse'}</span></button></div>{outputCollapsed ? <div className="collapsed-summary">{results.length ? <span>{results.filter(r => r.status === 'passed').length}/{exercise.challenge.tests.length} tests passed</span> : <span>No test results yet</span>}</div> : outputTab === 'console' ? <div className="console-body">{consoleEntries.length ? consoleEntries.map((entry, i) => <pre key={i}>{entry.text}</pre>) : <p className="run-message">No console output yet.</p>}</div> : <div className="interview-results"><strong>{results.length ? `${results.filter(r => r.status === 'passed').length}/${exercise.challenge.tests.length} tests passed` : 'Tests have not been run'}</strong>{results.map(result => <div key={result.name} className={`interview-result ${result.status}`}><span>{result.name}</span><span>{result.status}</span></div>)}{consoleEntries.map((entry, i) => <pre key={i}>{entry.text}</pre>)}</div>}</section></div>
    </div>}
    {!completed && interview.status === 'active' && <div className="interview-actions"><button className="run-button" onClick={runTests} disabled={busy}><Play size={14}/> Run tests</button><button className="submit-button" onClick={submitExercise} disabled={busy || !results.length || results.length !== exercise?.challenge.tests.length || results.some(result => result.status !== 'passed')}>Submit exercise</button></div>}
  </section>;
}
