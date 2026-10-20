import { useEffect, type ReactNode } from 'react';
import { applyTheme } from '../lib';

/** /demo/guide: what DevOps must decide and prepare before creating a Cognito user pool for these flows */
const SECTIONS = [
  ['fields', '1. Decide the fields first'],
  ['lambda', '2. When you need a Lambda'],
  ['assets', '3. Assets for the hosted login pages'],
  ['database', '4. Why a database (DynamoDB or RDS)'],
  ['setup', '5. Other things to prepare'],
  ['checklist', '6. Checklist before go-live'],
] as const;

export function DevOpsGuide() {
  useEffect(() => {
    applyTheme(null);
    document.title = 'DevOps guide · Cognito sign-up and login';
  }, []);

  return (
    <main className="demo guide">
      <a className="bf-demo-link" href="/demo">← Demo overview</a>
      <header className="demo-head">
        <p className="eyebrow">Amazon Cognito · DevOps guide</p>
        <h1>Before you create the user pool</h1>
        <p className="muted">
          For setting up Cognito for registration and login, with Cognito's hosted pages or our own pages. Some pool settings
          can never be changed after creation, so read sections 1 and 5 before creating anything.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Sections">
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`}>{title}</a>
        ))}
      </nav>

      <Section id="fields" title="1. Decide the fields first">
        <p>
          <b>Fields are fixed when the pool is created.</b> If a field is missing or wrongly marked as required, the only
          fix is a new pool, and users have to be moved to it.
        </p>
        <h3>Login identifier: pick one, can't change later</h3>
        <ul>
          <li><b>Email</b> as the username (what we use). Turn on <i>case-insensitive</i> usernames.</li>
          <li>Or phone number, or a username with email or phone as extra sign-in options.</li>
        </ul>
        <h3>Standard fields (Cognito's built-in list)</h3>
        <p>
          <code>email</code>, <code>given_name</code>, <code>family_name</code>, <code>name</code>, <code>middle_name</code>, <code>nickname</code>,{' '}
          <code>preferred_username</code>, <code>phone_number</code>, <code>birthdate</code>, <code>gender</code>, <code>address</code>,{' '}
          <code>website</code>, <code>profile</code>, <code>picture</code>, <code>locale</code>, <code>zoneinfo</code>, <code>updated_at</code>.
        </p>
        <h3>Custom fields</h3>
        <p>Anything else, such as Affiliation or tenant ID, is a custom field: <code>custom:&lt;name&gt;</code>.</p>
        <Table
          head={['Rule', 'Standard field', 'Custom field']}
          rows={[
            ['Can be required', 'Yes, only at pool creation', 'No, never'],
            ['Shown on the hosted sign-up page', 'Only if required', 'Never'],
            ['Label on the hosted page', 'Fixed by Cognito, e.g. "Given name"', 'Not shown'],
            ['Add later', 'No', 'Yes (max 50 per pool)'],
            ['Delete or rename later', 'No', 'No'],
            ['Editable after sign-up', 'Yes', 'Only if created as mutable'],
          ]}
        />
        <h3>Our values</h3>
        <Table
          head={['Field', 'Type', 'Why']}
          rows={[
            [<code key="e">email</code>, 'Standard, required', 'Login name; verified with a 6-digit code'],
            [<code key="g">given_name</code>, 'Standard, required', 'First name on the sign-up page'],
            [<code key="f">family_name</code>, 'Standard, required', 'Last name on the sign-up page'],
            [<code key="a">custom:affiliation</code>, 'Custom, mutable, max 500', 'Collected on our page, or after the first sign-in on hosted pages'],
            [<code key="t">custom:tenant_id</code>, 'Custom, immutable, max 64', 'Tenant chosen at registration; can never be changed by the user'],
          ]}
        />
        <Note>
          Every required field must also come from Microsoft (attribute mapping), or Cognito refuses to save the Microsoft
          sign-in settings. Keep the required list short: email, first name and last name.
        </Note>
      </Section>

      <Section id="lambda" title="2. When you need a Lambda">
        <p>
          <b>No Lambda is needed</b> for sign-up, email verification, password or email-code sign-in, passkeys, MFA,
          Microsoft sign-in, single sign-on or password reset. Add one only when you need one of these rules:
        </p>
        <Table
          head={['You need…', 'Lambda trigger', 'Used in this demo']}
          rows={[
            ['A custom field to be mandatory (e.g. Affiliation)', 'Pre sign-up', 'Yes'],
            ['Registration to join only the app’s own tenant', 'Pre sign-up', 'Yes'],
            ['tenant_id / role claims in tokens, and other tenants refused at sign-in', 'Pre token generation (V2, needs Essentials)', 'Yes'],
            ['Block a sign-in by your own rule before the password is checked', 'Pre authentication', 'No'],
            ['Link a Microsoft login to an existing password account', 'Pre sign-up (calls AdminLinkProviderForUser)', 'No'],
            ['Welcome email, or create the user in your own database', 'Post confirmation', 'No'],
            ['Your own email wording per tenant, branded sign-in code email', 'Custom message (needs Amazon SES)', 'No'],
            ['Move users from an old system without a password reset', 'User migration', 'No'],
            ['Magic links or your own challenge (not on hosted pages)', 'Define / Create / Verify auth challenge', 'No'],
          ]}
        />
        <h3>Lambda settings</h3>
        <ul>
          <li>Same AWS region as the user pool.</li>
          <li><b>Timeout 5 seconds:</b> Cognito waits about 5 seconds and then fails the sign-in. Avoid slow calls inside triggers.</li>
          <li>Resource permission: <code>lambda:InvokeFunction</code> for principal <code>cognito-idp.amazonaws.com</code>, scoped to your account.</li>
          <li>The execution role must allow writing to CloudWatch logs, plus anything the function calls, e.g. <code>cognito-idp:AdminLinkProviderForUser</code>.</li>
          <li>Keep settings in environment variables or a fast lookup. A trigger runs on every sign-up or token issue.</li>
        </ul>
        <Note>Without Lambdas the same rules must live in your backend and every API. That's possible, but more code to keep consistent.</Note>
      </Section>

      <Section id="assets" title="3. Assets for the hosted login pages">
        <p>
          Cognito's hosted pages (managed login) are styled with a <b>branding style</b>: images plus colours. There's one
          style per app client, and a maximum of <b>20 styles per pool</b>.
        </p>
        <Table
          head={['Asset', 'Formats', 'Notes']}
          rows={[
            ['Form logo (above the form)', 'SVG, PNG, JPEG', <span key="l">Shape between <b>1:1 and 4:1</b> (width : height). Wider logos are rejected and the page falls back to Cognito's default look. SVG recommended.</span>],
            ['Page background', 'PNG, JPEG, SVG', <span key="b">Stretched to fill the screen and cropped at the edges. Design at <b>1920 × 1200</b>, keep important artwork away from the edges, and fill extra space with a solid colour.</span>],
            ['Favicon', 'ICO or SVG', 'Browser tab icon'],
            ['Header / footer logo and background', 'SVG, PNG, JPEG', 'Optional'],
            ['Microsoft / other provider button icon', 'ICO or SVG', 'Optional'],
            ['Colours', <span key="c">Hex <code>RRGGBBAA</code></span>, 'Primary button, page, form, links; light and dark mode'],
            ['Terms of use and privacy policy', 'Two URLs per app client', 'Shown as one fixed sentence on the sign-up page'],
          ]}
        />
        <ul>
          <li><b>Text can't be changed</b> ("Sign in", "Given name"). Only translated, with <code>?lang=</code> (12 languages).</li>
          <li>Each branding API request is limited to <b>2 MB</b>. Keep images small: SVG, or JPEG under about 300 KB.</li>
          <li>
            <b>App clients created by script or API have no style</b>, so their hosted page doesn't work until you create one
            (<code>CreateManagedLoginBranding</code>). The console adds one automatically; scripts must do it themselves.
          </li>
          <li>Changes appear within a few minutes; no deploy is needed.</li>
        </ul>
      </Section>

      <Section id="database" title="4. Why a database (DynamoDB or RDS)">
        <p>
          <b>Cognito stores the users and passwords.</b> The database stores <b>our settings</b>: which app client belongs
          to which tenant, the branding, and the single sign-on domains. The web app and the API read it at runtime, so
          adding a tenant or app is a new row, not a code release.
        </p>
        <Table
          head={['', 'DynamoDB (this demo)', 'RDS / Postgres (fine if you already run it)']}
          rows={[
            ['Running cost', 'Free at this size; no server', 'An instance running all the time'],
            ['Read by the web app and API', 'Yes', 'Yes'],
            ['Read by Lambda triggers', 'Easy: no network setup, millisecond reads', 'Needs VPC access and RDS Proxy (connection limits); keep reads fast because of the 5 s trigger timeout'],
            ['Good for', 'Key lookups (client ID → tenant)', 'Rich data you already keep there (profiles, orders)'],
          ]}
        />
        <Note>
          Never store passwords or verification codes in your database. In this demo the Lambdas read their settings from
          environment variables, so only the web app and the API read the database.
        </Note>
      </Section>

      <Section id="setup" title="5. Other things to prepare">
        <Table
          head={['Item', 'What to do', 'Why']}
          rows={[
            [<b key="1">Separate pool per environment</b>, 'One pool each for dev, staging and production', 'Test users and settings never touch real ones'],
            [<b key="2">Email sending</b>, 'Production: Amazon SES with a verified domain (SPF/DKIM), and a request to leave the SES sandbox', 'Cognito’s built-in sender allows only about 50 emails a day and sends from no-reply@verificationemail.com'],
            [<b key="3">Login domain</b>, 'Prefix domain (*.amazoncognito.com) or your own, e.g. login.yourcompany.com. Your own needs an ACM certificate in us-east-1 and a DNS record', 'Decide before launch: passkeys are tied to this domain'],
            [<b key="4">Callback and logout URLs</b>, 'List every environment exactly, e.g. https://app.example.com/demo/callback (max 100 per app client)', 'Any mismatch fails sign-in with "redirect_mismatch"'],
            [<b key="5">App client settings</b>, 'Public client (no secret) for browser apps; flows ALLOW_USER_AUTH, ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH; "Prevent user existence errors" on', 'Safe browser sign-in; no account probing'],
            [<b key="6">Attribute permissions</b>, 'Per app client: which fields it can read and write. Never let users write tenant or role fields', 'Otherwise a user could move themselves to another tenant'],
            [<b key="7">Token lifetimes</b>, 'Access and ID tokens 60 min; refresh token per your session policy; sign-in session 3–15 min', 'Shorter = safer; refresh keeps users signed in'],
            [<b key="8">Microsoft Entra</b>, 'App registration per directory; add the redirect URI https://<domain>/oauth2/idpresponse; note the secret expiry date; set "Assignment required" to limit users', 'Without the redirect URI Microsoft fails with AADSTS500113'],
            [<b key="9">Feature plan</b>, 'Essentials (managed login, passwordless, passkeys, token claims). Plus adds threat protection at $0.02 per user', 'Lite has none of these'],
            [<b key="10">Quotas</b>, '1,000 pools per region; 120 sign-ins/s per account; 20 branding styles per pool. Request increases early', 'Limits are shared across the whole AWS account'],
            [<b key="11">Security</b>, 'Deletion protection on; least-privilege IAM; tag every resource; optional AWS WAF on the pool', 'A deleted pool can’t be restored'],
            [<b key="12">Monitoring</b>, 'CloudWatch log retention for each Lambda; CloudTrail for admin changes', 'Find failed sign-ups and who changed settings'],
            [<b key="13">Backup and exit</b>, 'Keep all settings as code (script or CDK), never only in the console. Users can be exported, but password hashes can’t', 'Rebuild a pool exactly; plan migrations'],
            [<b key="14">Secrets</b>, 'Microsoft client secret in a secret store, never in git; rotate before it expires', 'Expired secret = Microsoft sign-in stops'],
            [<b key="15">Cost</b>, 'Billed per monthly active user: first 10,000 free on Essentials, then $0.015; Microsoft users: first 50 free', 'Pools, app clients and branding are free'],
          ]}
        />
      </Section>

      <Section id="checklist" title="6. Checklist before go-live">
        <ol className="guide-check">
          <li>Login identifier, required fields and custom fields written down and agreed.</li>
          <li>Each Lambda trigger listed with its reason, or a decision to do without.</li>
          <li>Logo (1:1 to 4:1), background (1920 × 1200), favicon and colours ready for each app.</li>
          <li>Database for app and tenant settings chosen (DynamoDB, or your existing RDS).</li>
          <li>One pool per environment; callback and logout URLs for each.</li>
          <li>SES domain verified and out of the sandbox (production).</li>
          <li>Login domain chosen; certificate ready if it's your own domain.</li>
          <li>Microsoft app registration with redirect URIs, secret stored and its expiry noted.</li>
          <li>Attribute permissions set: no user-writable tenant or role fields.</li>
          <li>Deletion protection, log retention and tags on; quotas checked.</li>
          <li>Everything created by script or IaC, and re-runnable.</li>
        </ol>
        <p className="muted small">
          In this repository the demo pool is created by <code>npm run signup-demo</code>, which follows this guide and is
          safe to re-run.
        </p>
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="guide-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="table-scroll">
      <table className="guide-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="guide-note">{children}</p>;
}
