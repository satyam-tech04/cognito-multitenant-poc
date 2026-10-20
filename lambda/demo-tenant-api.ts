import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { signupDemoConfig } from './registry';
import type { DemoTenant } from '../shared/signup-demo';

/**
 * GET /demo-tenants/{tenant}/data for the multi-tenant flow on the registration demo pool.
 * Checks, in order: a Bearer access token is present (401) → signature, expiry, token_use and
 * client ID verify against the demo pool (401) → the token's tenant_id claim and the app client
 * that issued it both belong to the requested tenant (403 wrong_tenant).
 */
type Result = { status: number; body: unknown };
let verifier: { key: string; v: ReturnType<typeof CognitoJwtVerifier.create> } | undefined;

export async function demoTenantData(tenantId: string, authHeader: string | undefined): Promise<Result> {
  const c = await signupDemoConfig();
  const tenants = c?.tenants ?? [];
  const target = tenants.find((t) => t.id === tenantId);
  if (!c || !target) return { status: 404, body: { error: 'tenant_not_found' } };
  if (!authHeader?.startsWith('Bearer ')) return { status: 401, body: { error: 'missing_token' } };

  const clientIds = tenants.flatMap((t) => t.apps.map((a) => a.clientId));
  const key = `${c.userPoolId}|${clientIds.join(',')}`;
  if (verifier?.key !== key) verifier = { key, v: CognitoJwtVerifier.create({ userPoolId: c.userPoolId, tokenUse: 'access', clientId: clientIds }) };

  let claims: Record<string, unknown>;
  try {
    claims = (await verifier.v.verify(authHeader.slice(7).trim())) as unknown as Record<string, unknown>;
  } catch (e) {
    return { status: 401, body: { error: 'invalid_token', detail: (e as Error).message } };
  }

  const issuedBy = tenants.find((t) => t.apps.some((a) => a.clientId === claims.client_id)) as DemoTenant;
  if (claims.tenant_id !== target.id || issuedBy.id !== target.id) {
    return {
      status: 403,
      body: { error: 'wrong_tenant', message: `This token is for ${issuedBy.name}, not ${target.name}.`, token_tenant: claims.tenant_id, requested_tenant: target.id },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      tenant: target.name,
      app: claims.app,
      user: claims.username,
      rows: [`${target.id.toUpperCase()}-SUB-1042 · Manuscript submitted`, `${target.id.toUpperCase()}-SUB-1043 · Under review`, `${target.id.toUpperCase()}-SUB-1044 · Accepted`],
    },
  };
}
