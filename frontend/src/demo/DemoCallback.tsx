import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib';
import { completeHostedSignIn } from './demoLib';

/** /demo/callback: Cognito sends the browser back here after the hosted pages or Microsoft */
export function DemoCallback() {
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // the one-time code can only be exchanged once
    once.current = true;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('error')) {
      setError(`${qs.get('error_description') ?? qs.get('error')}`);
      return;
    }
    completeHostedSignIn()
      .then((app) => navigate(`/demo/account?app=${app}`))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="center-screen">
      {error ? (
        <div className="card narrow">
          <h2>Sign-in did not complete</h2>
          <p className="mono wrap">{error}</p>
          <button className="btn" onClick={() => navigate('/demo')}>Back to the demo</button>
        </div>
      ) : (
        <div className="spinner-wrap">
          <div className="spinner" />
          <p className="muted">Finishing sign-in…</p>
        </div>
      )}
    </main>
  );
}
