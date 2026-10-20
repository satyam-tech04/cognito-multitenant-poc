/**
 * Registration demo: one new SHARED user pool with self sign-up, used by two sets of pages.
 *   A  Cognito's hosted pages (managed login): sign-up, sign-in, Microsoft, email OTP, passkeys,
 *      work-email SSO, and single sign-on between two products
 *   B  our own sign-up and sign-in pages in the web app (/demo/register, /demo/login)
 *   C  multi-tenant flow (/demo/tenants): tenants share the pool, each with three app clients;
 *      a pre-token trigger adds tenant/app claims and refuses users from other tenants
 *
 *   npm run signup-demo
 *
 * Safe to re-run: existing resources are found by name and reused. Pool settings that Cognito
 * only accepts at creation (required First/Last name, custom Affiliation) are set on the first run.
 * Brand (name, colours, images) comes from config/signup-demo.local.json, which is gitignored.
 */
import {
  AddCustomAttributesCommand,
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateGroupCommand,
  CreateIdentityProviderCommand,
  CreateManagedLoginBrandingCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteManagedLoginBrandingCommand,
  DescribeManagedLoginBrandingByClientCommand,
  DescribeManagedLoginBrandingCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  SetUserPoolMfaConfigCommand,
  UpdateIdentityProviderCommand,
  UpdateManagedLoginBrandingCommand,
  UpdateUserPoolClientCommand,
  UpdateUserPoolCommand,
  type AssetType,
  type VerificationMessageTemplateType,
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
import { assertAwsAccount, cognito, config, ddb, demoPassword, domainPrefix, idpCreds, issuerFor, loginDomainUrl, outputs, readJson, sleep, writeJson } from './lib/common';
import { createDomain, findPoolByName, IDP_MICROSOFT } from './lib/provision';
import { cognitoColor } from './lib/branding';
import { AFFILIATION_MAX, DEMO_APPS, SIGNUP_DEMO_KEY, type DemoTenant, type SignupDemoBrand, type SignupDemoConfig } from '../shared/signup-demo';
import type { TenantApp } from '../lambda/demo-pre-token';

interface LocalBrand {
  nameAccent: string;
  nameRest: string;
  accent: string;
  primary: string;
  illustration?: string;
  panelColor?: string;
  hostedBackground?: string;
  ssoDomains?: string[];
  /** Optional third tenant whose members sign in with Microsoft (email domain = ssoDomains) */
  ssoTenant?: { id: string; name: string };
  /** Verification email wording (optional overrides) */
  email?: { subject?: string; intro?: string; footer?: string };
}

const p = config.resourcePrefix;
const POOL_NAME = `${p}-signup-demo`;
const FN_NAME = `${p}-pre-signup`;
const TOKEN_FN = `${p}-demo-pre-token`;
// The account's policy only allows changes to resources tagged for this POC
const tags = { poc: p, purpose: 'signup-demo' };
const CLIENTS = { product1: 'signup-hosted-product1', product2: 'signup-hosted-product2', own: 'signup-own-pages' } as const;
const origins = [...new Set([config.localDevOrigin, ...(config.publicOrigins ?? [])])];

const brandFile = 'config/signup-demo.local.json';
const local: LocalBrand = existsSync(brandFile)
  ? readJson<LocalBrand>(brandFile)
  : { nameAccent: 'Demo', nameRest: ' Portal', accent: '#d32f2f', primary: '#003da5', ssoDomains: [] };
const ssoDomains = (local.ssoDomains ?? []).map((d) => d.toLowerCase());

// Multi-tenant flow: two password tenants, plus a Microsoft tenant when one is configured
const TENANTS: Array<Omit<DemoTenant, 'apps' | 'demoUsers'>> = [
  { id: 'acme', name: 'Acme Research Institute', color: '#0f766e', allowedDomains: [] },
  { id: 'globex', name: 'Globex University', color: '#7c3aed', allowedDomains: [] },
  ...(local.ssoTenant && ssoDomains.length ? [{ id: local.ssoTenant.id, name: local.ssoTenant.name, color: local.primary, allowedDomains: ssoDomains }] : []),
];
const demoUserEmail = (tenantId: string) => `${tenantId}.user@example.com`;

const account = await assertAwsAccount();
const lambda = new LambdaClient({ region: config.region });
const t0 = Date.now();
const step = (s: string) => process.stdout.write(`  • ${s} … `);
const done = (s = 'ready') => console.log(s);
console.log(`▶ Registration demo (shared pool "${POOL_NAME}")`);

// ---------- 1. Triggers ----------
// Pre sign-up: Affiliation mandatory on our own sign-up page
step(`Lambda ${FN_NAME}`);
const fnArn = await deployFunction(FN_NAME, 'pre-signup', 'Cognito POC registration demo: Affiliation required on our own sign-up page');
done();
// Pre token: tenant/app claims and tenant membership check for the multi-tenant flow
step(`Lambda ${TOKEN_FN}`);
const tokenFnArn = await deployFunction(TOKEN_FN, 'demo-pre-token', 'Cognito POC registration demo: tenant claims, refuses users from other tenants');
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
    LambdaConfig: { PreSignUp: fnArn, PreTokenGenerationConfig: { LambdaArn: tokenFnArn, LambdaVersion: 'V2_0' } },
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

// Tenant tag for self-registration on our own pages (flow D). Set once at sign-up, never changed:
// the pre sign-up trigger checks it matches the tenant that owns the app client
if (!pool.SchemaAttributes?.some((a) => a.Name === 'custom:tenant_id')) {
  step('Custom attribute tenant_id');
  await cognito.send(new AddCustomAttributesCommand({ UserPoolId: poolId, CustomAttributes: [{ Name: 'tenant_id', AttributeDataType: 'String', Mutable: false, StringAttributeConstraints: { MinLength: '1', MaxLength: '64' } }] }));
  done('added (immutable)');
}

// ---------- 5. App clients: two hosted products + our own pages ----------
const existing = new Map<string, string>();
let NextToken: string | undefined;
do {
  const r = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60, NextToken }));
  for (const c of r.UserPoolClients ?? []) existing.set(c.ClientName!, c.ClientId!);
  NextToken = r.NextToken;
} while (NextToken);

