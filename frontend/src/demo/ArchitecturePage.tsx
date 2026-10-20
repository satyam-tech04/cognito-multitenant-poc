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

      <section className="guide-section">
        <h2>Step by step: what happens, and when</h2>
        <p className="muted">
          Read top to bottom. Each column is one part of the system; each arrow is one step. Red markers show where a
          request can be refused.
        </p>
        <Sequence />
        <Table
          head={['Where it can be refused', 'Why', 'What the person sees']}
          rows={[
            ['Step 3 · sign-up rule', 'Affiliation missing, or joining another tenant', 'The reason on the sign-up form'],
            ['Step 7 · code check', 'Wrong or expired code', '"That code is not right" / "Send a new code"'],
            ['Step 10 · password or code check', 'Wrong password or code; account deactivated', '"Incorrect email or password"'],
            ['Step 12 · sign-in rule', 'Person is not a member of this tenant', '"This account does not have access to …"'],
            ['Step 16 · API check', 'Pass is for another tenant, expired or fake', 'No data (403 or 401)'],
          ]}
        />
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

/** Sequence diagram: who talks to whom, in order, across registration, sign-in, use and a second app */
const LANES = [
  { id: 'person', x: 215, title: 'Person', color: '#334155', fill: '#f8fafc' },
  { id: 'page', x: 385, title: 'Login page / app', color: '#2563eb', fill: '#eff6ff' },
  { id: 'cognito', x: 575, title: 'Cognito', color: '#16a34a', fill: '#f0fdf4' },
  { id: 'rules', x: 760, title: 'Rules (Lambda)', color: '#ca8a04', fill: '#fefce8' },
  { id: 'email', x: 910, title: 'Email', color: '#db2777', fill: '#fdf2f8' },
  { id: 'ms', x: 1045, title: 'Microsoft', color: '#7c3aed', fill: '#f5f3ff' },
  { id: 'api', x: 1190, title: 'Our API', color: '#334155', fill: '#f8fafc' },
] as const;
type Lane = (typeof LANES)[number]['id'];
const laneX = (id: Lane) => LANES.find((l) => l.id === id)!.x;

type Row =
  | { kind: 'phase'; y: number; title: string; note: string }
  | { kind: 'msg'; y: number; n: number; from: Lane; to: Lane; label: string; back?: boolean; refuse?: boolean; color?: string }
  | { kind: 'self'; y: number; n: number; lane: Lane; label: string; refuse?: boolean };

const ROWS: Row[] = [
  { kind: 'phase', y: 96, title: 'A · Registration', note: 'once per person' },
  { kind: 'msg', y: 132, n: 1, from: 'person', to: 'page', label: 'Fills in the sign-up form' },
  { kind: 'msg', y: 166, n: 2, from: 'page', to: 'cognito', label: 'Create account (SignUp)' },
  { kind: 'msg', y: 200, n: 3, from: 'cognito', to: 'rules', label: 'Fields OK? Right tenant?', refuse: true },
  { kind: 'msg', y: 234, n: 4, from: 'cognito', to: 'email', label: 'Send 6-digit code' },
  { kind: 'msg', y: 268, n: 5, from: 'email', to: 'person', label: 'Code arrives in the inbox', back: true },
  { kind: 'msg', y: 302, n: 6, from: 'person', to: 'page', label: 'Types the code' },
  { kind: 'msg', y: 336, n: 7, from: 'page', to: 'cognito', label: 'Confirm code → account active', refuse: true },

  { kind: 'phase', y: 376, title: 'B · Sign-in', note: 'each time a session starts' },
  { kind: 'msg', y: 412, n: 8, from: 'person', to: 'page', label: 'Signs in' },
  { kind: 'msg', y: 446, n: 9, from: 'cognito', to: 'ms', label: 'Microsoft users only: sign in at Microsoft', color: '#7c3aed' },
  { kind: 'msg', y: 480, n: 10, from: 'page', to: 'cognito', label: 'Check password or code', refuse: true },
  { kind: 'msg', y: 514, n: 11, from: 'cognito', to: 'rules', label: 'Member of this tenant?' },
  { kind: 'msg', y: 548, n: 12, from: 'rules', to: 'cognito', label: 'Add tenant_id + role', back: true, refuse: true },
  { kind: 'msg', y: 582, n: 13, from: 'cognito', to: 'page', label: 'Pass (tokens) for this app', back: true, color: '#15803d' },

  { kind: 'phase', y: 622, title: 'C · Using the app', note: 'every request' },
  { kind: 'msg', y: 658, n: 14, from: 'page', to: 'api', label: 'Request + pass (access token)' },
  { kind: 'self', y: 692, n: 15, lane: 'api', label: 'Check signature, expiry, tenant' },
  { kind: 'msg', y: 726, n: 16, from: 'api', to: 'page', label: 'Data for this tenant only (other tenant = refused)', back: true, refuse: true },

  { kind: 'phase', y: 766, title: 'D · Second app', note: 'same tenant' },
  { kind: 'msg', y: 802, n: 17, from: 'page', to: 'cognito', label: 'Session reused (hosted)' },
  { kind: 'msg', y: 836, n: 18, from: 'cognito', to: 'rules', label: 'Same tenant check again' },
  { kind: 'msg', y: 870, n: 19, from: 'cognito', to: 'page', label: 'Pass for the second app', back: true, color: '#15803d' },
];

