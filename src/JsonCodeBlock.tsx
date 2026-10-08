import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';

function isInlineValue(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Array.isArray(value)
    && value.length <= 8
    && value.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item))
    && JSON.stringify(value).length <= 96;
}

export function formatJsonData(value: unknown, depth = 0): string {
  if (Array.isArray(value) && isInlineValue(value)) return `[${value.map(item => JSON.stringify(item) ?? 'null').join(', ')}]`;
  if (isInlineValue(value)) return JSON.stringify(value) ?? 'null';
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    return `[\n${value.map(item => `${childIndent}${formatJsonData(item, depth + 1)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return `{\n${entries.map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${formatJsonData(item, depth + 1)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') {
    try { return formatJsonData(JSON.parse(value)); } catch { return value; }
  }
  return formatJsonData(value);
}

export default function JsonCodeBlock({ value, theme = 'dark', label }: { value: unknown; theme?: 'dark' | 'light'; label?: string }) {
  return <div className="json-code-block" aria-label={label}>
    <CodeMirror value={displayValue(value)} height="auto" theme={theme} extensions={[json()]} editable={false} basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, autocompletion: false }} aria-label={label ?? 'Formatted JSON data'}/>
  </div>;
}