const attrs = ['email', 'given_name', 'family_name', 'custom:affiliation', 'custom:tenant_id'];
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
      LogoutURLs: origins.flatMap((o) => [`${o}/demo`, `${o}/demo/tenants`]),
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


// ---------- 5b. Multi-tenant flow: three app clients per tenant, groups, demo users ----------
const tenants: DemoTenant[] = [];
const tenantApps: Record<string, TenantApp> = {};
for (const t of TENANTS) {
  const apps = [];
  for (const a of DEMO_APPS) {
    const clientId = await client(`tenant-${t.id}-${a.key}`);
    apps.push({ ...a, clientId });
    tenantApps[clientId] = { tenantId: t.id, tenantName: t.name, app: a.key, allowedDomains: t.allowedDomains };
  }
  for (const g of [`tenant_${t.id}`, `admin_${t.id}`]) {
    await cognito.send(new CreateGroupCommand({ UserPoolId: poolId, GroupName: g, Description: `${t.name} ${g.startsWith('admin') ? 'admins' : 'members'}` })).catch((e) => {
      if ((e as Error).name !== 'GroupExistsException') throw e;
    });
  }
  const demoUsers = t.allowedDomains.length ? [] : [demoUserEmail(t.id)];
  for (const email of demoUsers) {
    step(`Demo user ${email}`);
    const created = await cognito
      .send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'given_name', Value: t.name.split(' ')[0] },
            { Name: 'family_name', Value: 'User' },
            { Name: 'custom:affiliation', Value: t.name },
          ],
        }),
      )
      .then(() => true)
      .catch((e) => {
        if ((e as Error).name !== 'UsernameExistsException') throw e;
        return false;
      });
    await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: poolId, Username: email, Password: demoPassword(), Permanent: true }));
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: email, GroupName: `tenant_${t.id}` }));
    done(created ? `created, member of ${t.name}` : `exists, member of ${t.name}`);
  }
  tenants.push({ ...t, apps, demoUsers });
}
step('Tenant rules');
await setEnv(TOKEN_FN, { TENANT_APPS: JSON.stringify(tenantApps) });
// Pre sign-up: Affiliation required on our own pages; a tenant tag must match the app's tenant
await setEnv(FN_NAME, {
  REQUIRE_AFFILIATION_CLIENTS: ownClientId,
  TENANT_CLIENTS: JSON.stringify(Object.fromEntries(Object.entries(tenantApps).map(([id, a]) => [id, a.tenantId]))),
});
const pt = (await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }))).UserPool!.LambdaConfig?.PreTokenGenerationConfig;
if (pt?.LambdaArn !== tokenFnArn) await updatePool({ LambdaConfig: { PreTokenGenerationConfig: { LambdaArn: tokenFnArn, LambdaVersion: 'V2_0' } } });
done(`${Object.keys(tenantApps).length} tenant apps`);
// Clients created by earlier runs: add newer logout addresses and attribute permissions
for (const id of [...Object.values(hostedClients), ownClientId, ...Object.keys(tenantApps)]) {
  const cur = (await cognito.send(new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: id }))).UserPoolClient!;
  const wantLogout = origins.flatMap((o) => [`${o}/demo`, `${o}/demo/tenants`]);
  const wantRead = [...attrs, 'email_verified'];
  if (wantLogout.every((u) => cur.LogoutURLs?.includes(u)) && wantRead.every((a) => cur.ReadAttributes?.includes(a)) && attrs.every((a) => cur.WriteAttributes?.includes(a))) continue;
  const { ClientSecret: _s, CreationDate: _c, LastModifiedDate: _m, ...rest } = cur;
  await cognito.send(
    new UpdateUserPoolClientCommand({
      ...rest,
      UserPoolId: poolId,
      ClientId: id,
      LogoutURLs: [...new Set([...(cur.LogoutURLs ?? []), ...wantLogout])],
      ReadAttributes: [...new Set([...(cur.ReadAttributes ?? []), ...wantRead])],
      WriteAttributes: [...new Set([...(cur.WriteAttributes ?? []), ...attrs])],
    }),
  );
}

