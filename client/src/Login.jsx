import { useState } from 'react';
import { api } from './api.js';

const DEMO_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen', note: 'Owns the sample doc' },
  { email: 'bob@ajaia.test', name: 'Bob Rivera', note: 'Editor on the sample doc' },
  { email: 'carol@ajaia.test', name: 'Carol Singh', note: 'Viewer on the sample doc' },
];
const DEMO_PASSWORD = 'demo1234';

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e, p) {
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(e, p);
      onSignedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-sheet">
        <h1 className="login-title">Ajaia Docs</h1>
        <p className="login-lede">Write, import and share documents with your team.</p>

        <form
          className="login-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            signIn(email, password);
          }}
        >
          <label>
            Email
            <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} autoComplete="current-password" required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>Sign in</button>
        </form>

        <div className="demo-accounts">
          <h2>Demo accounts</h2>
          <p className="muted">Password for all three is <code>{DEMO_PASSWORD}</code>. Open a private window to sign in as a second person.</p>
          <ul>
            {DEMO_USERS.map((u) => (
              <li key={u.email}>
                <button className="demo-user" disabled={busy} onClick={() => signIn(u.email, DEMO_PASSWORD)}>
                  <span className="avatar" aria-hidden="true">{u.name[0]}</span>
                  <span>
                    <strong>Sign in as {u.name.split(' ')[0]}</strong>
                    <small>{u.email}, {u.note.toLowerCase()}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
