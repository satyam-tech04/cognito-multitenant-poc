/**
 * Registration demo: one shared Cognito pool, two sets of pages.
 *   A  Cognito's hosted pages (managed login), reached with Authorization Code + PKCE
 *   B  our own pages, calling the Cognito user pools API from the browser
 * Both end up with the same Cognito tokens, stored here per "product".
 */
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { OwnAuth, type OwnTokens } from '../ownAuth';
import { decodeJwt, getApiUrl, navigate } from '../lib';
import type { DemoTenant, SignupDemoConfig } from '../../../shared/signup-demo';

export type { DemoTenant, SignupDemoConfig };
export { AFFILIATION_ATTR, AFFILIATION_MAX } from '../../../shared/signup-demo';

/**
 * product1 / product2 = hosted pages on two app clients (to show SSO); own = our own pages;
 * "<tenant>:<app>"     = one of a tenant's three app clients, signed in on Cognito's hosted pages (flow C)
 * "own/<tenant>:<app>" = the same app client, signed in on our own pages (flow D)
 */
export type AppKey = 'product1' | 'product2' | 'own' | `${string}:app${1 | 2 | 3}`;
export const APP_LABEL: Record<'product1' | 'product2' | 'own', string> = { product1: 'Product 1', product2: 'Product 2', own: 'Our own pages' };
export const isTenantKey = (k: string): k is `${string}:app${1 | 2 | 3}` => /^(own\/)?[a-z0-9-]+:app[123]$/.test(k);
/** Flow D: tenant app signed in on our own pages */
export const isOwnTenantKey = (k: string) => isTenantKey(k) && k.startsWith('own/');
export const tenantKey = (tenantId: string, app: string, own = false) => `${own ? 'own/' : ''}${tenantId}:${app}` as AppKey;
export const tenantIdOfKey = (k: string) => k.replace(/^own\//, '').split(':')[0];
/** Where a tenant flow lives in the app */
export const tenantPageFor = (k: string) => `${isOwnTenantKey(k) ? '/demo/tenants-own' : '/demo/tenants'}?tenant=${tenantIdOfKey(k)}`;

export function tenantAppOf(c: SignupDemoConfig, key: AppKey) {
  if (!isTenantKey(key)) return undefined;
  const [tid, app] = key.replace(/^own\//, '').split(':');
  const tenant = c.tenants?.find((t) => t.id === tid);
  const a = tenant?.apps.find((x) => x.key === app);
  return tenant && a ? { tenant, app: a } : undefined;
}
export function labelOf(c: SignupDemoConfig, key: AppKey): string {
  const t = tenantAppOf(c, key);
  return t ? `${t.tenant.name} · ${t.app.name}` : APP_LABEL[key as keyof typeof APP_LABEL] ?? key;
}

export interface DemoSession {
  app: AppKey;
  /** How the user signed in, shown on the account page */
  method: string;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  at: number;
}

// ---------- config ----------
let configP: Promise<SignupDemoConfig> | undefined;
export function loadDemo(): Promise<SignupDemoConfig> {
  configP ??= (async () => {
    const r = await fetch(`${await getApiUrl()}/public/signup-demo`, { cache: 'no-store' });
    if (r.status === 404) throw new Error('The registration demo is not set up yet. Run: npm run signup-demo');
    if (!r.ok) throw new Error(`Demo config ${r.status}`);
    return (await r.json()) as SignupDemoConfig;
  })();
  configP.catch(() => (configP = undefined));
  return configP;
}

function clientIdOf(c: SignupDemoConfig, app: AppKey): string {
  if (app === 'own') return c.ownClientId;
  if (app === 'product1' || app === 'product2') return c.hostedClients[app];
  const t = tenantAppOf(c, app);
  if (!t) throw new Error(`Unknown app ${app}`);
  return t.app.clientId;
}

// ---------- live flow log (multi-tenant page) ----------
export interface FlowStep {
  at: number;
  kind: 'go' | 'back' | 'token' | 'sso' | 'ok' | 'refused' | 'api' | 'info';
  title: string;
  detail?: string;
}
const FLOW = 'demo.flow';
export function flowSteps(): FlowStep[] {
  try {
    return JSON.parse(sessionStorage.getItem(FLOW) ?? '[]');
  } catch {
    return [];
  }
}
export function logFlow(kind: FlowStep['kind'], title: string, detail?: string) {
  sessionStorage.setItem(FLOW, JSON.stringify([...flowSteps(), { at: Date.now(), kind, title, detail }].slice(-60)));
  window.dispatchEvent(new Event('demo-flow'));
}
export function clearFlow() {
  sessionStorage.removeItem(FLOW);
  window.dispatchEvent(new Event('demo-flow'));
}

// ---------- sessions (sessionStorage: cleared when the tab closes) ----------
const SESSIONS = 'demo.sessions';
export function sessions(): Partial<Record<AppKey, DemoSession>> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSIONS) ?? '{}');
  } catch {
    return {};
  }
}
function saveSession(s: DemoSession) {
  sessionStorage.setItem(SESSIONS, JSON.stringify({ ...sessions(), [s.app]: s }));
}
export function getSession(app: AppKey): DemoSession | undefined {
  const s = sessions()[app];
  if (!s) return undefined;
  const exp = Number(decodeJwt(s.idToken).exp ?? 0) * 1000;
  return exp > Date.now() ? s : undefined;
}
function dropSession(app: AppKey) {
  const all = sessions();
  delete all[app];
  sessionStorage.setItem(SESSIONS, JSON.stringify(all));
}

