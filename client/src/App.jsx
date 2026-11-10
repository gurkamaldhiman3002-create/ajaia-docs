import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import EditorPage from './EditorPage.jsx';
import { navigate } from './nav.js';

function parseRoute() {
  const match = window.location.hash.match(/^#\/d\/([\w-]+)/);
  return match ? { name: 'doc', id: match[1] } : { name: 'home' };
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/');
  }, []);

  if (user === undefined) return <div className="boot">Loading…</div>;
  if (!user) return <Login onSignedIn={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Ajaia Docs
        </a>
        <div className="topbar-user">
          <span className="avatar" aria-hidden="true">{user.name[0]}</span>
          <span className="topbar-name">{user.name}</span>
          <button className="btn btn-quiet" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {route.name === 'doc' ? (
        <EditorPage key={route.id} docId={route.id} user={user} />
      ) : (
        <Dashboard user={user} />
      )}
    </div>
  );
}
