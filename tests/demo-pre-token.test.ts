/** Registration demo, multi-tenant flow — lambda/demo-pre-token.ts, offline. */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';

process.env.TENANT_APPS = JSON.stringify({
  'acme-app1': { tenantId: 'acme', tenantName: 'Acme', app: 'app1', allowedDomains: [] },
  'globex-app2': { tenantId: 'globex', tenantName: 'Globex', app: 'app2', allowedDomains: [] },
  'corp-app1': { tenantId: 'corp', tenantName: 'Corp', app: 'app1', allowedDomains: ['corp.example'] },
});
const { handler } = await import('../lambda/demo-pre-token');

const event = (clientId: string, groups: string[], attrs: Record<string, string> = { email: 'a@example.com' }) =>
  ({ callerContext: { clientId }, request: { userAttributes: attrs, groupConfiguration: { groupsToOverride: groups } }, response: {} }) as unknown as PreTokenGenerationV2TriggerEvent;
const claimsOf = (e: PreTokenGenerationV2TriggerEvent) => e.response.claimsAndScopeOverrideDetails?.accessTokenGeneration?.claimsToAddOrOverride;

describe('demo pre-token: tenant apps', () => {
  it('adds tenant, app and role for a member', async () => {
    const e = await handler(event('acme-app1', ['tenant_acme']));
    assert.deepEqual(claimsOf(e), { tenant_id: 'acme', app: 'app1', role: 'user' });
    assert.deepEqual(e.response.claimsAndScopeOverrideDetails?.idTokenGeneration?.claimsToAddOrOverride, claimsOf(e));
  });
  it('gives admin role to the tenant admin group', async () => {
    assert.equal(claimsOf(await handler(event('acme-app1', ['tenant_acme', 'admin_acme'])))?.role, 'admin');
  });
  it("refuses a member of another tenant (including single sign-on into the other tenant's app)", async () => {
    await assert.rejects(handler(event('globex-app2', ['tenant_acme'])), /does not have access to Globex/);
  });
  it('refuses a user in no tenant', async () => {
    await assert.rejects(handler(event('acme-app1', [])), /does not have access to Acme/);
  });
  it("lets a Microsoft user in by the tenant's email domain", async () => {
    const e = await handler(event('corp-app1', [], { email: 'jo@CORP.EXAMPLE', identities: '[{"providerName":"Microsoft"}]' }));
    assert.equal(claimsOf(e)?.tenant_id, 'corp');
  });
  it('refuses a Microsoft user from another domain', async () => {
    await assert.rejects(handler(event('corp-app1', [], { email: 'jo@other.example', identities: '[{"providerName":"Microsoft"}]' })), /does not have access to Corp/);
  });
  it('leaves apps that are not tenant apps unchanged', async () => {
    const e = await handler(event('plain-hosted-client', []));
    assert.equal(claimsOf(e), undefined);
  });
});

describe('demo pre-token: registered through a tenant app (flow D)', () => {
  it('treats the tenant tag set at registration as membership', async () => {
    const e = await handler(event('acme-app1', [], { email: 'new@example.com', 'custom:tenant_id': 'acme' }));
    assert.equal(claimsOf(e)?.tenant_id, 'acme');
  });
  it("refuses a user registered in another tenant", async () => {
    await assert.rejects(handler(event('globex-app2', [], { email: 'new@example.com', 'custom:tenant_id': 'acme' })), /does not have access to Globex/);
  });
});
