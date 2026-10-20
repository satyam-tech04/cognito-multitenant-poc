/**
 * Registration demo: one new SHARED user pool with self sign-up, used by two sets of pages.
 *   A  Cognito's hosted pages (managed login): sign-up, sign-in, Microsoft, email OTP, passkeys,
 *      work-email SSO, and single sign-on between two products
 *   B  our own sign-up and sign-in pages in the web app (/demo/register, /demo/login)
 *
 *   npm run signup-demo
 *
 * Safe to re-run: existing resources are found by name and reused. Pool settings that Cognito
 * only accepts at creation (required First/Last name, custom Affiliation) are set on the first run.
 * Brand (name, colours, images) comes from config/signup-demo.local.json, which is gitignored.
 */
import {
  CreateIdentityProviderCommand,
  CreateManagedLoginBrandingCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteManagedLoginBrandingCommand,
  DescribeManagedLoginBrandingByClientCommand,
  DescribeManagedLoginBrandingCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  SetUserPoolMfaConfigCommand,
  UpdateIdentityProviderCommand,
  UpdateManagedLoginBrandingCommand,
  type AssetType,
  type CreateUserPoolCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
} from '@aws-sdk/client-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { assertAwsAccount, cognito, config, ddb, domainPrefix, idpCreds, issuerFor, loginDomainUrl, outputs, readJson, sleep, writeJson } from './lib/common';
import { createDomain, findPoolByName, IDP_MICROSOFT } from './lib/provision';
import { cognitoColor } from './lib/branding';
import { AFFILIATION_MAX, SIGNUP_DEMO_KEY, type SignupDemoBrand, type SignupDemoConfig } from '../shared/signup-demo';

interface LocalBrand {
  nameAccent: string;
  nameRest: string;
  accent: string;
  primary: string;
  illustration?: string;
  panelColor?: string;
  hostedBackground?: string;
  ssoDomains?: string[];
}

const p = config.resourcePrefix;
const POOL_NAME = `${p}-signup-demo`;
const FN_NAME = `${p}-pre-signup`;
// The account's policy only allows changes to resources tagged for this POC
const tags = { poc: p, purpose: 'signup-demo' };
const CLIENTS = { product1: 'signup-hosted-product1', product2: 'signup-hosted-product2', own: 'signup-own-pages' } as const;
const origins = [...new Set([config.localDevOrigin, ...(config.publicOrigins ?? [])])];

const brandFile = 'config/signup-demo.local.json';
const local: LocalBrand = existsSync(brandFile)
  ? readJson<LocalBrand>(brandFile)
  : { nameAccent: 'Demo', nameRest: ' Portal', accent: '#d32f2f', primary: '#003da5', ssoDomains: [] };
const ssoDomains = (local.ssoDomains ?? []).map((d) => d.toLowerCase());

const account = await assertAwsAccount();
const lambda = new LambdaClient({ region: config.region });
const t0 = Date.now();
const step = (s: string) => process.stdout.write(`  • ${s} … `);
const done = (s = 'ready') => console.log(s);
console.log(`▶ Registration demo (shared pool "${POOL_NAME}")`);

// ---------- 1. Pre sign-up trigger: makes Affiliation mandatory on our own sign-up page ----------
step(`Lambda ${FN_NAME}`);
const fnArn = await deployPreSignup();
done();

