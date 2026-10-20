import { useEffect } from 'react';
import { applyTheme } from '../lib';
import { Note, Section, Table } from './DevOpsGuide';

/** /demo/architecture: one-page overview for managers: diagram, what each part does, scenarios, limits */
export function ArchitecturePage() {
  useEffect(() => {
    applyTheme(null);
    document.title = 'Architecture · Cognito sign-up and login';
  }, []);

  return (
    <main className="demo guide arch">
      <a className="bf-demo-link" href="/demo">← Demo overview</a>
      <header className="demo-head">
        <p className="eyebrow">Amazon Cognito · Architecture overview</p>
        <h1>How sign-up and login work</h1>
        <p className="muted">
          People register and sign in on a login page. Amazon Cognito checks who they are and gives the app a signed
          pass (a token) that says who the person is and which company (tenant) they belong to. Our API only returns data
          for the tenant on that pass.
        </p>
      </header>

      <section className="guide-section">
        <h2>The big picture</h2>
        <Diagram />
        <ol className="arch-steps">
          <li><b>Open the app.</b> The person chooses Sign in or Create account.</li>
          <li><b>Login page.</b> Either Cognito's own page, styled with our brand, or our own page in the app.</li>
          <li><b>Cognito checks them:</b> password, emailed code, passkey or Microsoft work account.</li>
          <li><b>Our rules run:</b> required fields filled in, and the person belongs to this tenant.</li>
          <li><b>Cognito gives the app a pass (token)</b> with the person's tenant and role.</li>
          <li><b>The app calls our API with the pass.</b> The API checks it and returns only that tenant's data.</li>
        </ol>
      </section>

      <Section id="parts" title="What each part is for">
        <Table
          head={['Part', 'What it does', 'Why we need it']}
          rows={[
            ['Cognito user pool', 'Stores everyone’s account and password, sends codes, checks sign-ins', 'We never store or handle passwords ourselves'],
            ['Apps (app clients)', 'One entry per product, e.g. Submissions, Reviews, Reports, for each tenant', 'Each app gets its own login page and its own passes'],
            ['Tenants (groups)', 'Which company a person belongs to', 'Keeps one company’s users and data away from another'],
            ['Cognito hosted pages', 'Ready-made login and sign-up pages run by AWS, with our logo, colours and image', 'Fast to launch; AWS keeps them secure'],
            ['Our own pages', 'Login and sign-up pages we build ourselves', 'Our exact design, wording and extra fields (e.g. Affiliation)'],
            ['Microsoft sign-in', 'Staff sign in with their company Microsoft account', 'No extra password; the company controls access'],
            ['Rules (Lambda)', 'Two small checks Cognito runs during sign-up and sign-in', 'Required fields, and “this person belongs to this tenant”'],
            ['Email', 'Sends the 6-digit and 8-digit codes', 'Proves the person owns the email address'],
            ['Our API', 'Returns data only when the pass is valid and for the right tenant', 'Second line of protection between tenants'],
            ['Settings database', 'Remembers which app belongs to which tenant, plus branding', 'Add a tenant or app without changing code'],
          ]}
        />
      </Section>

      <Section id="pages" title="Two kinds of login pages">
        <Table
          head={['', 'Cognito hosted pages', 'Our own pages']}
          rows={[
            ['Look', 'Our logo, colours and image; Cognito’s wording', 'Exactly our design'],
            ['Extra sign-up fields (Affiliation)', 'Asked after the first sign-in', 'On the sign-up form'],
            ['Sign in once, use every app (single sign-on)', 'Yes', 'No, each app signs in'],
            ['Passkeys, password reset, MFA screens', 'Built in', 'We build them'],
            ['Effort and security', 'Low effort; AWS secures the page', 'More effort; we secure the page'],
          ]}
        />
      </Section>

      <Section id="scenarios" title="Scenarios covered (tested on real Cognito)">
        <Table
          head={['Scenario', 'Hosted pages', 'Our own pages']}
          rows={[
            ['Create an account (email, first name, last name, password + confirm)', 'Yes', 'Yes'],
            ['Required Affiliation field', 'After first sign-in', 'Yes, on the form'],
            ['Verify email with a 6-digit code', 'Yes', 'Yes'],
            ['Sign in with password', 'Yes', 'Yes'],
            ['Sign in with an emailed 8-digit code (no password)', 'Yes', 'Yes'],
            ['Sign in with Microsoft (company account)', 'Yes', 'Yes'],
            ['Type a work email → straight to Microsoft', 'Yes', 'Yes'],
            ['Sign in once, open the tenant’s other apps', 'Yes', 'No'],
            ['Join a tenant when registering', 'No', 'Yes'],
            ['Person from another tenant is refused', 'Yes', 'Yes'],
            ['API refuses another tenant’s data', 'Yes', 'Yes'],
            ['Forgot password', 'Yes', 'Not built yet'],
            ['Passkey (fingerprint / face)', 'Yes', 'Not built'],
            ['Switch to a different account after a refusal', 'Yes', 'Yes'],
          ]}
        />
      </Section>

      <Section id="limits" title="Limitations to know">
        <Table
          head={['Limitation', 'What it means', 'Way around it']}
          rows={[
            ['Fields are fixed when the pool is created', 'Required fields can’t be added or removed later', 'Agree the field list before creating the pool'],
            ['Hosted pages: fixed wording', 'Labels like “Given name” and “Sign up” can’t be changed', 'Use our own pages where wording matters'],
            ['Hosted pages: no extra fields', 'Affiliation can’t be on Cognito’s sign-up page', 'Ask for it after the first sign-in, or use our own pages'],
            ['Our own pages: no single sign-on', 'Each app asks the person to sign in', 'Use hosted pages, or accept separate sign-ins'],
            ['Code rules are fixed', 'Code length and expiry (24 h, 1 h) can’t change', 'Our own code service if exact rules are needed'],
            ['Email limits without SES', 'About 50 emails a day, sent from a generic AWS address', 'Amazon SES in production (about $0.10 per 1,000 emails)'],
            ['Sign-in code email wording', 'The 8-digit code email can’t be branded without SES', 'SES plus a message rule'],
            ['20 branded page styles per pool', 'At most 20 apps with their own hosted-page look in one pool', 'More pools, or our own pages'],
            ['Microsoft creates a separate account', 'The same email via password and via Microsoft = two accounts', 'Link accounts (extra rule, not built)'],
            ['One pool per region holds the users', 'An AWS region outage stops sign-in', 'Paid multi-region option, or accept AWS’s 99.9% target'],
          ]}
        />
      </Section>

      <Section id="production" title="Before production">
        <ul>
          <li><b>Separate user pools</b> for development, testing and production.</li>
          <li><b>Amazon SES</b> for email: our own sender address, no daily limit, branded emails.</li>
          <li><b>Our own login address</b> (e.g. login.company.com) with a certificate.</li>
          <li><b>Microsoft set-up per customer</b> by their IT: redirect address and allowed users.</li>
          <li><b>Everything set up by script</b>, so environments match and can be rebuilt.</li>
        </ul>
        <Note>
          <b>Cost:</b> Cognito charges per active user per month. The first 10,000 are free, then about $0.015 each, and
          Microsoft sign-ins have 50 free. The rules, database and email cost very little (a few dollars a month at most).
        </Note>
      </Section>
    </main>
  );
}

