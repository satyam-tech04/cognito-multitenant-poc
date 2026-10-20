import { useEffect, type ReactNode } from 'react';
import { applyTheme } from '../lib';
import { Note, Section, Table } from './DevOpsGuide';

/** /demo/guide/dev: how developers build sign-up and sign-in on Cognito, after DevOps has created the pool */
const SECTIONS = [
  ['inputs', '1. What you get from DevOps'],
  ['choose', '2. Hosted pages or our own pages'],
  ['hosted', '3. Cognito hosted pages'],
  ['own', '4. Our own pages'],
  ['tokens', '5. After sign-in: tokens and the API'],
  ['lambda', '6. Writing Lambda triggers'],
  ['errors', '7. Errors you will see'],
  ['repo', '8. Where things are in this repo'],
] as const;

export function DevGuide() {
  useEffect(() => {
    applyTheme(null);
    document.title = 'Developer guide · Cognito sign-up and login';
  }, []);

  return (
    <main className="demo guide">
      <a className="bf-demo-link" href="/demo">← Demo overview</a>
      <header className="demo-head">
        <p className="eyebrow">Amazon Cognito · Developer guide</p>
        <h1>Building sign-up and sign-in</h1>
        <p className="muted">
          For developers, once DevOps has created the user pool. It covers what to build for Cognito's hosted pages and for
          our own pages, how to use the tokens, and how to write Lambda triggers.
        </p>
        <p className="small"><a href="/demo/guide">DevOps guide: what to decide before creating the pool →</a></p>
      </header>

      <nav className="guide-toc" aria-label="Sections">
        {SECTIONS.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
      </nav>

      <Section id="inputs" title="1. What you get from DevOps">
        <p>These values are public; they end up in the browser anyway. Read them from config, never hard-code them.</p>
        <Table
          head={['Value', 'Example', 'Used for']}
          rows={[
            ['Region', <code key="r">ap-south-1</code>, 'Cognito API address'],
            ['User pool ID', <code key="p">ap-south-1_AbC123</code>, 'Our-own-page sign-in, token verification'],
            ['Issuer', <code key="i">https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_AbC123</code>, 'Token verification'],
            ['Login domain', <code key="d">https://myapp.auth.ap-south-1.amazoncognito.com</code>, 'Hosted pages, Microsoft redirect, /oauth2/token, /logout'],
            ['App client ID (one per app)', <code key="c">3h2q2ls2c3m8…</code>, 'Every Cognito call'],
            ['Identity provider name', <code key="n">Microsoft</code>, 'Continue with Microsoft'],
            ['Callback / logout URLs', <code key="u">https://app/demo/callback</code>, 'Must match the app client exactly'],
          ]}
        />
        <Note>App clients are public (no client secret). Never put AWS keys or secrets in front-end code.</Note>
      </Section>

      <Section id="choose" title="2. Hosted pages or our own pages">
        <Table
          head={['', 'Cognito hosted pages', 'Our own pages']}
          rows={[
            ['Who builds the screens', 'Cognito; we only style them', 'We do'],
            ['How sign-in works', 'Browser redirect (OAuth 2.0 code + PKCE)', 'Our page calls the Cognito API'],
            ['Custom fields on sign-up', 'No; ask after the first sign-in', 'Yes'],
            ['Single sign-on between apps', 'Yes (1-hour Cognito session)', 'No'],
            ['Passkeys, MFA screens, password reset', 'Built in', 'We build each screen'],
            ['Security of the screens', 'AWS', 'Us (no logging of passwords, rate limits, safe errors)'],
          ]}
        />
      </Section>

      <Section id="hosted" title="3. Cognito hosted pages">
        <h3>Step 1: set up the OIDC client (one per app client)</h3>
        <Code>{`import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const auth = new UserManager({
  authority: ISSUER,
  client_id: APP_CLIENT_ID,
  redirect_uri: \`\${location.origin}/callback\`,
  post_logout_redirect_uri: \`\${location.origin}/\`,
  response_type: 'code',                      // PKCE is added automatically
  scope: 'openid email profile aws.cognito.signin.user.admin',
  metadata: {                                 // Cognito's endpoints live on the login domain
    issuer: ISSUER,
    authorization_endpoint: \`\${LOGIN_DOMAIN}/oauth2/authorize\`,
    token_endpoint: \`\${LOGIN_DOMAIN}/oauth2/token\`,
    revocation_endpoint: \`\${LOGIN_DOMAIN}/oauth2/revoke\`,
    end_session_endpoint: \`\${LOGIN_DOMAIN}/logout\`,
    jwks_uri: \`\${ISSUER}/.well-known/jwks.json\`,
  },
  userStore: new WebStorageStateStore({ store: sessionStorage }),
});`}</Code>
        <h3>Step 2: send the user to Cognito</h3>
        <Table
          head={['Button', 'Call']}
          rows={[
            ['Sign in', <code key="1">auth.signinRedirect()</code>],
            ['Create account', 'Same, with authorization_endpoint set to /signup'],
            ['Continue with Microsoft', <code key="3">{"auth.signinRedirect({ extraQueryParams: { identity_provider: 'Microsoft' } })"}</code>],
            ['Work email → straight to the company SSO', <code key="4">{"extraQueryParams: { idp_identifier: 'company.com' }"}</code>],
            ['Always show the login page (switch account)', <code key="5">{"auth.signinRedirect({ prompt: 'login' })"}</code>],
          ]}
        />
        <h3>Step 3: the callback page</h3>
        <Code>{`// /callback: run ONCE (React StrictMode runs effects twice; a code can only be used once)
const qs = new URLSearchParams(location.search);
if (qs.get('error')) show(qs.get('error_description'));    // e.g. sign-up refused by a trigger
else {
  try { const user = await auth.signinRedirectCallback(); /* user.access_token, user.id_token */ }
  catch (e) { show(e.message); }  // a pre-token refusal arrives here, at the token exchange
}`}</Code>
        <h3>Step 4: sign out</h3>
        <Code>{`await auth.revokeTokens(['refresh_token']);
await auth.removeUser();
location.assign(\`\${LOGIN_DOMAIN}/logout?client_id=\${APP_CLIENT_ID}&logout_uri=\${encodeURIComponent(origin + '/')}\`);
// /logout clears Cognito's session cookie; without it the next sign-in skips the login page`}</Code>
        <h3>Custom fields (e.g. Affiliation)</h3>
        <p>
          The hosted sign-up page can't ask for them. After the first sign-in, check the field with <code>GetUser</code>.
          If it's empty, show a "Complete your profile" step that saves it with <code>UpdateUserAttributes</code>, and block
          the app until it's done.
        </p>
      </Section>

      <Section id="own" title="4. Our own pages">
        <p>
          Our pages call the Cognito user pools API from the browser. These calls need no AWS credentials: they are a plain{' '}
          <code>POST</code> to <code>https://cognito-idp.&lt;region&gt;.amazonaws.com/</code> with the action in a header.
        </p>
        <Code>{`async function cognito(action, body) {
  const r = await fetch(\`https://cognito-idp.\${REGION}.amazonaws.com/\`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1',
               'x-amz-target': \`AWSCognitoIdentityProviderService.\${action}\` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw { code: data.__type?.split('#').pop(), message: data.message };
  return data;
}`}</Code>
        <Table
          head={['Screen', 'Calls', 'Notes']}
          rows={[
            ['Register', <code key="1">SignUp</code>, 'ClientId, Username (email), Password, UserAttributes: email, given_name, family_name, custom fields'],
            ['Verify email', <span key="2"><code>ConfirmSignUp</code>, <code>ResendConfirmationCode</code></span>, '6-digit code, valid 24 hours. Add your own resend cooldown on the page'],
            ['Sign in with password', 'SRP via amazon-cognito-identity-js (authenticateUser)', 'Only a proof of the password is sent, never the password itself'],
            ['Sign in with an email code', <span key="4"><code>InitiateAuth</code> (USER_AUTH, PREFERRED_CHALLENGE=EMAIL_OTP) → <code>RespondToAuthChallenge</code> (EMAIL_OTP_CODE)</span>, '8-digit code. Keep the Session value between the two calls'],
            ['Forgot password', <span key="5"><code>ForgotPassword</code> → <code>ConfirmForgotPassword</code></span>, '6-digit code, valid 1 hour'],
            ['Continue with Microsoft', 'Redirect, as for hosted pages (identity_provider=Microsoft)', 'Microsoft sign-in always goes through Cognito’s domain'],
            ['Edit profile', <code key="7">UpdateUserAttributes</code>, 'With the access token'],
            ['Sign out', <code key="8">RevokeToken</code>, 'Revokes the refresh token; there is no Cognito cookie to clear'],
          ]}
        />
        <ul>
          <li><b>Validate on the page too:</b> required fields, matching passwords, password rules. Cognito re-checks everything.</li>
          <li><b>One message for a wrong email or wrong password</b>, so the page can't be used to find which accounts exist.</li>
          <li><b>Never log</b> passwords, codes or tokens. Don't send the password to your own backend.</li>
          <li><b>Each app client signs in separately:</b> there is no single sign-on between apps on our own pages.</li>
        </ul>
      </Section>

      <Section id="tokens" title="5. After sign-in: tokens and the API">
        <Table
          head={['Token', 'Use it for', 'Lifetime']}
          rows={[
            ['ID token', 'Showing the user’s name and email in the app. Never send it to APIs', '60 min'],
            ['Access token', <span key="a">Every API call: <code>Authorization: Bearer &lt;access token&gt;</code></span>, '60 min'],
            ['Refresh token', 'Getting new tokens without signing in again (refresh flow)', 'Set by DevOps (1 day in the demo)'],
          ]}
        />
        <h3>Verify tokens in every API</h3>
        <Code>{`import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({ userPoolId: POOL_ID, tokenUse: 'access', clientId: ALLOWED_CLIENT_IDS });

const claims = await verifier.verify(bearerToken);        // invalid or expired → 401
if (claims.tenant_id !== requestedTenantId) return 403;   // wrong tenant → 403
if (needsAdmin && claims.role !== 'admin') return 403;`}</Code>
        <ul>
          <li>Decoding a token in the browser is fine for display. <b>Only the API's verification counts.</b></li>
          <li>Tenant and role come from the token (set by the pre-token trigger), never from the request body or URL alone.</li>
          <li>Without a pre-token trigger, use <code>cognito:groups</code> (e.g. <code>tenant_acme</code>) and <code>client_id</code> from the access token instead.</li>
        </ul>
      </Section>

      <Section id="lambda" title="6. Writing Lambda triggers">
        <p>
          A trigger is a function Cognito runs during sign-up or sign-in. Return the event to allow; <b>throw an error to
          refuse</b>. Cognito shows your message, prefixed, e.g. <i>"PreSignUp failed with error Affiliation is required."</i>
        </p>
        <h3>Example: make a custom field mandatory (pre sign-up)</h3>
        <Code>{`import type { PreSignUpTriggerEvent } from 'aws-lambda';

export const handler = async (event: PreSignUpTriggerEvent) => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;      // skip Microsoft and admin-created users
  const value = (event.request.userAttributes['custom:affiliation'] ?? '').trim();
  if (!value) throw new Error('Affiliation is required.');
  return event;
};`}</Code>
        <h3>Example: add claims and refuse non-members (pre token generation V2)</h3>
        <Code>{`import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';
const APPS = JSON.parse(process.env.TENANT_APPS ?? '{}');           // clientId → { tenantId, app }; parsed once

export const handler = async (event: PreTokenGenerationV2TriggerEvent) => {
  const app = APPS[event.callerContext.clientId];
  if (!app) return event;
  const groups = event.request.groupConfiguration.groupsToOverride ?? [];
  if (!groups.includes(\`tenant_\${app.tenantId}\`)) throw new Error('This account does not have access to this tenant.');
  const claims = { tenant_id: app.tenantId, app: app.app };
  event.response = { claimsAndScopeOverrideDetails: {
    idTokenGeneration: { claimsToAddOrOverride: claims },
    accessTokenGeneration: { claimsToAddOrOverride: claims },
  } };
  return event;
};`}</Code>
        <h3>Best practices</h3>
        <Table
          head={['Do', 'Why']}
          rows={[
            ['One small function per trigger, in TypeScript with types from @types/aws-lambda', 'Easy to read, test and review'],
            [<span key="1">Check <code>triggerSource</code> and <code>callerContext.clientId</code></span>, 'The same trigger runs for every app and for sign-up, admin-created and Microsoft users'],
            ['Finish well under 5 seconds: settings in environment variables, parse once outside the handler', 'Cognito fails the sign-in after about 5 seconds'],
            ['If you must read a database: one key lookup, cached in memory', 'Triggers run on every sign-up or token issue'],
            ['Clear, user-facing error messages; generic ones where they could reveal accounts', 'The message is shown on the page'],
            ['Never log passwords, codes or tokens', 'Logs are kept in CloudWatch'],
            ['Return the same event object; don’t remove fields', 'Cognito expects its own shape back'],
            ['Unit-test with sample events, offline (node:test)', 'No AWS needed; see tests/pre-signup.test.ts'],
            ['Bundle with esbuild, deploy by script or IaC, never by editing in the console', 'Repeatable and reviewed'],
          ]}
        />
        <Note>
          Attaching a trigger to an existing pool uses <code>UpdateUserPool</code>, which <b>resets every setting you don't send</b>.
          Read the current settings first and send them back with your change, or use IaC. The demo script does this in{' '}
          <code>updatePool()</code>.
        </Note>
      </Section>

      <Section id="errors" title="7. Errors you will see">
        <Table
          head={['Error', 'Meaning', 'What to show or do']}
          rows={[
            [<code key="1">UsernameExistsException</code>, 'The email is already registered', '"An account with this email already exists. Sign in instead."'],
            [<code key="2">InvalidPasswordException</code>, 'Password breaks the pool’s rules', 'Show Cognito’s reason'],
            [<code key="3">UserLambdaValidationException</code>, 'A trigger refused (pre sign-up, pre-token)', 'Show the message after the "failed with error" prefix'],
            [<code key="4">CodeMismatchException</code>, 'Wrong code', '"That code is not right."'],
            [<code key="5">ExpiredCodeException</code>, 'Code expired', 'Offer "Send a new code"'],
            [<code key="6">NotAuthorizedException</code>, 'Wrong password, or account disabled', '"Incorrect email or password." / "This account is deactivated."'],
            [<code key="7">UserNotConfirmedException</code>, 'Email not verified yet', 'Go to the verify-email screen'],
            [<code key="8">LimitExceededException</code>, 'Too many attempts', '"Please wait a few minutes."'],
            [<code key="9">redirect_mismatch</code>, 'Callback URL not on the app client', 'Ask DevOps to add the exact URL'],
            [<code key="10">AADSTS500113</code>, 'Redirect URI missing in Microsoft Entra', 'Ask the Entra admin to add the login domain’s /oauth2/idpresponse'],
          ]}
        />
      </Section>

      <Section id="repo" title="8. Where things are in this repo">
        <Table
          head={['File', 'What it shows']}
          rows={[
            [<code key="1">frontend/src/demo/demoLib.ts</code>, 'Hosted sign-in, callback, our-own-page API calls, sessions, sign-out'],
            [<code key="2">frontend/src/demo/OwnRegister.tsx</code>, 'Registration page with all fields and email verification'],
            [<code key="3">frontend/src/demo/OwnSignIn.tsx</code>, 'Password, email code, Microsoft and work-email sign-in'],
            [<code key="4">frontend/src/ownAuth.ts</code>, 'SRP password sign-in, MFA and forgot-password steps'],
            [<code key="5">lambda/pre-signup.ts</code>, 'Pre sign-up trigger: mandatory Affiliation, tenant check'],
            [<code key="6">lambda/demo-pre-token.ts</code>, 'Pre-token trigger: tenant membership and claims'],
            [<code key="7">lambda/demo-tenant-api.ts</code>, 'API token verification: 401 / 403 rules'],
            [<code key="8">tests/*.test.ts</code>, 'Offline tests for the triggers (npm test)'],
            [<code key="9">scripts/signup-demo.ts</code>, 'Creates the pool, clients, triggers and branding (DevOps)'],
          ]}
        />
        <Code>{`npm run api                      # API on http://localhost:8787
npm --prefix frontend run dev    # app on http://localhost:5173/demo
npm test                         # offline tests`}</Code>
      </Section>
    </main>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <pre className="guide-code"><code>{children}</code></pre>;
}