// ---------- 2. User pool (settings Cognito only accepts at creation are set here) ----------
step('User pool');
let poolId = await findPoolByName(POOL_NAME);
const notes: string[] = [];
if (poolId) {
  done(`exists (${poolId})`);
} else {
  const input = (factors: string[]): CreateUserPoolCommandInput => ({
    PoolName: POOL_NAME,
    UserPoolTier: 'ESSENTIALS', // managed login, passwordless and passkeys
    UsernameAttributes: ['email'],
    UsernameConfiguration: { CaseSensitive: false },
    AutoVerifiedAttributes: ['email'], // Cognito emails a 6-digit code after sign-up
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false }, // self sign-up on
    AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
    UserAttributeUpdateSettings: { AttributesRequireVerificationBeforeUpdate: ['email'] },
    Policies: {
      PasswordPolicy: { MinimumLength: 8, RequireLowercase: true, RequireUppercase: true, RequireNumbers: true, RequireSymbols: true, TemporaryPasswordValidityDays: 7 },
      SignInPolicy: { AllowedFirstAuthFactors: factors as never },
    },
    DeletionProtection: 'INACTIVE',
    Schema: [
      // Required fields are shown on the hosted sign-up page. Only possible at pool creation.
      { Name: 'email', AttributeDataType: 'String', Required: true, Mutable: true },
      { Name: 'given_name', AttributeDataType: 'String', Required: true, Mutable: true, StringAttributeConstraints: { MinLength: '1', MaxLength: '100' } },
      { Name: 'family_name', AttributeDataType: 'String', Required: true, Mutable: true, StringAttributeConstraints: { MinLength: '1', MaxLength: '100' } },
      // Custom fields can't be required or shown on the hosted page; the pre sign-up trigger enforces it for our own page
      { Name: 'affiliation', AttributeDataType: 'String', Mutable: true, StringAttributeConstraints: { MinLength: '0', MaxLength: String(AFFILIATION_MAX) } },
    ],
    LambdaConfig: { PreSignUp: fnArn },
    UserPoolTags: tags,
  });
  try {
    poolId = (await cognito.send(new CreateUserPoolCommand(input(['PASSWORD', 'EMAIL_OTP', 'WEB_AUTHN'])))).UserPool!.Id!;
  } catch (e) {
    // Email one-time passwords need the pool to send email through Amazon SES
    notes.push(`Email OTP sign-in is off: ${(e as Error).message}`);
    poolId = (await cognito.send(new CreateUserPoolCommand(input(['PASSWORD', 'WEB_AUTHN'])))).UserPool!.Id!;
  }
  // Optional authenticator-app MFA (OTP sign-in can't be combined with MFA set to required)
  await cognito.send(new SetUserPoolMfaConfigCommand({ UserPoolId: poolId, MfaConfiguration: 'OPTIONAL', SoftwareTokenMfaConfiguration: { Enabled: true } }));
  done(`created (${poolId})`);
}
const pool = (await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }))).UserPool!;
const signInFactors = (pool.Policies?.SignInPolicy?.AllowedFirstAuthFactors ?? ['PASSWORD']) as string[];
if (!signInFactors.includes('EMAIL_OTP') && !notes.some((n) => n.startsWith('Email OTP')))
  notes.push('Email OTP sign-in is off: it needs the pool to send email through Amazon SES.');

// ---------- 3. Managed login domain ----------
step('Login domain');
const prefix = pool.Domain ?? domainPrefix('signup', account);
const loginDomain = pool.Domain ? loginDomainUrl(prefix) : await createDomain(poolId, prefix);
done(loginDomain);

// ---------- 4. Microsoft Entra ID (with work-email routing) ----------
let microsoftIdp: string | undefined;
const ms = idpCreds().microsoft;
if (ms) {
  step('Microsoft identity provider');
  const details = {
    client_id: ms.clientId,
    client_secret: ms.clientSecret,
    attributes_request_method: 'GET',
    oidc_issuer: `https://login.microsoftonline.com/${ms.entraTenantId}/v2.0`,
    authorize_scopes: 'openid email profile',
  };
  // Every required attribute must be mapped, or Cognito rejects the provider
  const AttributeMapping = { email: 'preferred_username', given_name: 'given_name', family_name: 'family_name', username: 'sub' };
  try {
    await cognito.send(new CreateIdentityProviderCommand({ UserPoolId: poolId, ProviderName: IDP_MICROSOFT, ProviderType: 'OIDC', ProviderDetails: details, AttributeMapping, IdpIdentifiers: ssoDomains }));
    done('created');
  } catch (e) {
    if ((e as Error).name !== 'DuplicateProviderException') throw e;
    await cognito.send(new UpdateIdentityProviderCommand({ UserPoolId: poolId, ProviderName: IDP_MICROSOFT, ProviderDetails: details, AttributeMapping, IdpIdentifiers: ssoDomains }));
    done('updated');
  }
  microsoftIdp = IDP_MICROSOFT;
} else {
  notes.push('Microsoft sign-in is off: config/idp.local.json has no "microsoft" block.');
}

// ---------- 5. App clients: two hosted products + our own pages ----------
const existing = new Map<string, string>();
let NextToken: string | undefined;
do {
  const r = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60, NextToken }));
  for (const c of r.UserPoolClients ?? []) existing.set(c.ClientName!, c.ClientId!);
  NextToken = r.NextToken;
} while (NextToken);

