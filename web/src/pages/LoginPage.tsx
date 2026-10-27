import { useState } from 'react';
import { ApiError, post, resetCsrf } from '../api/client.js';
import { Logo } from '../components/Logo.js';

export function loginErrorText(e: unknown): string {
  if (e instanceof ApiError && e.code === 'rate_limited') return 'Trop de tentatives, réessayez plus tard.';
  return 'Connexion refusée.';
}

export function LoginView({ error, busy, onSubmit }: { error: string | null; busy?: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  return (
    <div className="login">
      <form className="login-box" onSubmit={(e) => { e.preventDefault(); onSubmit(password); }}>
        <h2 className="login-brand"><Logo size={40} />Cardinal</h2>
        <div className="field">
          <label htmlFor="login-pw">Mot de passe</label>
          <input id="login-pw" className="input" type="password" autoComplete="current-password" autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="err-box" role="alert">{error}</div>}
        <button type="submit" className="btn primary" disabled={busy || !password}>Se connecter</button>
      </form>
    </div>
  );
}

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (password: string) => {
    setBusy(true); setError(null);
    try {
      await post('/api/auth/login', { password });
      resetCsrf();
      window.location.assign('/');
    } catch (e) {
      setError(loginErrorText(e));
      setBusy(false);
    }
  };
  return <LoginView error={error} busy={busy} onSubmit={(p) => void submit(p)} />;
}
