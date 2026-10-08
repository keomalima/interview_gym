import vm from 'node:vm';
import ts from 'typescript';
import type { Challenge } from '../../src/shared/challenges.js';

const MAX_CASE_MS = 1500;
const normalize = (value: unknown): string => JSON.stringify(value, (_key, current) => {
  if (current && typeof current === 'object' && !Array.isArray(current)) return Object.fromEntries(Object.keys(current).sort().map(key => [key, current[key]]));
  return current;
});

function compile(source: string, label: string, functionName: string, errors: string[]): vm.Context | undefined {
  if (/\bimport\s*(?:\(|[{*'".]|[A-Za-z_$])/m.test(source) || /\bexport\s+\*\s+from\b/.test(source)) {
    errors.push(`${label}: imports/re-exports are not supported by the browser runner`);
    return;
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  const diagnostics = output.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
  for (const item of diagnostics) errors.push(`${label}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`);
  if (diagnostics.length) return;
  const context = vm.createContext({ module: { exports: {} }, exports: {}, require: () => { throw new Error('Imports are unavailable'); } });
  (context as any).exports = (context as any).module.exports;
  try { new vm.Script(output.outputText, { filename: label }).runInContext(context, { timeout: MAX_CASE_MS }); }
  catch (error) { errors.push(`${label}: failed to load module: ${error instanceof Error ? error.message : String(error)}`); return; }
  if (typeof (context as any).module.exports?.[functionName] !== 'function') errors.push(`${label}: expected exported function "${functionName}"`);
  return context;
}

async function execute(context: vm.Context, fn: string, input: unknown[], label: string, errors: string[]): Promise<{ value?: unknown; thrown?: string }> {
  try {
    (context as any).__args = JSON.stringify(input);
    const result = new vm.Script(`module.exports[${JSON.stringify(fn)}](...JSON.parse(__args))`).runInContext(context, { timeout: MAX_CASE_MS });
    let timer: ReturnType<typeof setTimeout>;
    const value = await Promise.race([
      Promise.resolve(result),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`exceeded ${MAX_CASE_MS} ms`)), MAX_CASE_MS); }),
    ]).finally(() => clearTimeout(timer!));
    const encoded = JSON.stringify(value);
    if (encoded === undefined || encoded.length > 20_000) throw new Error('returned a non-JSON value or output over 20 KB');
    return { value: JSON.parse(encoded) };
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

export async function validateExecutable(challenge: Challenge): Promise<string[]> {
  if (challenge.exerciseType !== 'function') return [`exerciseType "${challenge.exerciseType}" is not executable by the current runner (only "function" is supported)`];
  const errors: string[] = [];
  const starter = compile(challenge.starterCode, `${challenge.id} starterCode`, challenge.functionName, errors);
  const reference = compile(challenge.referenceCode, `${challenge.id} referenceCode`, challenge.functionName, errors);
  if (!starter || !reference || errors.length) return errors;

  for (const example of challenge.examples) {
    const result = await execute(reference, challenge.functionName, example.input, `${challenge.id} example "${example.label}"`, errors);
    if (result.thrown || normalize(result.value) !== normalize(example.output)) errors.push(`${challenge.id} example "${example.label}": expected ${normalize(example.output)}, got ${result.thrown ? `throw "${result.thrown}"` : normalize(result.value)}`);
  }
  for (const test of challenge.tests) {
    const result = await execute(reference, challenge.functionName, test.input, `${challenge.id} test "${test.name}"`, errors);
    if ('error' in test) {
      if (!result.thrown?.includes(test.error)) errors.push(`${challenge.id} test "${test.name}": expected error containing ${JSON.stringify(test.error)}, got ${result.thrown ? JSON.stringify(result.thrown) : normalize(result.value)}`);
    } else if (result.thrown || normalize(result.value) !== normalize(test.expected)) {
      errors.push(`${challenge.id} test "${test.name}": expected ${normalize(test.expected)}, got ${result.thrown ? `throw ${JSON.stringify(result.thrown)}` : normalize(result.value)}`);
    }
  }
  return errors;
}
