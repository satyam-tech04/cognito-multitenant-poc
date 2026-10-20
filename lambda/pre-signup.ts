import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { AFFILIATION_ATTR, AFFILIATION_MAX, TENANT_ATTR } from '../shared/signup-demo';

/**
 * Pre sign-up trigger for the registration demo pool.
 *
 * Affiliation: Cognito can't mark a custom attribute as required, so this makes it mandatory for
 * sign-ups from our own registration pages (clients in REQUIRE_AFFILIATION_CLIENTS, and any
 * tenant registration). The hosted sign-up page can't show custom fields, so its users are asked
 * after first sign-in.
 *
 * Tenant registration (flow D): our own page sends custom:tenant_id. It must be the tenant that owns
 * the app client the user signs up through (TENANT_CLIENTS, client ID → tenant ID); any other value,
 * or a tenant tag from a non-tenant app, is refused. The attribute is immutable afterwards.
 *
 * Microsoft (federated) sign-ups are left alone.
 */
const list = (v?: string) => (v ?? '').split(',').filter(Boolean);
const tenantClients = (): Record<string, string> => JSON.parse(process.env.TENANT_CLIENTS ?? '{}');

export const handler = async (event: PreSignUpTriggerEvent) => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;
  const clientId = event.callerContext.clientId;
  const tag = event.request.userAttributes[TENANT_ATTR];
  if (tag !== undefined) {
    const owner = tenantClients()[clientId];
    if (!owner) throw new Error('This app does not belong to a tenant.');
    if (tag !== owner) throw new Error('Registration through this app can only join its own tenant.');
  }
  if (tag === undefined && !list(process.env.REQUIRE_AFFILIATION_CLIENTS).includes(clientId)) return event;
  const value = (event.request.userAttributes[AFFILIATION_ATTR] ?? '').trim();
  if (!value) throw new Error('Affiliation is required.');
  if (value.length > AFFILIATION_MAX) throw new Error(`Affiliation must be at most ${AFFILIATION_MAX} characters.`);
  if (/[<>]/.test(value)) throw new Error('Affiliation cannot contain < or >.');
  return event;
};
