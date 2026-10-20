import { useEffect, useState, type FormEvent } from 'react';
import { applyTheme, navigate } from '../lib';
import { BrandFrame, Field, MicrosoftLogo } from './BrandFrame';
import { AFFILIATION_MAX, confirmRegistration, friendly, hostedSignIn, loadDemo, passwordSignIn, register, resendRegistrationCode, type RegisterInput, type SignupDemoConfig } from './demoLib';

const EMPTY: RegisterInput & { confirm: string } = { firstName: '', lastName: '', email: '', password: '', confirm: '', affiliation: '' };
/** Same rules as the user pool's password policy, checked before Cognito sees the request */
const PASSWORD_RULES: Array<[RegExp, string]> = [
  [/.{8,}/, 'at least 8 characters'],
  [/[a-z]/, 'a lowercase letter'],
  [/[A-Z]/, 'an uppercase letter'],
  [/[0-9]/, 'a number'],
  [/[^A-Za-z0-9]/, 'a symbol'],
];
const RESEND_COOLDOWN_S = 30;

/** /demo/register: our own registration page (B), with every field the product needs */
export function OwnRegister() {
  const [c, setC] = useState<SignupDemoConfig | null>(null);
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(null);
    loadDemo().then(setC).catch((e: Error) => setProblem(e.message));
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!c) return <main className="demo">{problem ? <div className="card error">{problem}</div> : <div className="spinner" />}</main>;

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setV({ ...v, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
  };

  function validate() {
    const e: typeof errors = {};
    if (!v.firstName.trim()) e.firstName = 'Enter your first name.';
    if (!v.lastName.trim()) e.lastName = 'Enter your last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
    const missing = PASSWORD_RULES.filter(([re]) => !re.test(v.password)).map(([, m]) => m);
    if (missing.length) e.password = `Needs ${missing.join(', ')}.`;
    if (v.confirm !== v.password) e.confirm = 'Passwords do not match.';
    if (!v.affiliation.trim()) e.affiliation = 'Enter your affiliation.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (!validate()) return;
    setBusy(true);
    try {
      setDestination(await register(c!, v));
      setStep('verify');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setProblem(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      await confirmRegistration(c!, v.email, code);
      // Verified: sign straight in with the password they just chose
      await passwordSignIn(c!, v.email, v.password);
      navigate('/demo/account?app=own&welcome=1');
    } catch (err) {
      setProblem(friendly(err));
      setBusy(false);
    }
  }

  async function resend() {
    setProblem(null);
    setNotice(null);
    try {
      await resendRegistrationCode(c!, v.email);
      setNotice(`A new code was sent to ${destination}.`);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setProblem(friendly(err));
    }
  }

  if (step === 'verify') {
    return (
      <BrandFrame config={c}>
        <h1 className="bf-title">Verify your email</h1>
        <p className="bf-sub">We sent a 6-digit code to <b>{destination}</b>. Enter it to activate your account.</p>
        <form className="bf-form" onSubmit={verify} noValidate>
          <Field label="Verification code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          {problem && <p className="bf-problem">{problem}</p>}
          {notice && <p className="bf-notice">{notice}</p>}
          <button className="bf-btn primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
          <button type="button" className="bf-btn outline" disabled={cooldown > 0} onClick={resend}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
        <p className="bf-footnote">Cognito sends and checks this code. You can't sign in until the email is verified.</p>
      </BrandFrame>
    );
  }

  return (
    <BrandFrame config={c}>
      <h1 className="bf-title">Create Account</h1>
      <form className="bf-form" onSubmit={submit} noValidate>
        <Field label="First Name" name="firstName" required placeholder="First Name" autoComplete="given-name" value={v.firstName} onChange={set('firstName')} error={errors.firstName} />
        <Field label="Last Name" name="lastName" required placeholder="Last Name" autoComplete="family-name" value={v.lastName} onChange={set('lastName')} error={errors.lastName} />
        <Field label="Email ID" name="email" required type="email" placeholder="Email" autoComplete="email" value={v.email} onChange={set('email')} error={errors.email} />
        <div className="bf-row">
          <Field label="Password" name="password" required password placeholder="Password" autoComplete="new-password" value={v.password} onChange={set('password')} error={errors.password} />
          <Field label="Confirm Password" name="confirm" required password placeholder="Confirm Password" autoComplete="new-password" value={v.confirm} onChange={set('confirm')} error={errors.confirm} />
        </div>
        <Field
          label="Affiliation"
          name="affiliation"
          required
          multiline
          maxLength={AFFILIATION_MAX}
          placeholder="University, organization, or research institution"
          hint="e.g., University, research institute, or organization."
          value={v.affiliation}
          onChange={set('affiliation')}
          error={errors.affiliation}
        />
        {problem && <p className="bf-problem">{problem}</p>}
        <button className="bf-btn primary" disabled={busy}>{busy ? 'Creating account…' : 'Create Account'}</button>
        <button type="button" className="bf-btn outline" onClick={() => navigate('/demo/login')}>Back to Sign In</button>
      </form>
      {c.microsoftIdp && (
        <>
          <p className="bf-or"><span>or</span></p>
          <button type="button" className="bf-btn outline" onClick={() => hostedSignIn(c, 'own', { idp: c.microsoftIdp, method: 'Microsoft' })}>
            <MicrosoftLogo /> Register with Microsoft
          </button>
        </>
      )}
    </BrandFrame>
  );
}