// ---------- 5c. Branded verification email (pool message template, no Lambda, no SES) ----------
// Used for the 6-digit sign-up confirmation, resend, and password-reset codes. Editable later in the
// Cognito console (Messaging → Message templates → Verification message) or via config/signup-demo.local.json.
// The 8-digit sign-in code email can't be changed without Amazon SES (see notes).
step('Verification email template');
const template = verificationEmail();
await updatePool({ VerificationMessageTemplate: { DefaultEmailOption: 'CONFIRM_WITH_CODE', EmailSubject: template.subject, EmailMessage: template.html } });
done(`"${template.subject}" (${template.html.length} characters)`);
if (!notes.some((n) => n.startsWith('Sign-in code email')))
  notes.push('Sign-in code email (8 digits) uses Cognito\'s default wording: branding it needs Amazon SES plus a custom message trigger.');

// ---------- 6. Hosted page branding (one style per hosted product) ----------
const brand: SignupDemoBrand = { nameAccent: local.nameAccent, nameRest: local.nameRest, accent: local.accent, primary: local.primary, panelColor: local.panelColor };
for (const [label, id] of Object.entries(hostedClients)) {
  step(`Hosted page branding (${label})`);
  done(await brandHostedClient(id, label === 'product2' ? 'Product 2' : 'Product 1'));
}
for (const t of tenants) {
  for (const a of t.apps) {
    step(`Hosted page branding (${t.id} ${a.name})`);
    done(await brandHostedClient(a.clientId, `${t.name} · ${a.name}`, t.color));
  }
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
  tenants,
};
await ddb.send(new PutCommand({ TableName: outputs().TenantTable, Item: { tenantId: SIGNUP_DEMO_KEY, ...demo } }));
writeJson('.poc/signup-demo.json', { ...demo, brand: { ...brand, illustration: brand.illustration ? '(embedded)' : undefined } });
done();