// ---------- A: hosted pages (Authorization Code + PKCE) ----------
const managers = new Map<string, UserManager>();
function manager(c: SignupDemoConfig, app: AppKey, page: 'authorize' | 'signup' = 'authorize'): UserManager {
  const key = `${app}:${page}`;
  if (managers.has(key)) return managers.get(key)!;
  const origin = window.location.origin;
  const m = new UserManager({
    authority: c.issuer,
    client_id: clientIdOf(c, app),
    redirect_uri: `${origin}/demo/callback`,
    post_logout_redirect_uri: `${origin}/demo`,
    response_type: 'code',
    scope: 'openid email profile aws.cognito.signin.user.admin',
    loadUserInfo: false,
    automaticSilentRenew: false,
    metadata: {
      issuer: c.issuer,
      // The hosted sign-up page takes the same parameters as the authorize endpoint
      authorization_endpoint: `${c.loginDomain}/${page === 'signup' ? 'signup' : 'oauth2/authorize'}`,
      token_endpoint: `${c.loginDomain}/oauth2/token`,
      revocation_endpoint: `${c.loginDomain}/oauth2/revoke`,
      end_session_endpoint: `${c.loginDomain}/logout`,
      jwks_uri: `${c.issuer}/.well-known/jwks.json`,
    },
    userStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: `demo.oidc.${app}.` }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'demo.oidcstate.' }),
  });
  managers.set(key, m);
  return m;
}

const PENDING = 'demo.pending';
/** A round trip faster than this can't have included typing on Cognito's login page */
const SSO_MAX_MS = 6000;
export interface HostedOptions {
  /** Open Cognito's sign-up page instead of sign-in */
  signup?: boolean;
  /** Skip Cognito's page and go straight to this identity provider (e.g. "Microsoft") */
  idp?: string;
  /** Work-email SSO: Cognito picks the identity provider from the email domain */
  idpIdentifier?: string;
  /** "login": show Cognito's login page even if its session cookie could sign the user in silently */
  prompt?: 'login';
  method: string;
}
export async function hostedSignIn(c: SignupDemoConfig, app: AppKey, o: HostedOptions) {
  sessionStorage.setItem(PENDING, JSON.stringify({ app, method: o.method, startedAt: Date.now() }));
  if (isTenantKey(app)) {
    if (isTenantKey(app)) clearRefused();
  logFlow(
      'go',
      isOwnTenantKey(app) ? `Our page → ${o.idp ?? `Microsoft (work-email single sign-on for @${o.idpIdentifier})`} for ${labelOf(c, app)}` : `Open ${labelOf(c, app)}`,
      `Browser → Cognito /oauth2/authorize · client_id=${clientIdOf(c, app)} · response_type=code · PKCE S256${o.idp ? ` · identity_provider=${o.idp} (Cognito's page is skipped)` : ''}`,
    );
  }
  const extra: Record<string, string> = {};
  if (o.idp) extra.identity_provider = o.idp;
  if (o.idpIdentifier) extra.idp_identifier = o.idpIdentifier;
  await manager(c, app, o.signup ? 'signup' : 'authorize').signinRedirect({ extraQueryParams: extra, prompt: o.prompt });
}

/** /demo/callback: exchange the code (PKCE) and keep the tokens */
export async function completeHostedSignIn(): Promise<AppKey> {
  const raw = sessionStorage.getItem(PENDING);
  if (!raw) throw new Error('No sign-in in progress. Start again from the demo page.');
  const { app, method, startedAt } = JSON.parse(raw) as { app: AppKey; method: string; startedAt?: number };
  const c = await loadDemo();
  const tenantFlow = isTenantKey(app);
  if (tenantFlow) logFlow('back', 'Back at /demo/callback with an authorization code', `${labelOf(c, app)} · state checked`);
  // Both sign-in and sign-up requests share one state store, so either manager can complete them
  const u = await manager(c, app).signinRedirectCallback();
  sessionStorage.removeItem(PENDING);
  const id = decodeJwt(u.id_token ?? '');
  const access = decodeJwt(u.access_token);
  const viaMs = Array.isArray(id.identities) && id.identities.length > 0;
  // Cognito's session cookie was reused when the browser came straight back: faster than anyone can sign in,
  // or with an auth_time older than this redirect
  const elapsed = startedAt ? Date.now() - startedAt : Infinity;
  const sso = elapsed < SSO_MAX_MS || Boolean(startedAt && Number(id.auth_time) * 1000 < startedAt - 1000);
  const how = sso ? 'Single sign-on (no login page)' : viaMs ? 'Microsoft' : method;
  if (tenantFlow) {
    logFlow('token', 'Code + PKCE verifier exchanged at /oauth2/token', 'Cognito returned an ID token, an access token and a refresh token');
    if (sso) logFlow('sso', 'Single sign-on: no login page shown', `Cognito's session cookie was reused; back in ${(elapsed / 1000).toFixed(1)} s`);
    logFlow('ok', `Signed in to ${labelOf(c, app)}`, `Access token claims · tenant_id=${access.tenant_id} · app=${access.app} · role=${access.role} · client_id=${access.client_id}`);
  }
  saveSession({ app, method: how, idToken: u.id_token!, accessToken: u.access_token, refreshToken: u.refresh_token, at: Date.now() });
  return app;
}

// ---------- B: our own pages (Cognito user pools API) ----------
export class CognitoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
async function idp<T>(c: SignupDemoConfig, action: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://cognito-idp.${c.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${action}` },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const code = String(data.__type ?? 'Error').split('#').pop()!;
    throw new CognitoError(code, String(data.message ?? data.Message ?? 'Request failed'));
  }
  return data as T;
}

