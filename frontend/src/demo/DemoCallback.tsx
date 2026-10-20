import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib';
import { clearPending, completeHostedSignIn, isTenantKey, logFlow, pendingApp } from './demoLib';

/** /demo/callback: Cognito sends the browser back here after the hosted pages or Microsoft */
export function DemoCallback() {
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // the one-time code can only be exchanged once
    once.current = true;
    const qs = new URLSearchParams(window.location.search);
    const app = pendingApp();
    const tenantId = app && isTenantKey(app) ? app.split(':')[0] : undefined;
    if (qs.get('error')) {
      const why = (qs.get('error_description') ?? qs.get('error') ?? '').replace(/^PreTokenGeneration(V2_0)? failed with error /, '').replace(/\.+\s*$/, '.');
      if (tenantId) {
        // A refused tenant sign-in is part of the demo: log it and go back to the tenant page
        logFlow('back', 'Back at /demo/callback with an error instead of a code', `error=${qs.get('error')}`);
        logFlow('refused', 'Sign-in refused by the pre-token check', why);
        clearPending();
        navigate(`/demo/tenants?tenant=${tenantId}`);
        return;
      }
      setError(why);
      return;
    }
    completeHostedSignIn()
      .then((done) => navigate(isTenantKey(done) ? `/demo/tenants?tenant=${done.split(':')[0]}` : `/demo/account?app=${done}`))
      .catch((e: Error) => {
        // With single sign-on Cognito issues a code first; the pre-token check then refuses the token exchange
        const m = /failed with error (.+?)\.*\s*\(Service:/.exec(e.message) ?? /failed with error (.+?)\.*$/.exec(e.message);
        if (tenantId && m) {
          logFlow('token', 'Token exchange at /oauth2/token refused', 'Cognito reused the session and issued a code, then ran the pre-token check');
          logFlow('refused', 'Sign-in refused by the pre-token check', `${m[1]}.`);
          clearPending();
          navigate(`/demo/tenants?tenant=${tenantId}`);
          return;
        }
        setError(e.message);
      });
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