/** Hand-placed SVG: people → login pages → Cognito (with Microsoft, rules, email) → API → settings */
function Diagram() {
  return (
    <div className="arch-scroll">
      <svg className="arch-svg" viewBox="0 0 1120 640" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Sign-up and login architecture</title>
        <desc id="arch-desc">
          People use a login page, either Cognito hosted or our own. Cognito checks them with help from Microsoft, two rule
          functions and email, and returns a token. The app calls our API with the token; the API checks the tenant and reads
          settings from the database.
        </desc>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#475569" />
          </marker>
        </defs>

        {/* arrows first, so boxes sit on top */}
        <g fill="none" stroke="#475569" strokeWidth="2" markerEnd="url(#arr)">
          <path d="M160 270 C190 270 190 180 216 180" />
          <path d="M160 310 C190 310 190 380 216 380" />
          <path d="M440 180 L496 180" />
          <path d="M440 380 L496 380" />
          <path d="M820 85 L876 85" />
          <path d="M820 225 L876 225" />
          <path d="M820 365 L876 365" />
          <path d="M90 344 L90 560 L496 560" />
          <path d="M820 560 L876 560" />
        </g>
        <path d="M500 440 C420 470 200 470 120 346" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeDasharray="7 5" markerEnd="url(#arr)" />

        {/* arrow labels */}
        <g className="arch-label">
          <text x="468" y="170" textAnchor="middle">API calls</text>
          <text x="468" y="370" textAnchor="middle">redirect</text>
          <text x="848" y="75" textAnchor="middle">sign-in</text>
          <text x="848" y="215" textAnchor="middle">runs</text>
          <text x="848" y="355" textAnchor="middle">sends</text>
          <text x="300" y="548" textAnchor="middle">API call + token</text>
          <text x="848" y="550" textAnchor="middle">reads</text>
          <text x="290" y="478" textAnchor="middle" fill="#15803d">token (tenant + role)</text>
        </g>

        {/* 1. people */}
        <Box x={20} y={250} w={140} h={94} fill="#f8fafc" stroke="#334155" title="People" lines={['Browser or phone', 'using our apps']} />

        {/* 2. login pages */}
        <Box x={220} y={130} w={220} h={100} fill="#eff6ff" stroke="#2563eb" title="Our own pages" lines={['Our design + every field', 'Sign-up · sign-in · codes']} />
        <Box x={220} y={330} w={220} h={100} fill="#fff7ed" stroke="#ea580c" title="Cognito hosted pages" lines={['Run by AWS, our brand', 'Sign-up · sign-in · passkeys']} />

        {/* 3. cognito */}
        <rect x={500} y={40} width={320} height={420} rx={14} fill="#f0fdf4" stroke="#16a34a" strokeWidth={2.5} />
        <text x={660} y={72} textAnchor="middle" className="arch-title">Cognito user pool</text>
        {[
          ['Accounts & passwords', 'stored by AWS, not by us'],
          ['Fields', 'email · first · last name · Affiliation · tenant'],
          ['Apps (app clients)', '3 per tenant, each with its own login page'],
          ['Tenants (groups)', 'which company each person belongs to'],
          ['Sign-in options', 'password · email code · passkey · MFA'],
          ['Session (1 hour)', 'single sign-on on hosted pages'],
        ].map(([t, s], i) => (
          <g key={t}>
            <rect x={520} y={90 + i * 58} width={280} height={48} rx={8} fill="#ffffff" stroke="#bbf7d0" />
            <text x={534} y={110 + i * 58} className="arch-chip">{t}</text>
            <text x={534} y={127 + i * 58} className="arch-sub">{s}</text>
          </g>
        ))}

        {/* right: helpers */}
        <Box x={880} y={40} w={220} h={90} fill="#f5f3ff" stroke="#7c3aed" title="Microsoft sign-in" lines={['Company work accounts', '(Entra ID)']} />
        <Box x={880} y={160} w={220} h={130} fill="#fefce8" stroke="#ca8a04" title="Rules (2 Lambdas)" lines={['Sign-up: required fields,', 'join only this tenant', 'Sign-in: must belong to', 'tenant · add tenant + role']} />
        <Box x={880} y={320} w={220} h={90} fill="#fdf2f8" stroke="#db2777" title="Email" lines={['6-digit and 8-digit codes', 'Production: Amazon SES']} />

        {/* bottom: api + settings */}
        <Box x={500} y={520} w={320} h={80} fill="#f8fafc" stroke="#334155" title="Our API" lines={['Checks the token, then returns only', 'that tenant’s data (other tenant = refused)']} />
        <Box x={880} y={520} w={220} h={80} fill="#f8fafc" stroke="#334155" title="Settings database" lines={['App → tenant, branding', 'DynamoDB (or RDS)']} />

        {/* numbered steps */}
        {[
          [90, 232, 1],
          [330, 280, 2],
          [540, 67, 3],
          [848, 260, 4],
          [210, 455, 5],
          [470, 575, 6],
        ].map(([x, y, n]) => (
          <g key={n}>
            <circle cx={x} cy={y} r={13} fill="#0f172a" />
            <text x={x} y={y + 4.5} textAnchor="middle" className="arch-num">{n}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Box({ x, y, w, h, fill, stroke, title, lines }: { x: number; y: number; w: number; h: number; fill: string; stroke: string; title: string; lines: string[] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={2} />
      <text x={x + 14} y={y + 26} className="arch-title">{title}</text>
      {lines.map((l, i) => (
        <text key={l} x={x + 14} y={y + 48 + i * 18} className="arch-sub">{l}</text>
      ))}
    </g>
  );
}
