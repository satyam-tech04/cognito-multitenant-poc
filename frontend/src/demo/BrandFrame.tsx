import { useEffect, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import type { SignupDemoConfig } from './demoLib';

/** Document-with-arrow mark used in the product logo */
export function BrandIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 48" width="30" height="36" aria-hidden="true" fill="none" stroke={color} strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M6 2h20l10 10v30a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" />
      <path d="M26 2v10h10" />
      <path d="M10 27h16m-6-6 6 6-6 6" />
    </svg>
  );
}

export function BrandLogo({ brand }: { brand: SignupDemoConfig['brand'] }) {
  return (
    <div className="bf-logo">
      <BrandIcon color={brand.accent} />
      <span className="bf-name">
        <span style={{ color: brand.accent }}>{brand.nameAccent}</span>
        {brand.nameRest}
      </span>
    </div>
  );
}

/** Our own pages (B): illustration on the left, form on the right, like the product's current sign-up page */
export function BrandFrame({ config, children }: { config: SignupDemoConfig; children: ReactNode }) {
  const b = config.brand;
  useEffect(() => {
    document.title = `${b.nameAccent}${b.nameRest}`;
  }, [b]);
  const style = { '--bf-primary': b.primary, '--bf-accent': b.accent } as CSSProperties;
  return (
    <div className="bf" style={style}>
      <aside className="bf-art" style={{ backgroundColor: b.panelColor, backgroundImage: b.illustration ? `url(${b.illustration})` : undefined }} aria-hidden="true" />
      <main className="bf-main">
        <div className="bf-card">
          <BrandLogo brand={b} />
          {children}
        </div>
        <a className="bf-demo-link" href="/demo">← Back to the demo overview</a>
      </main>
    </div>
  );
}

/** Text field with a label, a red * when required, and an optional show/hide eye for passwords */
export function Field({ label, required, hint, error, password, multiline, ...input }: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  password?: boolean;
  multiline?: boolean;
} & InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>) {
  const [show, setShow] = useState(false);
  const id = input.id ?? input.name;
  return (
    <div className={`bf-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="bf-req">*</span>}
      </label>
      {multiline ? (
        <textarea id={id} rows={4} {...input} />
      ) : (
        <div className={`bf-input${password ? ' has-eye' : ''}`}>
          <input id={id} type={password && !show ? 'password' : input.type ?? 'text'} {...input} />
          {password && (
            <button type="button" className="bf-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
              )}
            </button>
          )}
        </div>
      )}
      {hint && !error && <p className="bf-hint">{hint}</p>}
      {error && <p className="bf-error">{error}</p>}
    </div>
  );
}

export function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" width="16" height="16" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
