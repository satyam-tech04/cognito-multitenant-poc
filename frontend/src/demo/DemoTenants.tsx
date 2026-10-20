import { useEffect, useRef, useState } from 'react';
import { applyTheme, decodeJwt, navigate } from '../lib';
import { MicrosoftLogo } from './BrandFrame';
import {
  callTenantApi,
  labelOf,
  logFlow,
  clearFlow,
  flowSteps,
  getSession,
  hostedSignIn,
  loadDemo,
  signOut,
  tenantKey,
  type AppKey,
  type DemoTenant,
  type FlowStep,
  type SignupDemoConfig,
} from './demoLib';

const KIND_LABEL: Record<FlowStep['kind'], string> = {
  go: 'Request',
  back: 'Callback',
  token: 'Tokens',
  sso: 'SSO',
  ok: 'Signed in',
  refused: 'Refused',
  api: 'API',
  info: 'Info',
};

/**
 * Multi-tenant flows: tenants share one pool, each with three app clients; live log of every step.
 *   /demo/tenants       C · Cognito's hosted login pages (single sign-on between a tenant's apps)
 *   /demo/tenants-own   D · our own login and registration pages (API sign-in, no shared session)
 */
export function DemoTenants({ own = false }: { own?: boolean }) {
  const base = own ? '/demo/tenants-own' : '/demo/tenants';
  const [c, setC] = useState<SignupDemoConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState(new URLSearchParams(window.location.search).get('tenant') ?? '');
  const [steps, setSteps] = useState<FlowStep[]>(flowSteps());
  const [busy, setBusy] = useState<string | null>(null);
  const flowRef = useRef<HTMLElement>(null);
  // Keep the newest step in view
  useEffect(() => {
    const el = flowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps, c]);

  useEffect(() => {
    applyTheme(null);
    document.title = `Multi-tenant flow ${own ? 'D' : 'C'} · Registration demo`;
    loadDemo()
      .then((cfg) => {
        setC(cfg);
        setTenantId((cur) => cur || cfg.tenants?.[0]?.id || '');
      })
      .catch((e: Error) => setError(e.message));
    const on = () => setSteps(flowSteps());
    window.addEventListener('demo-flow', on);
    return () => window.removeEventListener('demo-flow', on);
  }, []);

  if (error) return <main className="demo"><div className="card error">{error}</div></main>;
  if (!c) return <main className="demo"><div className="spinner" /></main>;
  const tenants = c.tenants ?? [];
  if (!tenants.length) return <main className="demo"><div className="card error">No tenants yet. Run: npm run signup-demo</div></main>;

  const tenant = tenants.find((t) => t.id === tenantId) ?? tenants[0];
  const others = tenants.filter((t) => t.id !== tenant.id);
  const keyOf = (t: DemoTenant, app: string) => tenantKey(t.id, app, own);
  const anySignedIn = tenants.some((t) => t.apps.some((a) => getSession(keyOf(t, a.key))));
  const pickTenant = (id: string) => {
    setTenantId(id);
    window.history.replaceState({}, '', `${base}?tenant=${id}`);
  };
  /** D: open our own sign-in page for this app; note that there's no session to reuse */
  const openOwn = (key: AppKey, page: 'login' | 'register') => {
    const signedInElsewhere = tenant.apps.some((x) => keyOf(tenant, x.key) !== key && getSession(keyOf(tenant, x.key)));
    if (page === 'login' && signedInElsewhere) {
      logFlow('info', 'No single sign-on on our own pages', "Our pages call Cognito's API directly, so Cognito never sets its session cookie. Each app client signs in on its own.");
    }
    logFlow('go', `Our ${page === 'login' ? 'sign-in' : 'registration'} page for ${labelOf(c, key)}`, `No redirect to Cognito: the page calls the Cognito API with client_id=${tenant.apps.find((x) => keyOf(tenant, x.key) === key)?.clientId}`);
    navigate(`/demo/${page}?app=${key}`);
  };

  return (
    <main className="demo mt">
      <a className="bf-demo-link" href="/demo">← Demo overview</a>
      <header className="demo-head">
        <p className="eyebrow">
          <span className={`demo-tag ${own ? 'd' : 'c'} inline`}>{own ? 'D' : 'C'}</span>
          Amazon Cognito · Multi-tenant flow with {own ? 'our own login and registration pages' : "Cognito's hosted login pages"}
        </p>
        <h1>{tenants.length} tenants, 3 apps each</h1>
        {own ? (
          <p className="muted">
            The same tenants and app clients as flow C, but sign-in and registration happen on our own pages, which call
            Cognito's API. Registering through a tenant's app makes you a member of that tenant. Other tenants are refused at
            sign-in and in the API. There is no single sign-on: each app signs in on its own.
          </p>
        ) : (
          <p className="muted">
            Every tenant has three apps, and each app is its own Cognito app client with its own login page. Sign in to one
            app and the tenant's other apps open without a password. A user from another tenant is refused, and the API only
            returns data for the tenant in the token.
          </p>
        )}
        <p className="small">
          <a href={own ? '/demo/tenants' : '/demo/tenants-own'}>{own ? "Compare with flow C (Cognito's hosted pages) →" : 'Compare with flow D (our own login and registration pages) →'}</a>
        </p>
      </header>

      <div className="mt-grid">
        <div className="mt-left">
          <div className="mt-tabs" role="tablist" aria-label="Tenant">
            {tenants.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === tenant.id} className={t.id === tenant.id ? 'on' : ''} style={{ ['--t' as string]: t.color }} onClick={() => pickTenant(t.id)}>
                <span className="mt-dot" />
                {t.name}
              </button>
            ))}
          </div>

          <TenantInfo tenant={tenant} microsoft={Boolean(c.microsoftIdp)} />

          <div className="mt-apps">
            {tenant.apps.map((a, i) => {
              const key = keyOf(tenant, a.key);
              const s = getSession(key);
              const claims = s ? decodeJwt(s.accessToken) : undefined;
              const id = s ? decodeJwt(s.idToken) : undefined;
              return (
                <section key={a.key} className={`mt-app${s ? ' is-signed' : ''}`} style={{ ['--t' as string]: tenant.color }}>
                  <p className="mt-app-n">App {i + 1}</p>
                  <h3>{a.name}</h3>
                  <p className="mono mt-client">client_id {a.clientId}</p>
                  {s ? (
                    <>
                      <p className="mt-state ok">Signed in · {s.method}</p>
                      <dl className="mt-claims">
                        <div><dt>user</dt><dd>{String(id?.email ?? '')}</dd></div>
                        <div><dt>tenant_id</dt><dd>{String(claims?.tenant_id)}</dd></div>
                        <div><dt>app</dt><dd>{String(claims?.app)}</dd></div>
                        <div><dt>role</dt><dd>{String(claims?.role)}</dd></div>
                      </dl>
                      <div className="mt-app-actions">
                        <button className="btn small" disabled={busy === key} onClick={async () => { setBusy(key); await callTenantApi(c, key, tenant); setBusy(null); }}>
                          Call API: {tenant.name} data
                        </button>
                        {others.map((o) => (
                          <button key={o.id} className="btn small ghost" disabled={busy === key} onClick={async () => { setBusy(key); await callTenantApi(c, key, o); setBusy(null); }}>
                            Call API: {o.name} data
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-state">Not signed in</p>
                      <div className="mt-app-actions">
                        {own ? (
                          <>
                            <button className="btn" onClick={() => openOwn(key, 'login')}>Sign in to {a.name}</button>
                            {tenant.demoUsers.length > 0 && (
                              <button className="btn ghost" onClick={() => openOwn(key, 'register')}>Create account</button>
                            )}
                          </>
                        ) : (
                          <button className="btn" onClick={() => hostedSignIn(c, key, { method: 'Hosted sign-in page' })}>Open {a.name}</button>
                        )}
                        {c.microsoftIdp && tenant.allowedDomains.length > 0 && (
                          <button className="btn ghost" onClick={() => hostedSignIn(c, key, { idp: c.microsoftIdp, method: 'Microsoft' })}>
                            <MicrosoftLogo /> Microsoft
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>

          <section className="mt-try">
            <h2>What to show</h2>
            {own ? (
            <ol className="demo-steps">
              <li><b>Register into a tenant:</b> on {tenant.name}'s first app choose <i>Create account</i>. Our registration page sends <code>custom:tenant_id={tenant.id}</code>; the pre sign-up check confirms it is this app's tenant, then Cognito emails the 6-digit code.</li>
              <li><b>Sign in on our page:</b> password (SRP) or an emailed code. The panel shows the Cognito API calls and the tenant claims.</li>
              <li><b>No single sign-on:</b> open the second app. Our page asks again, because API sign-ins create no Cognito session to reuse.</li>
              <li><b>Tenant isolation in the API:</b> call the API for your own tenant (200), then for another tenant (403 wrong_tenant).</li>
              {others[0] && (
                <li><b>Tenant isolation at sign-in:</b> switch to {others[0].name} and sign in with the same account. The pre-token check refuses it.</li>
              )}
            </ol>
            ) : (
            <ol className="demo-steps">
              <li><b>Sign in once:</b> open {tenant.name}'s first app and sign in. The flow panel shows the redirect, the callback, the token exchange and the tenant claims.</li>
              <li><b>Single sign-on:</b> open the second and third apps. No login page appears; the panel says "Single sign-on".</li>
              <li><b>Tenant isolation in the API:</b> call the API for your own tenant (200), then for another tenant (403 wrong_tenant).</li>
              {others[0] && (
                <li><b>Tenant isolation at sign-in:</b> switch to {others[0].name} and open an app. Cognito reuses your session, but the pre-token check refuses the account because it isn't a member.</li>
              )}
            </ol>
            )}
          </section>

          {anySignedIn && (
            <button className="btn ghost" onClick={() => {
              const first = tenants.flatMap((t) => t.apps.map((a) => keyOf(t, a.key))).find((k) => getSession(k)) as AppKey;
              void signOut(c, first);
            }}>
              Sign out of every app
            </button>
          )}
        </div>

        <aside className="mt-flow" aria-live="polite" ref={flowRef}>
          <div className="mt-flow-head">
            <h2>Live flow</h2>
            {steps.length > 0 && <button className="bf-link" onClick={clearFlow}>Clear</button>}
          </div>
          {steps.length === 0 ? (
            <p className="muted small">
              {own
                ? 'Sign in or register on an app to see each step: the Cognito API calls, the pre sign-up and pre-token checks, the tenant claims and API checks.'
                : 'Open an app to see each step: the redirect to Cognito, the callback, the token exchange, single sign-on and API checks.'}
            </p>
          ) : (
            <ol className="mt-steps">
              {steps.map((s, i) => (
                <li key={`${s.at}-${i}`} className={`k-${s.kind}`}>
                  <span className="mt-kind">{KIND_LABEL[s.kind]}</span>
                  <span className="mt-time">{new Date(s.at).toLocaleTimeString()}</span>
                  <p className="mt-title">{s.title}</p>
                  {s.detail && <p className="mt-detail">{s.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  );
}

function TenantInfo({ tenant, microsoft }: { tenant: DemoTenant; microsoft: boolean }) {
  return (
    <div className="mt-info" style={{ ['--t' as string]: tenant.color }}>
      {tenant.demoUsers.length > 0 ? (
        <p>
          <b>Member account:</b> <span className="mono">{tenant.demoUsers.join(', ')}</span> (password from the demo email). Members are in the
          Cognito group <code>tenant_{tenant.id}</code>.
        </p>
      ) : (
        <p>
          <b>Members sign in with Microsoft:</b> work accounts ending in {tenant.allowedDomains.map((d) => <code key={d}>@{d}</code>)}.
          {microsoft ? ' Other Microsoft accounts are refused.' : ' Microsoft sign-in is not configured.'}
        </p>
      )}
    </div>
  );
}

/** Small helper so other pages can link here */
export const openTenants = () => navigate('/demo/tenants');
