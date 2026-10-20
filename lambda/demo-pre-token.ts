import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';

/**
 * Pre Token Generation V2 trigger for the registration demo's SHARED pool, tenant apps only.
 * Each tenant has three app clients. TENANT_APPS (env, JSON) maps client ID → tenant and app.
 *
 *   • a password / email-code user must be in the tenant's group (tenant_<id>)
 *   • a Microsoft user must have an email domain the tenant allows
 *   • otherwise the sign-in is refused, including single sign-on into another tenant's app
 *   • allowed sign-ins get tenant_id, app and role claims in BOTH tokens
 *
 * Clients that aren't tenant apps (the plain hosted/own demo pages) pass through unchanged.
 */
export interface TenantApp {
  tenantId: string;
  tenantName: string;
  app: string;
  allowedDomains: string[];
}

let parsed: { raw: string; map: Record<string, TenantApp> } | undefined;
function tenantApps(): Record<string, TenantApp> {
  const raw = process.env.TENANT_APPS ?? '{}';
  if (parsed?.raw !== raw) parsed = { raw, map: JSON.parse(raw) as Record<string, TenantApp> };
  return parsed.map;
}

export const handler = async (event: PreTokenGenerationV2TriggerEvent) => {
  const hit = tenantApps()[event.callerContext.clientId];
  if (!hit) return event;

  const attrs = event.request.userAttributes ?? {};
  const groups = event.request.groupConfiguration?.groupsToOverride ?? [];
  const federated = Boolean(attrs.identities);
  const domain = String(attrs.email ?? '').toLowerCase().split('@')[1] ?? '';

  const member = federated ? hit.allowedDomains.map((d) => d.toLowerCase()).includes(domain) : groups.includes(`tenant_${hit.tenantId}`);
  if (!member) {
    // Shown on the app's callback page; reveals nothing about other tenants
    throw new Error(`This account does not have access to ${hit.tenantName}.`);
  }

  const claims = {
    tenant_id: hit.tenantId,
    app: hit.app,
    role: groups.includes(`admin_${hit.tenantId}`) ? 'admin' : 'user',
  };
  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: { claimsToAddOrOverride: claims },
      accessTokenGeneration: { claimsToAddOrOverride: claims },
    },
  };
  return event;
};