const attrs = ['email', 'given_name', 'family_name', 'custom:affiliation'];
async function client(name: string): Promise<string> {
  step(`App client ${name}`);
  if (existing.has(name)) {
    done('exists');
    return existing.get(name)!;
  }
  const r = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: name,
      GenerateSecret: false, // public browser client: Authorization Code + PKCE
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ['code'],
      // aws.cognito.signin.user.admin lets the signed-in user save their own Affiliation
      AllowedOAuthScopes: ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'],
      CallbackURLs: origins.map((o) => `${o}/demo/callback`),
      LogoutURLs: origins.map((o) => `${o}/demo`),
      SupportedIdentityProviders: microsoftIdp ? ['COGNITO', microsoftIdp] : ['COGNITO'],
      // USER_AUTH = choice-based sign-in (password, email code, passkey); SRP for password sign-in on our page
      ExplicitAuthFlows: ['ALLOW_USER_AUTH', 'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
      AuthSessionValidity: 5,
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      RefreshTokenValidity: 1,
      TokenValidityUnits: { AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'days' },
      ReadAttributes: [...attrs, 'email_verified'],
      // Microsoft's mapped attributes must be writable
      WriteAttributes: attrs,
    }),
  );
  done('created');
  return r.UserPoolClient!.ClientId!;
}
const hostedClients = { product1: await client(CLIENTS.product1), product2: await client(CLIENTS.product2) };
const ownClientId = await client(CLIENTS.own);

// Only our own page must send Affiliation; hosted sign-ups add it after first sign-in
step('Pre sign-up rule');
await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: FN_NAME, Environment: { Variables: { REQUIRE_AFFILIATION_CLIENTS: ownClientId } } }));
await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FN_NAME });
done('Affiliation required on our own sign-up page');

// ---------- 6. Hosted page branding (one style per hosted product) ----------
const brand: SignupDemoBrand = { nameAccent: local.nameAccent, nameRest: local.nameRest, accent: local.accent, primary: local.primary, panelColor: local.panelColor };
for (const [label, id] of Object.entries(hostedClients)) {
  step(`Hosted page branding (${label})`);
  done(await brandHostedClient(id, label === 'product2' ? 'Product 2' : 'Product 1'));
}

// ---------- 7. Registry row read by the web app ----------
step('Registry');
if (local.illustration && existsSync(local.illustration)) {
  brand.illustration = `data:image/jpeg;base64,${readFileSync(local.illustration).toString('base64')}`;
}
const demo: SignupDemoConfig = {
  region: config.region,
  userPoolId: poolId,
  issuer: issuerFor(poolId),
  loginDomain,
  hostedClients,
  ownClientId,
  microsoftIdp,
  ssoDomains,
  signInFactors,
  notes,
  brand,
};
await ddb.send(new PutCommand({ TableName: outputs().TenantTable, Item: { tenantId: SIGNUP_DEMO_KEY, ...demo } }));
writeJson('.poc/signup-demo.json', { ...demo, brand: { ...brand, illustration: brand.illustration ? '(embedded)' : undefined } });
done();

console.log(`\n✔ Ready in ${((Date.now() - t0) / 1000).toFixed(1)} s. Open /demo in the web app.`);
console.log(`  Sign-in factors: ${signInFactors.join(', ')}`);
for (const n of notes) console.log(`  ! ${n}`);
if (microsoftIdp) console.log(`  Add this redirect URI to the Entra app registration:\n    ${loginDomain}/oauth2/idpresponse`);

// =====================================================================================

async function deployPreSignup(): Promise<string> {
  const dir = '.poc/build/pre-signup';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await build({ entryPoints: ['lambda/pre-signup.ts'], outfile: `${dir}/index.js`, bundle: true, platform: 'node', target: 'node22', format: 'cjs', minify: true, logLevel: 'error' });
  execFileSync('zip', ['-j', '-q', `${dir}.zip`, `${dir}/index.js`]);
  const ZipFile = readFileSync(`${dir}.zip`);
  rmSync(`${dir}.zip`);

  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: FN_NAME })).catch((e) => {
    if ((e as Error).name === 'ResourceNotFoundException') return undefined;
    throw e;
  });
  if (fn) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN_NAME, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FN_NAME });
  } else {
    // Same execution role as the other triggers; this function reads nothing
    const role = (await lambda.send(new GetFunctionCommand({ FunctionName: `${p}-pre-auth` }))).Configuration!.Role!;
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: FN_NAME,
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        Handler: 'index.handler',
        Role: role,
        Code: { ZipFile },
        MemorySize: 128,
        Timeout: 5,
        Description: 'Cognito POC registration demo: Affiliation required on our own sign-up page',
        Tags: tags,
      }),
    );
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: FN_NAME });
  }
  await lambda
    .send(new AddPermissionCommand({ FunctionName: FN_NAME, StatementId: 'CognitoInvoke', Action: 'lambda:InvokeFunction', Principal: 'cognito-idp.amazonaws.com', SourceAccount: account }))
    .catch((e) => {
      if ((e as Error).name !== 'ResourceConflictException') throw e;
    });
  return `arn:aws:lambda:${config.region}:${account}:function:${FN_NAME}`;
}