/** Plain-language messages; unknown-user and wrong-password look the same on purpose */
export function friendly(e: unknown): string {
  const x = e as CognitoError;
  switch (x?.code) {
    case 'UsernameExistsException':
      return 'An account with this email already exists. Sign in instead.';
    case 'InvalidPasswordException':
      return x.message.replace(/^Password did not conform with policy: /, '');
    case 'UserLambdaValidationException':
      return x.message.replace(/^(PreSignUp|PreTokenGeneration(V2_0)?) failed with error /, '').replace(/\.+$/, '') + '.';
    case 'CodeMismatchException':
      return 'That code is not right. Check the email and try again.';
    case 'ExpiredCodeException':
      return 'That code has expired. Send a new one.';
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return /disabled/i.test(x.message) ? 'This account is deactivated.' : 'Incorrect email or password.';
    case 'UserNotConfirmedException':
      return 'Please verify your email first.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'InvalidParameterException':
      return x.message;
    default:
      return x?.message || 'Something went wrong. Please try again.';
  }
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  affiliation: string;
}
/** Sign up: Cognito creates the user (unconfirmed) and emails a 6-digit code */
export async function register(c: SignupDemoConfig, v: RegisterInput, app: AppKey = 'own'): Promise<string> {
  const t = tenantAppOf(c, app);
  const r = await idp<{ CodeDeliveryDetails?: { Destination?: string } }>(c, 'SignUp', {
    ClientId: clientIdOf(c, app),
    Username: v.email.trim().toLowerCase(),
    Password: v.password,
    UserAttributes: [
      { Name: 'email', Value: v.email.trim().toLowerCase() },
      { Name: 'given_name', Value: v.firstName.trim() },
      { Name: 'family_name', Value: v.lastName.trim() },
      { Name: 'custom:affiliation', Value: v.affiliation.trim() },
      // Flow D: join the tenant that owns this app (checked by the pre sign-up trigger, then immutable)
      ...(t ? [{ Name: 'custom:tenant_id', Value: t.tenant.id }] : []),
    ],
  });
  if (t) logFlow('go', `SignUp through ${labelOf(c, app)}`, `client_id=${clientIdOf(c, app)} · custom:tenant_id=${t.tenant.id} · pre sign-up check passed · 6-digit code emailed`);
  return r.CodeDeliveryDetails?.Destination ?? v.email;
}
export async function confirmRegistration(c: SignupDemoConfig, email: string, code: string, app: AppKey = 'own') {
  await idp(c, 'ConfirmSignUp', { ClientId: clientIdOf(c, app), Username: email.trim().toLowerCase(), ConfirmationCode: code.trim() });
  if (isTenantKey(app)) logFlow('ok', 'Email verified (ConfirmSignUp)', `The account now belongs to ${tenantAppOf(c, app)?.tenant.name}`);
}
export const resendRegistrationCode = (c: SignupDemoConfig, email: string, app: AppKey = 'own') =>
  idp(c, 'ResendConfirmationCode', { ClientId: clientIdOf(c, app), Username: email.trim().toLowerCase() });

