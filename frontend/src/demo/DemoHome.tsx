import { useEffect, useState, type FormEvent } from 'react';
import { applyTheme, navigate } from '../lib';
import { APP_LABEL, getSession, hostedSignIn, loadDemo, ssoDomainOf, type SignupDemoConfig } from './demoLib';
import { MicrosoftLogo } from './BrandFrame';

/** /demo: the two ways to register and sign in, side by side, on one shared user pool */
export function DemoHome() {
  const [c, setC] = useState<SignupDemoConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState('');
  const [ssoError, setSsoError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(null);
    document.title = 'Registration & login demo';
    loadDemo().then(setC).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <main className="demo"><div className="card error">{error}</div></main>;
  if (!c) return <main className="demo"><div className="spinner" /></main>;

  const otp = c.signInFactors.includes('EMAIL_OTP');
  const passkeys = c.signInFactors.includes('WEB_AUTHN');
  const signedIn = (['product1', 'product2', 'own'] as const).filter((a) => getSession(a));

  const workEmailSso = (e: FormEvent) => {
    e.preventDefault();
    const d = ssoDomainOf(c, workEmail);
    if (!d) return setSsoError(c.ssoDomains.length ? `Single sign-on is set up for ${c.ssoDomains.map((x) => '@' + x).join(', ')} emails only.` : 'No single sign-on domains are configured.');
    void hostedSignIn(c, 'product1', { idpIdentifier: d, method: 'Work-email single sign-on' });
  };

  return (
    <main className="demo">
      <header className="demo-head">
        <p className="eyebrow">Amazon Cognito · Registration and login demo</p>
        <h1>One user pool, two kinds of pages</h1>
        <p className="muted">
          Both sides use the same Cognito user pool, so an account created on one side signs in on the other. Cognito
          stores the users, checks passwords and sends the 6-digit codes in both cases.
        </p>
        <ul className="demo-chips" aria-label="Turned on in this user pool">
          <li>Self sign-up</li>
          <li>Email verified by 6-digit code</li>
          <li>Password + confirm password</li>
          {otp && <li>Sign in with an email code</li>}
          {passkeys && <li>Passkeys</li>}
          {c.microsoftIdp && <li>Microsoft sign-in</li>}
          {c.ssoDomains.length > 0 && <li>Work-email SSO ({c.ssoDomains.map((d) => '@' + d).join(', ')})</li>}
        </ul>
        {c.notes.map((n) => <p key={n} className="demo-note">{n}</p>)}
        <p className="small guide-links">
          <a href="/demo/architecture">Architecture overview: how it all fits, scenarios and limitations →</a>
          <a href="/demo/guide">DevOps guide: what to decide and prepare before creating the user pool →</a>
          <a href="/demo/guide/dev">Developer guide: building the pages and Lambda triggers →</a>
        </p>
      </header>

      {signedIn.length > 0 && (
        <div className="demo-signed">
          <span>Signed in:</span>
          {signedIn.map((a) => (
            <button key={a} className="btn ghost" onClick={() => navigate(`/demo/account?app=${a}`)}>
              {APP_LABEL[a]} →
            </button>
          ))}
        </div>
      )}

      {(c.tenants?.length ?? 0) > 0 && (
        <button className="demo-mt-banner" onClick={() => navigate('/demo/tenants')}>
          <span className="demo-tag c">C</span>
          <span>
            <b>Multi-tenant flow with Cognito's hosted pages: {c.tenants!.length} tenants × 3 apps</b>
            <span className="muted">Sign in once, single sign-on across a tenant's apps, other tenants refused at sign-in and in the API, with a live step-by-step flow.</span>
          </span>
          <span className="demo-mt-go">Open →</span>
        </button>
      )}
      {(c.tenants?.length ?? 0) > 0 && (
        <button className="demo-mt-banner d" onClick={() => navigate('/demo/tenants-own')}>
          <span className="demo-tag d">D</span>
          <span>
            <b>Multi-tenant flow with our own login and registration pages</b>
            <span className="muted">Same tenants and apps as C. Register into a tenant and sign in on our pages; other tenants are refused at sign-in and in the API. No single sign-on between apps.</span>
          </span>
          <span className="demo-mt-go">Open →</span>
        </button>
      )}

      <div className="demo-cols">
        <section className="demo-col">
          <span className="demo-tag a">A</span>
          <h2>Cognito hosted pages</h2>
          <p className="muted">
            AWS hosts and secures these pages. We set the logo, colours and background image. The wording and the fields
            are fixed by Cognito.
          </p>
          <div className="demo-actions">
            <button className="btn big" onClick={() => hostedSignIn(c, 'product1', { signup: true, method: 'Hosted sign-up' })}>Create account</button>
            <button className="btn big" onClick={() => hostedSignIn(c, 'product1', { method: 'Hosted sign-in page' })}>Sign in</button>
            {c.microsoftIdp && (
              <button className="btn big ghost" onClick={() => hostedSignIn(c, 'product1', { idp: c.microsoftIdp, method: 'Microsoft' })}>
                <MicrosoftLogo /> Continue with Microsoft
              </button>
            )}
          </div>
          {c.ssoDomains.length > 0 && (
            <form className="demo-sso" onSubmit={workEmailSso}>
              <label htmlFor="work-email">Sign in with your work email (SSO)</label>
              <div>
                <input id="work-email" type="email" placeholder={`name@${c.ssoDomains[0]}`} value={workEmail} onChange={(e) => { setWorkEmail(e.target.value); setSsoError(null); }} required />
                <button className="btn">Continue</button>
              </div>
              {ssoError && <p className="bf-error">{ssoError}</p>}
            </form>
          )}
          <h3>What to show</h3>
          <ol className="demo-steps">
            <li><b>Create account:</b> email, first and last name, password and confirm password. Cognito emails a 6-digit code, then you are signed in.</li>
            <li><b>Affiliation:</b> the hosted page can't show custom fields, so the app asks for it after the first sign-in.</li>
            <li><b>Sign in:</b> enter the email, choose <i>Next</i>, then pick Password{otp ? ', Email one-time password' : ''}{passkeys ? ' or a passkey' : ''}.</li>
            <li><b>Single sign-on:</b> on the account page, open Product 2. It signs you in without asking again.</li>
          </ol>
        </section>

        <section className="demo-col">
          <span className="demo-tag b">B</span>
          <h2>Our own pages</h2>
          <p className="muted">
            Our design, our wording and every field, including Affiliation. The pages call Cognito's API, so Cognito
            still creates the account and sends the codes.
          </p>
          <div className="demo-actions">
            <button className="btn big" onClick={() => navigate('/demo/register')}>Create account</button>
            <button className="btn big" onClick={() => navigate('/demo/login')}>Sign in</button>
          </div>
          <h3>What to show</h3>
          <ol className="demo-steps">
            <li><b>Create account:</b> the product's own form, including the required Affiliation box. Cognito emails a 6-digit code to verify the address.</li>
            <li><b>Affiliation is enforced by Cognito:</b> a sign-up without it is rejected by a pre sign-up check, even if someone skips the form.</li>
            <li><b>Sign in:</b> with a password{otp ? ', or with a one-time code sent by email' : ''}.</li>
            <li><b>Microsoft:</b> {c.ssoDomains.length ? `type an @${c.ssoDomains[0]} email and the page sends you to Microsoft, or ` : ''}use "Continue with Microsoft".</li>
          </ol>
        </section>
      </div>

      <section className="demo-compare">
        <h2>What each kind of page can do</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Requirement</th><th>A · Hosted pages</th><th>B · Our own pages</th></tr></thead>
            <tbody>
              <tr><td>First name, last name, email</td><td className="ok">Yes, labelled "Given name" and "Family name"</td><td className="ok">Yes, with our labels</td></tr>
              <tr><td>Password and confirm password</td><td className="ok">Yes</td><td className="ok">Yes, side by side with show/hide</td></tr>
              <tr><td>Affiliation (required)</td><td className="part">Asked after the first sign-in</td><td className="ok">On the form, enforced by Cognito</td></tr>
              <tr><td>Email verified by 6-digit code</td><td className="ok">Yes</td><td className="ok">Yes</td></tr>
              <tr><td>Our own OTP expiry, attempt and resend limits</td><td className="no">No, Cognito's fixed rules</td><td className="part">Only with our own code service</td></tr>
              <tr><td>Sign in with email code (OTP)</td><td className={otp ? 'ok' : 'no'}>{otp ? 'Yes' : 'Off'}</td><td className={otp ? 'ok' : 'no'}>{otp ? 'Yes' : 'Off'}</td></tr>
              <tr><td>Sign in with Microsoft</td><td className="ok">Yes</td><td className="ok">Yes, through Cognito</td></tr>
              <tr><td>Work email goes straight to Microsoft</td><td className="ok">Yes</td><td className="ok">Yes</td></tr>
              <tr><td>Single sign-on between products</td><td className="ok">Yes, for 1 hour after signing in</td><td className="no">No, each product signs in again</td></tr>
              <tr><td>Passkeys</td><td className={passkeys ? 'ok' : 'no'}>{passkeys ? 'Yes' : 'Off'}</td><td className="no">Not built (one passkey domain per pool)</td></tr>
              <tr><td>Own wording, layout and fields</td><td className="no">No</td><td className="ok">Yes</td></tr>
              <tr><td>Welcome email after verification</td><td className="no">Not built (needs Amazon SES)</td><td className="no">Not built (needs Amazon SES)</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