function logoSvg(subtitle: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // 240 × 96 (2.5:1, inside Cognito's 1:1–4:1 logo limit); tight edges so the text renders large
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96" viewBox="0 0 240 96">
  <g transform="translate(103 1) scale(0.85)" fill="none" stroke="${local.accent}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M6 2h20l10 10v30a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><path d="M26 2v10h10"/><path d="M10 27h16m-6-6 6 6-6 6"/>
  </g>
  <text x="120" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700"><tspan fill="${local.accent}">${esc(local.nameAccent)}</tspan><tspan fill="#111111">${esc(local.nameRest)}</tspan></text>
  <text x="120" y="92" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600" fill="#5b6270">${esc(subtitle)}</text>
</svg>`;
}

function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${local.accent}"/><path d="M22 14h14l8 8v24a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>`;
}

type Json = Record<string, any>;
async function brandHostedClient(clientId: string, subtitle: string): Promise<string> {
  const ex = await cognito.send(new DescribeManagedLoginBrandingByClientCommand({ UserPoolId: poolId!, ClientId: clientId })).catch(() => undefined);
  const oldId = ex?.ManagedLoginBranding?.ManagedLoginBrandingId;
  if (oldId) await cognito.send(new DeleteManagedLoginBrandingCommand({ UserPoolId: poolId!, ManagedLoginBrandingId: oldId }));
  const id = (await cognito.send(new CreateManagedLoginBrandingCommand({ UserPoolId: poolId!, ClientId: clientId, UseCognitoProvidedValues: true }))).ManagedLoginBranding!.ManagedLoginBrandingId!;
  const merged = await cognito.send(new DescribeManagedLoginBrandingCommand({ UserPoolId: poolId!, ManagedLoginBrandingId: id, ReturnMergedResources: true }));
  const defaults = (merged.ManagedLoginBranding?.Settings ?? {}) as Json;

  const s: Json = structuredClone(defaults);
  const defaultPrimary = String(s.components?.primaryButton?.lightMode?.defaults?.backgroundColor ?? '').toLowerCase();
  const swap = (o: any): any =>
    typeof o === 'string' ? (o.toLowerCase() === defaultPrimary ? cognitoColor(local.primary) : o) : Array.isArray(o) ? o.map(swap) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, swap(v)])) : o;
  const out: Json = defaultPrimary ? swap(s) : s;
  out.categories.global.colorSchemeMode = 'LIGHT';
  out.components.pageBackground.lightMode.color = 'ffffffff';
  out.components.pageBackground.image = { enabled: true };
  out.components.form.logo = { ...out.components.form.logo, enabled: true, location: 'CENTER', position: 'TOP', formInclusion: 'IN' };
  out.components.form.lightMode = { ...out.components.form.lightMode, borderColor: 'ffffffff' };
  out.components.form.borderRadius = 8;
  if (out.components.favicon) out.components.favicon.enabledTypes = ['SVG'];

  const svg = (x: string) => new TextEncoder().encode(x);
  const assets: AssetType[] = [
    { Category: 'FORM_LOGO', ColorMode: 'LIGHT', Extension: 'SVG', Bytes: svg(logoSvg(subtitle)) },
    { Category: 'FAVICON_SVG', ColorMode: 'LIGHT', Extension: 'SVG', Bytes: svg(faviconSvg()) },
  ];
  if (local.hostedBackground && existsSync(local.hostedBackground)) {
    assets.push({ Category: 'PAGE_BACKGROUND', ColorMode: 'LIGHT', Extension: 'JPEG', Bytes: readFileSync(local.hostedBackground) });
  }

  // Try the full design, then fall back step by step, so one rejected setting doesn't lose the rest
  const withForm = (horizontal: string) => ({ ...out, categories: { ...out.categories, form: { ...out.categories.form, location: { horizontal, vertical: 'CENTER' } } } });
  const attempts: Array<[string, Json]> = [
    ['custom layout, form on the right', withForm('END')],
    ['custom layout, form on the right', withForm('RIGHT')],
    ['custom layout, form centred', { ...out, categories: { ...out.categories, form: { ...out.categories.form, location: defaults.categories.form.location } } }],
    ['default layout + images', defaults],
  ];
  let lastError = '';
  for (const [label, settings] of attempts) {
    try {
      await cognito.send(new UpdateManagedLoginBrandingCommand({ UserPoolId: poolId!, ManagedLoginBrandingId: id, UseCognitoProvidedValues: false, Settings: settings as never, Assets: assets }));
      return lastError ? `${label} (previous attempt rejected: ${lastError.slice(0, 120)})` : label;
    } catch (e) {
      lastError = (e as Error).message;
      await sleep(300);
    }
  }
  return `Cognito defaults only (${lastError.slice(0, 160)})`;
}