/** Password sign-in with SRP: the password never leaves the browser */
export async function passwordSignIn(c: SignupDemoConfig, email: string, password: string, app: AppKey = 'own'): Promise<void> {
  const step = await new OwnAuth(c.userPoolId, clientIdOf(c, app), 'Demo').signIn(email, password);
  if (step.kind === 'done') {
    if (isTenantKey(app)) logFlow('token', 'SRP sign-in: InitiateAuth (USER_SRP_AUTH) → PASSWORD_VERIFIER', `client_id=${clientIdOf(c, app)} · only a proof of the password is sent · Cognito ran the pre-token check`);
    return keepOwnTokens(c, app, step.tokens, 'Email and password (our page)');
  }
  if (step.kind === 'error') {
    if (isTenantKey(app)) logFlow('refused', `Sign-in to ${labelOf(c, app)} refused`, step.message);
    throw new CognitoError('Auth', step.message);
  }
  throw new CognitoError('Auth', 'This account has an authenticator app set up. Use the hosted sign-in page for it.');
}

interface AuthResult {
  AuthenticationResult?: { IdToken: string; AccessToken: string; RefreshToken?: string };
  ChallengeName?: string;
  Session?: string;
  ChallengeParameters?: Record<string, string>;
}
/** Email one-time code, step 1: Cognito emails a code */
export async function startEmailCode(c: SignupDemoConfig, email: string, app: AppKey = 'own'): Promise<{ session: string; destination: string }> {
  const r = await idp<AuthResult>(c, 'InitiateAuth', {
    ClientId: clientIdOf(c, app),
    AuthFlow: 'USER_AUTH',
    AuthParameters: { USERNAME: email.trim().toLowerCase(), PREFERRED_CHALLENGE: 'EMAIL_OTP' },
  });
  if (r.ChallengeName !== 'EMAIL_OTP' || !r.Session) {
    throw new CognitoError('Auth', 'Email codes are not available for this account. Sign in with your password.');
  }
  if (isTenantKey(app)) logFlow('go', 'InitiateAuth (USER_AUTH, EMAIL_OTP): Cognito emailed a sign-in code', `client_id=${clientIdOf(c, app)}`);
  return { session: r.Session, destination: r.ChallengeParameters?.CODE_DELIVERY_DESTINATION ?? email };
}
/** Email one-time code, step 2: check the code and sign in */
export async function finishEmailCode(c: SignupDemoConfig, email: string, session: string, code: string, app: AppKey = 'own'): Promise<void> {
  let r: AuthResult;
  try {
    r = await idp<AuthResult>(c, 'RespondToAuthChallenge', {
      ClientId: clientIdOf(c, app),
      ChallengeName: 'EMAIL_OTP',
      Session: session,
      ChallengeResponses: { USERNAME: email.trim().toLowerCase(), EMAIL_OTP_CODE: code.trim() },
    });
  } catch (e) {
    if (isTenantKey(app)) logFlow('refused', `Sign-in to ${labelOf(c, app)} refused`, friendly(e));
    throw e;
  }
  if (!r.AuthenticationResult) throw new CognitoError('Auth', 'Sign-in needs another step that this page does not support.');
  const a = r.AuthenticationResult;
  if (isTenantKey(app)) logFlow('token', 'RespondToAuthChallenge with the emailed code', `client_id=${clientIdOf(c, app)} · Cognito ran the pre-token check`);
  keepOwnTokens(c, app, { idToken: a.IdToken, accessToken: a.AccessToken, refreshToken: a.RefreshToken ?? '' }, 'Email one-time code (our page)');
}

function keepOwnTokens(c: SignupDemoConfig, app: AppKey, t: OwnTokens, method: string) {
  saveSession({ app, method, idToken: t.idToken, accessToken: t.accessToken, refreshToken: t.refreshToken, at: Date.now() });
  if (isTenantKey(app)) {
    const a = decodeJwt(t.accessToken);
    logFlow('ok', `Signed in to ${labelOf(c, app)}`, `Access token claims · tenant_id=${a.tenant_id} · app=${a.app} · role=${a.role} · client_id=${a.client_id}`);
  }
}

