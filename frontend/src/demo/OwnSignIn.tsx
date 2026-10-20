import { useEffect, useState, type FormEvent } from 'react';
import { applyTheme, navigate } from '../lib';
import { BrandFrame, Field, MicrosoftLogo } from './BrandFrame';
import { finishEmailCode, friendly, hostedSignIn, isOwnTenantKey, loadDemo, passwordSignIn, ssoDomainOf, startEmailCode, tenantAppOf, tenantPageFor, type AppKey, type SignupDemoConfig } from './demoLib';

type Mode = 'password' | 'code';

/** /demo/login: our own sign-in page (B): password, email one-time code, Microsoft and work-email SSO */
export function OwnSignIn() {
  // Flow D: ?app=own/<tenant>:<app> signs in to that tenant app instead of the plain demo client
  const appParam = new URLSearchParams(window.location.search).get('app') ?? '';
  const app: AppKey = isOwnTenantKey(appParam) ? (appParam as AppKey) : 'own';
  const [c, setC] = useState<SignupDemoConfig | null>(null);
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSession, setCodeSession] = useState<{ session: string; destination: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyTheme(null);
    loadDemo().then(setC).catch((e: Error) => setProblem(e.message));
  }, []);

  if (!c) return <main className="demo">{problem ? <div className="card error">{problem}</div> : <div className="spinner" />}</main>;

  const otp = c.signInFactors.includes('EMAIL_OTP');
  const ssoDomain = ssoDomainOf(c, email);
  const ta = tenantAppOf(c, app);
  const done = ta ? tenantPageFor(app) : '/demo/account?app=own';
  const showMicrosoft = Boolean(c.microsoftIdp) && (!ta || ta.tenant.allowedDomains.length > 0);
  const run = async (fn: () => Promise<void>) => {
    setProblem(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setProblem(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ssoDomain) return void hostedSignIn(c, app, { idpIdentifier: ssoDomain, method: 'Work-email single sign-on' });
    if (mode === 'password') {
      return void run(async () => {
        await passwordSignIn(c, email, password, app);
        navigate(done);
      });
    }
    if (!codeSession) return void run(async () => setCodeSession(await startEmailCode(c, email, app)));
    void run(async () => {
      await finishEmailCode(c, email, codeSession.session, code, app);
      navigate(done);
    });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setProblem(null);
    setCodeSession(null);
    setCode('');
  };

  return (
    <BrandFrame config={c} subtitle={ta ? `${ta.tenant.name} · ${ta.app.name}` : undefined} subtitleColor={ta?.tenant.color} back={ta ? { href: done, label: `Back to ${ta.tenant.name}'s apps` } : undefined}>
      <h1 className="bf-title">Sign In</h1>
      <form className="bf-form" onSubmit={submit} noValidate>
        <Field label="Email ID" name="email" required type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setCodeSession(null); }} disabled={!!codeSession} autoFocus />

        {ssoDomain ? (
          <p className="bf-notice">@{ssoDomain} uses single sign-on. Continue to sign in with your Microsoft work account.</p>
        ) : (
          <>
            {otp && (
              <div className="bf-tabs" role="tablist" aria-label="How do you want to sign in?">
                <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'on' : ''} onClick={() => switchMode('password')}>Password</button>
                <button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'on' : ''} onClick={() => switchMode('code')}>Email me a code</button>
              </div>
            )}
            {mode === 'password' && (
              <Field label="Password" name="password" required password placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {mode === 'code' && codeSession && (
              <>
                <p className="bf-notice">We sent a sign-in code to {codeSession.destination}.</p>
                <Field label="Sign-in code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Code from the email" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              </>
            )}
          </>
        )}

        {problem && <p className="bf-problem">{problem}</p>}
        <button className="bf-btn primary" disabled={busy || !email}>
          {busy ? 'Please wait…' : ssoDomain ? 'Continue with single sign-on' : mode === 'code' ? (codeSession ? 'Sign In' : 'Send me a code') : 'Sign In'}
        </button>
        {mode === 'code' && codeSession && (
          <button type="button" className="bf-link" onClick={() => switchMode('code')}>Use a different email or send a new code</button>
        )}
      </form>

      {showMicrosoft && (
        <>
          <p className="bf-or"><span>or</span></p>
          <button type="button" className="bf-btn outline" onClick={() => hostedSignIn(c, app, { idp: c.microsoftIdp, method: 'Microsoft' })}>
            <MicrosoftLogo /> Continue with Microsoft
          </button>
        </>
      )}
      <p className="bf-switch">New user? <button type="button" className="bf-link" onClick={() => navigate(ta ? `/demo/register?app=${app}` : '/demo/register')}>Create Account</button></p>
    </BrandFrame>
  );
}