function Sequence() {
  const H = 940;
  return (
    <div className="arch-scroll">
      <svg className="arch-svg seq" viewBox={`0 0 1280 ${H}`} role="img" aria-labelledby="seq-title seq-desc">
        <title id="seq-title">Step-by-step sequence</title>
        <desc id="seq-desc">
          Registration: the form goes to Cognito, the sign-up rule checks fields and tenant, Cognito emails a code and the
          code confirms the account. Sign-in: Cognito checks the password, code or Microsoft account, the sign-in rule
          checks the tenant and adds claims, and Cognito returns tokens. Using the app: the app calls our API with the
          access token and gets only its tenant's data. A second app reuses Cognito's session on hosted pages.
        </desc>
        <defs>
          <marker id="sq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>

        {/* phase bands */}
        {ROWS.filter((r): r is Extract<Row, { kind: 'phase' }> => r.kind === 'phase').map((p, i, all) => {
          const end = all[i + 1]?.y ?? H - 30;
          return (
            <g key={p.title}>
              <rect x={8} y={p.y - 14} width={1264} height={end - p.y + 4} rx={10} fill={i % 2 ? '#ffffff' : '#f8fafc'} stroke="#e2e8f0" />
              <text x={22} y={p.y + 14} className="seq-phase">{p.title}</text>
              <text x={22} y={p.y + 32} className="arch-sub">{p.note}</text>
            </g>
          );
        })}

        {/* lane headers and lifelines */}
        {LANES.map((l) => (
          <g key={l.id}>
            <line x1={l.x} y1={62} x2={l.x} y2={H - 30} stroke={l.color} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 5" />
            <rect x={l.x - 62} y={16} width={124} height={40} rx={9} fill={l.fill} stroke={l.color} strokeWidth={2} />
            <text x={l.x} y={41} textAnchor="middle" className="seq-lane">{l.title}</text>
          </g>
        ))}

        {/* messages */}
        {ROWS.map((r) => {
          if (r.kind === 'phase') return null;
          if (r.kind === 'self') {
            const x = laneX(r.lane);
            return (
              <g key={r.n}>
                <rect x={x - 186} y={r.y - 15} width={176} height={30} rx={6} fill="#ffffff" stroke="#334155" />
                <text x={x - 98} y={r.y + 4} textAnchor="middle" className="seq-msg">{r.label}</text>
                <Num x={x - 202} y={r.y} n={r.n} />
              </g>
            );
          }
          const x1 = laneX(r.from), x2 = laneX(r.to);
          const color = r.color ?? '#475569';
          const left = Math.min(x1, x2), right = Math.max(x1, x2);
          return (
            <g key={r.n}>
              <line x1={x1} y1={r.y} x2={x2 + (x2 > x1 ? -4 : 4)} y2={r.y} stroke={color} strokeWidth={2} strokeDasharray={r.back ? '6 4' : undefined} markerEnd="url(#sq)" />
              <text x={(left + right) / 2} y={r.y - 7} textAnchor="middle" className="seq-msg" fill={color}>{r.label}</text>
              <Num x={left - 16} y={r.y} n={r.n} />
              {r.refuse && <circle cx={right + 14} cy={r.y} r={5} fill="#dc2626" />}
            </g>
          );
        })}

        {/* footnotes inside the drawing */}
        <text x={22} y={H - 8} className="arch-sub">
          Step 17 on our own pages is a new sign-in (no shared session). After 60 minutes the app swaps its refresh token for a new pass and steps 11–13 run again.
        </text>
      </svg>
    </div>
  );
}

function Num({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} fill="#0f172a" />
      <text x={x} y={y + 4} textAnchor="middle" className="seq-num">{n}</text>
    </g>
  );
}