// ---------- profile (both page types) ----------
export interface Profile {
  email: string;
  firstName: string;
  lastName: string;
  affiliation: string;
  emailVerified: boolean;
}
export async function getProfile(c: SignupDemoConfig, accessToken: string): Promise<Profile> {
  const r = await idp<{ UserAttributes: Array<{ Name: string; Value: string }> }>(c, 'GetUser', { AccessToken: accessToken });
  const a = Object.fromEntries(r.UserAttributes.map((x) => [x.Name, x.Value]));
  return {
    email: a.email ?? '',
    firstName: a.given_name ?? '',
    lastName: a.family_name ?? '',
    affiliation: a['custom:affiliation'] ?? '',
    emailVerified: a.email_verified === 'true',
  };
}
/** "Complete your profile": the signed-in user saves their own Affiliation */
export const saveAffiliation = (c: SignupDemoConfig, accessToken: string, value: string) =>
  idp(c, 'UpdateUserAttributes', { AccessToken: accessToken, UserAttributes: [{ Name: 'custom:affiliation', Value: value.trim() }] });

/**
 * The tenant app whose sign-in was just refused. Cognito may have reused its session silently, so the
 * tenant page offers to sign in again with a different account (prompt=login).
 */
const REFUSED = 'demo.refused';
export function markRefused(app: AppKey) {
  sessionStorage.setItem(REFUSED, app);
}
export function lastRefused(): AppKey | undefined {
  return (sessionStorage.getItem(REFUSED) as AppKey | null) ?? undefined;
}
export function clearRefused() {
  sessionStorage.removeItem(REFUSED);
}

/** Which app a failed callback was for (Cognito's error comes back to /demo/callback) */
export function pendingApp(): AppKey | undefined {
  try {
    return (JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { app: AppKey } | null)?.app;
  } catch {
    return undefined;
  }
}
export function clearPending() {
  sessionStorage.removeItem(PENDING);
}

// ---------- multi-tenant API check ----------
export async function callTenantApi(c: SignupDemoConfig, from: AppKey, target: DemoTenant) {
  const s = getSession(from);
  const path = `/demo-tenants/${target.id}/data`;
  const r = await fetch(`${await getApiUrl()}${path}`, { headers: s ? { authorization: `Bearer ${s.accessToken}` } : {} });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const ok = r.status === 200;
  logFlow(ok ? 'api' : 'refused', `API ${path} → ${r.status}${ok ? '' : ` ${String(body.error ?? '')}`}`, ok ? `Data returned for ${target.name}` : String(body.message ?? `Called with the ${labelOf(c, from)} token`));
  return { status: r.status, body };
}

// ---------- sign-out ----------
export async function signOut(c: SignupDemoConfig, app: AppKey) {
  const s = sessions()[app];
  if (s?.refreshToken) await idp(c, 'RevokeToken', { Token: s.refreshToken, ClientId: clientIdOf(c, app) }).catch(() => undefined);
  dropSession(app);
  if (app === 'own') return navigate('/demo');
  if (isOwnTenantKey(app)) {
    // Our own pages have no Cognito session cookie: revoking the refresh tokens is the sign-out
    for (const k of Object.keys(sessions()) as AppKey[]) {
      const other = sessions()[k];
      if (!isOwnTenantKey(k)) continue;
      if (other?.refreshToken) await idp(c, 'RevokeToken', { Token: other.refreshToken, ClientId: clientIdOf(c, k) }).catch(() => undefined);
      dropSession(k);
    }
    logFlow('info', 'Signed out of every app', 'Refresh tokens revoked (RevokeToken); our pages keep no Cognito session cookie');
    return navigate(tenantPageFor(app));
  }
  // Hosted pages share one Cognito session cookie: clear it, and every hosted session with it
  for (const k of Object.keys(sessions()) as AppKey[]) if (k !== 'own' && !isOwnTenantKey(k)) dropSession(k);
  const back = isTenantKey(app) ? '/demo/tenants' : '/demo';
  if (isTenantKey(app)) logFlow('info', 'Signed out of every app', "Refresh tokens revoked and Cognito's session cookie cleared at /logout");
  const u = new URL(`${c.loginDomain}/logout`);
  u.searchParams.set('client_id', clientIdOf(c, app));
  u.searchParams.set('logout_uri', `${window.location.origin}${back}`);
  window.location.assign(u.toString());
}

/** Work-email SSO: is this email's domain sent to Microsoft? */
export function ssoDomainOf(c: SignupDemoConfig, email: string): string | undefined {
  const d = email.trim().toLowerCase().split('@')[1];
  return d && c.ssoDomains.includes(d) ? d : undefined;
}
