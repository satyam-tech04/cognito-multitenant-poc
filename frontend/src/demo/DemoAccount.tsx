import { useEffect, useState, type FormEvent } from 'react';
import { applyTheme, decodeJwt, navigate } from '../lib';
import { Field } from './BrandFrame';
import { AFFILIATION_MAX, friendly, labelOf, getProfile, getSession, hostedSignIn, loadDemo, saveAffiliation, signOut, type AppKey, type Profile, type SignupDemoConfig } from './demoLib';

/** /demo/account?app=…: who is signed in, how, their profile, and single sign-on to the other product */
export function DemoAccount() {
  const qs = new URLSearchParams(window.location.search);
  const app = (qs.get('app') ?? 'product1') as AppKey;
  const [c, setC] = useState<SignupDemoConfig | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [affiliation, setAffiliation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const session = getSession(app);
  const label = (k: AppKey) => (c ? labelOf(c, k) : k);

  useEffect(() => {
    applyTheme(null);
    document.title = 'Signed in · Registration demo';
    loadDemo()
      .then(async (cfg) => {
        setC(cfg);
        if (session) setProfile(await getProfile(cfg, session.accessToken));
      })
      .catch((e) => setProblem(friendly(e)));
  }, []);

  if (!session) {
    return (
      <main className="demo">
        <div className="card narrow">
          <h2>Not signed in to {label(app)}</h2>
          <p className="muted">The session has ended or this tab never signed in.</p>
          <button className="btn" onClick={() => navigate('/demo')}>Back to the demo</button>
        </div>
      </main>
    );
  }
  if (!c || !profile) return <main className="demo">{problem ? <div className="card error">{problem}</div> : <div className="spinner" />}</main>;

  const hosted = app !== 'own';
  const other: AppKey | undefined = app === 'product1' ? 'product2' : app === 'product2' ? 'product1' : undefined;
  const claims = decodeJwt(session.idToken);
  const needsAffiliation = !profile.affiliation;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!affiliation.trim()) return setProblem('Enter your affiliation.');
    setSaving(true);
    setProblem(null);
    try {
      await saveAffiliation(c!, session!.accessToken, affiliation);
      setProfile(await getProfile(c!, session!.accessToken));
      setSaved(true);
    } catch (err) {
      setProblem(friendly(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="demo">
      <a className="bf-demo-link" href="/demo">← Demo overview</a>
      <section className="demo-account">
        <div className="demo-account-head">
          <span className={`demo-tag ${hosted ? 'a' : 'b'}`}>{hosted ? 'A' : 'B'}</span>
          <div>
            <p className="eyebrow">{hosted ? 'Cognito hosted pages' : 'Our own pages'}</p>
            <h1>Signed in to {label(app)}</h1>
            {qs.get('welcome') && <p className="bf-notice">Email verified and account created.</p>}
          </div>
        </div>

        <dl className="demo-facts">
          <div><dt>Signed in with</dt><dd>{session.method}</dd></div>
          <div><dt>Name</dt><dd>{profile.firstName} {profile.lastName}</dd></div>
          <div><dt>Email</dt><dd>{profile.email} {profile.emailVerified ? <span className="pill ok">verified</span> : <span className="pill no">not verified</span>}</dd></div>
          <div><dt>Affiliation</dt><dd>{profile.affiliation || <span className="pill no">missing</span>}</dd></div>
          <div><dt>Cognito user ID</dt><dd className="mono">{String(claims.sub)}</dd></div>
        </dl>

        {needsAffiliation && (
          <form className="demo-complete" onSubmit={save}>
            <h2>Complete your profile</h2>
            <p className="muted">
              Cognito's hosted sign-up page can't show custom fields, so the app asks for Affiliation now and saves it
              to the user's <code>custom:affiliation</code> attribute.
            </p>
            <Field label="Affiliation" name="affiliation" required multiline maxLength={AFFILIATION_MAX} placeholder="University, organization, or research institution" hint="e.g., University, research institute, or organization." value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
            {problem && <p className="bf-problem">{problem}</p>}
            <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save and continue'}</button>
          </form>
        )}
        {saved && <p className="bf-notice">Affiliation saved to Cognito.</p>}

        <div className="demo-account-actions">
          {other && (
            <div className="demo-sso-box">
              <h2>Single sign-on</h2>
              <p className="muted">{label(other)} is a separate app client on the same pool. Cognito remembers this sign-in for 1 hour, so it opens without asking for a password.</p>
              <button className="btn" onClick={() => hostedSignIn(c, other, { method: `Single sign-on from ${label(app)} (no password)` })}>Open {label(other)}</button>
            </div>
          )}
          <button className="btn ghost" onClick={() => signOut(c, app)}>Sign out</button>
        </div>

        <details className="demo-claims">
          <summary>ID token claims</summary>
          <pre className="mono">{JSON.stringify(claims, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}
