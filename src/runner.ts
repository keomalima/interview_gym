import type { ChallengeTest } from './shared/challenges';

export type ConsoleEntry = { level: string; text: string; caseName: string };
export type TestResult = { name: string; status: 'passed' | 'failed' | 'error' | 'timeout'; expected?: string; actual?: string; durationMs?: number };

function pretty(value: unknown) {
  const output = JSON.stringify(value, null, 2);
  return output === undefined ? 'undefined' : output.slice(0, 4000);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

function compile(source: string, onCancel: (cancel: () => void) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error('Compilation timed out.')); }, 5000);
    const cleanup = () => { clearTimeout(timeout); worker.terminate(); };
    onCancel(() => { cleanup(); reject(new Error('Run stopped.')); });
    worker.onmessage = event => { cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.code); };
    worker.onerror = () => { cleanup(); reject(new Error('Compilation failed.')); };
    worker.postMessage({ source });
  });
}

export function createTestRun(source: string, functionName: string, tests: ChallengeTest[], onConsole?: (entry: ConsoleEntry) => void, scriptOnly = false) {
  let frame: HTMLIFrameElement | null = null;
  let cancelCurrent: (() => void) | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    frame?.contentWindow?.postMessage({ type: 'cancel' }, '*');
    cancelCurrent?.();
    frame?.remove();
    frame = null;
  };
  const promise = (async (): Promise<TestResult[]> => {
    const code = await compile(source, cancel => { cancelCurrent = cancel; });
    if (stopped) throw new Error('Run stopped.');
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.display = 'none';
    frame.src = '/runner.html';
    const currentFrame = frame;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Execution sandbox did not start.')); }, 5000);
      const handler = (event: MessageEvent) => {
        if (event.source !== currentFrame.contentWindow || event.data?.type !== 'runner-ready') return;
        clearTimeout(timer); window.removeEventListener('message', handler); resolve();
      };
      window.addEventListener('message', handler);
      cancelCurrent = () => { clearTimeout(timer); window.removeEventListener('message', handler); reject(new Error('Run stopped.')); };
    });
    document.body.appendChild(currentFrame);
    await ready;
    const results: TestResult[] = [];
    let consoleCount = 0;
    for (const test of scriptOnly ? [{ name: 'Run', input: [], expected: null }] : tests) {
      if (stopped) throw new Error('Run stopped.');
      const start = performance.now();
      const nonce = crypto.randomUUID();
      const response = await new Promise<{ value?: unknown; error?: string; timeout?: boolean }>((resolve, reject) => {
        const timer = window.setTimeout(() => { window.removeEventListener('message', handler); currentFrame.contentWindow?.postMessage({ type: 'cancel' }, '*'); resolve({ timeout: true }); }, 1500);
        const handler = (event: MessageEvent) => {
          if (event.source !== currentFrame.contentWindow || event.data?.nonce !== nonce) return;
          if (event.data.type === 'execution-console') {
            if (consoleCount++ < 200 && typeof event.data.text === 'string') onConsole?.({ level: String(event.data.level).slice(0, 10), text: event.data.text.slice(0, 2000), caseName: test.name });
            return;
          }
          if (event.data.type !== 'execution-result') return;
          clearTimeout(timer); window.removeEventListener('message', handler); resolve(event.data);
        };
        window.addEventListener('message', handler);
        cancelCurrent = () => { clearTimeout(timer); window.removeEventListener('message', handler); reject(new Error('Run stopped.')); };
        currentFrame.contentWindow?.postMessage({ type: 'execute', nonce, source: code, functionName, input: test.input, scriptOnly }, '*');
      });
      if (response.timeout) {
        results.push({ name: test.name, status: 'timeout', actual: 'Stopped after 1.5 seconds', durationMs: Math.round(performance.now() - start) });
        break;
      }
      let status: TestResult['status'];
      if (scriptOnly) status = response.error ? 'error' : 'passed';
      else if ('error' in test) status = response.error?.includes(test.error) ? 'passed' : 'failed';
      else if (response.error) status = 'error';
      else status = canonical(response.value) === canonical(test.expected) ? 'passed' : 'failed';
      results.push({ name: test.name, status, expected: 'error' in test ? `Error containing “${test.error}”` : pretty(test.expected), actual: response.error ? `Error: ${response.error}` : pretty(response.value), durationMs: Math.round(performance.now() - start) });
    }
    return results;
  })().finally(() => { frame?.remove(); frame = null; cancelCurrent = null; });
  return { promise, stop };
}

/** Import the learner module once; only its own top-level calls execute. */
export function createCodeRun(source: string, onConsole: (entry: ConsoleEntry) => void) {
  return createTestRun(source, '', [], onConsole, true);
}