console.log(`\n✔ Ready in ${((Date.now() - t0) / 1000).toFixed(1)} s. Open /demo in the web app.`);
console.log(`  Sign-in factors: ${signInFactors.join(', ')}`);
for (const n of notes) console.log(`  ! ${n}`);
if (microsoftIdp) console.log(`  Add this redirect URI to the Entra app registration:\n    ${loginDomain}/oauth2/idpresponse`);

// =====================================================================================

/** Build one trigger from lambda/<entry>.ts and create or update its function. Returns the ARN. */
async function deployFunction(name: string, entry: string, description: string): Promise<string> {
  const dir = `.poc/build/${entry}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await build({ entryPoints: [`lambda/${entry}.ts`], outfile: `${dir}/index.js`, bundle: true, platform: 'node', target: 'node22', format: 'cjs', minify: true, logLevel: 'error' });
  execFileSync('zip', ['-j', '-q', `${dir}.zip`, `${dir}/index.js`]);
  const ZipFile = readFileSync(`${dir}.zip`);
  rmSync(`${dir}.zip`);

  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: name })).catch((e) => {
    if ((e as Error).name === 'ResourceNotFoundException') return undefined;
    throw e;
  });
  if (fn) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: name });
  } else {
    // Same execution role as the other triggers; these functions read nothing
    const role = (await lambda.send(new GetFunctionCommand({ FunctionName: `${p}-pre-auth` }))).Configuration!.Role!;
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        Handler: 'index.handler',
        Role: role,
        Code: { ZipFile },
        MemorySize: 128,
        Timeout: 5,
        Description: description,
        Tags: tags,
      }),
    );
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: name });
  }
  await lambda
    .send(new AddPermissionCommand({ FunctionName: name, StatementId: 'CognitoInvoke', Action: 'lambda:InvokeFunction', Principal: 'cognito-idp.amazonaws.com', SourceAccount: account }))
    .catch((e) => {
      if ((e as Error).name !== 'ResourceConflictException') throw e;
    });
  return `arn:aws:lambda:${config.region}:${account}:function:${name}`;
}

async function setEnv(name: string, Variables: Record<string, string>) {
  await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: name, Environment: { Variables } }));
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: name });
}

/**
 * Change pool settings after creation. UpdateUserPool resets every setting it isn't given,
 * so the current settings are read back and sent in full, with only the patch applied.
 */
async function updatePool(patch: { LambdaConfig?: Record<string, unknown>; VerificationMessageTemplate?: VerificationMessageTemplateType }) {
  const cur = (await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId! }))).UserPool!;
  await cognito.send(
    new UpdateUserPoolCommand({
      UserPoolId: poolId!,
      PoolName: cur.Name,
      UserPoolTier: cur.UserPoolTier,
      Policies: cur.Policies,
      DeletionProtection: cur.DeletionProtection,
      LambdaConfig: { ...cur.LambdaConfig, ...patch.LambdaConfig },
      AutoVerifiedAttributes: cur.AutoVerifiedAttributes,
      VerificationMessageTemplate: patch.VerificationMessageTemplate ?? cur.VerificationMessageTemplate,
      UserAttributeUpdateSettings: cur.UserAttributeUpdateSettings,
      MfaConfiguration: cur.MfaConfiguration,
      DeviceConfiguration: cur.DeviceConfiguration,
      EmailConfiguration: cur.EmailConfiguration,
      SmsConfiguration: cur.SmsConfiguration,
      UserPoolTags: cur.UserPoolTags,
      AdminCreateUserConfig: cur.AdminCreateUserConfig,
      UserPoolAddOns: cur.UserPoolAddOns,
      AccountRecoverySetting: cur.AccountRecoverySetting,
    }),
  );
  const after = (await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId! }))).UserPool!;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(after.Policies, cur.Policies) || after.MfaConfiguration !== cur.MfaConfiguration || !same(after.AdminCreateUserConfig, cur.AdminCreateUserConfig)) {
    throw new Error('Pool settings changed unexpectedly while updating the pool; check the pool in the console.');
  }
}

/** Email-safe HTML (tables, inline styles). Must contain {####}; Cognito allows 20,000 characters. */
function verificationEmail(): { subject: string; html: string } {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = `${local.nameAccent}${local.nameRest}`;
  const e = local.email ?? {};
  const subject = e.subject ?? `Your ${name} verification code`;
  const intro = e.intro ?? `Use this code to verify your email address for ${name}:`;
  const footer = e.footer ?? `If you didn't ask for this code, you can ignore this email.`;
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;border-top:4px solid ${local.primary}">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:bold"><span style="color:${local.accent}">${esc(local.nameAccent)}</span><span style="color:#111111">${esc(local.nameRest)}</span></td></tr>
<tr><td style="padding:8px 28px;font-size:15px;line-height:22px;color:#333333">${esc(intro)}</td></tr>
<tr><td style="padding:8px 28px 16px"><div style="font-size:30px;letter-spacing:8px;font-weight:bold;color:${local.primary};background:#eef3fd;border-radius:6px;padding:14px 0;text-align:center">{####}</div></td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;line-height:20px;color:#666666">${esc(footer)}</td></tr>
</table>
<p style="font-size:11px;color:#999999;margin:16px 0 0">${esc(name)}</p>
</td></tr></table>`;
  return { subject, html };
}

function logoSvg(subtitle: string, subtitleColor = '#5b6270'): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // 300 × 100 (3:1, inside Cognito's 1:1–4:1 logo limit); wide enough for "Tenant · App"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
  <g transform="translate(133 1) scale(0.85)" fill="none" stroke="${local.accent}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M6 2h20l10 10v30a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><path d="M26 2v10h10"/><path d="M10 27h16m-6-6 6 6-6 6"/>
  </g>
  <text x="150" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700"><tspan fill="${local.accent}">${esc(local.nameAccent)}</tspan><tspan fill="#111111">${esc(local.nameRest)}</tspan></text>
  <text x="150" y="93" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="${subtitleColor}">${esc(subtitle)}</text>
</svg>`;
}

function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${local.accent}"/><path d="M22 14h14l8 8v24a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>`;
}

type Json = Record<string, any>;
async function brandHostedClient(clientId: string, subtitle: string, primary = local.primary): Promise<string> {
  const ex = await cognito.send(new DescribeManagedLoginBrandingByClientCommand({ UserPoolId: poolId!, ClientId: clientId })).catch(() => undefined);
  const oldId = ex?.ManagedLoginBranding?.ManagedLoginBrandingId;
  if (oldId) await cognito.send(new DeleteManagedLoginBrandingCommand({ UserPoolId: poolId!, ManagedLoginBrandingId: oldId }));
  const id = (await cognito.send(new CreateManagedLoginBrandingCommand({ UserPoolId: poolId!, ClientId: clientId, UseCognitoProvidedValues: true }))).ManagedLoginBranding!.ManagedLoginBrandingId!;
  const merged = await cognito.send(new DescribeManagedLoginBrandingCommand({ UserPoolId: poolId!, ManagedLoginBrandingId: id, ReturnMergedResources: true }));
  const defaults = (merged.ManagedLoginBranding?.Settings ?? {}) as Json;

  const s: Json = structuredClone(defaults);
  const defaultPrimary = String(s.components?.primaryButton?.lightMode?.defaults?.backgroundColor ?? '').toLowerCase();
  const swap = (o: any): any =>
    typeof o === 'string' ? (o.toLowerCase() === defaultPrimary ? cognitoColor(primary) : o) : Array.isArray(o) ? o.map(swap) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, swap(v)])) : o;
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
    { Category: 'FORM_LOGO', ColorMode: 'LIGHT', Extension: 'SVG', Bytes: svg(logoSvg(subtitle, primary === local.primary ? undefined : primary)) },
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
