import { useEffect, useState, type FormEvent } from 'react';
import { App } from './App';

export function AuthGate() {
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [required, setRequired] = useState(false);
  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function status() {
    try {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Could not connect. Try again.');
      const result = await response.json();
      setRequired(result.required); setLocked(!result.authenticated);
      if (result.authenticated) setMounted(true);
      setError(''); setReady(true);
    } catch (failure) { setError((failure as Error).message); setReady(true); }
  }
  useEffect(() => {
    void status();
    const lock = () => { setRequired(true); setLocked(true); };
    window.addEventListener('auth-required', lock);
    return () => window.removeEventListener('auth-required', lock);
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
      setPassword(''); setLocked(false); setMounted(true);
      window.dispatchEvent(new Event('auth-restored'));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Sign-out failed. Try again.');
    setMounted(false); setLocked(true);
  }
  return <>
    {mounted && <div inert={locked || undefined}><App onSignOut={required ? signOut : undefined}/></div>}
    {(!ready || locked) && <div className="auth-overlay"><form className="auth-card" onSubmit={login}>
      <h1>Interview Gym</h1><p>{mounted ? 'Sign in again to keep practicing. Your editor is preserved.' : 'Your personal interview practice space.'}</p>
      {!ready ? <p>Connecting…</p> : required ? <><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={256} autoFocus/><button className="submit-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></> : <button type="button" className="submit-button" onClick={() => void status()}>Retry connection</button>}
      {error && <p role="alert">{error}</p>}{required && <small>Sign out when you finish on a shared computer.</small>}
    </form></div>}
  </>;
}
