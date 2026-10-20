/** Registration demo — lambda/pre-signup.ts, offline: Affiliation is required on our own sign-up page only. */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { PreSignUpTriggerEvent } from 'aws-lambda';

process.env.REQUIRE_AFFILIATION_CLIENTS = 'own-pages-client';
const { handler } = await import('../lambda/pre-signup');

const event = (clientId: string, affiliation?: string, triggerSource = 'PreSignUp_SignUp') =>
  ({
    triggerSource,
    callerContext: { clientId },
    request: { userAttributes: { email: 'a@example.com', ...(affiliation !== undefined ? { 'custom:affiliation': affiliation } : {}) } },
    response: {},
  }) as unknown as PreSignUpTriggerEvent;

describe('pre sign-up: Affiliation', () => {
  it('rejects our own page without Affiliation', async () => {
    await assert.rejects(handler(event('own-pages-client')), /Affiliation is required/);
  });
  it('rejects a blank Affiliation', async () => {
    await assert.rejects(handler(event('own-pages-client', '   ')), /Affiliation is required/);
  });
  it('rejects HTML in Affiliation', async () => {
    await assert.rejects(handler(event('own-pages-client', '<b>Uni</b>')), /cannot contain/);
  });
  it('rejects an Affiliation over the limit', async () => {
    await assert.rejects(handler(event('own-pages-client', 'x'.repeat(501))), /at most 500/);
  });
  it('accepts our own page with Affiliation', async () => {
    const e = event('own-pages-client', 'University of Testing');
    assert.equal(await handler(e), e);
  });
  it('lets the hosted page sign up without it (asked after first sign-in)', async () => {
    const e = event('hosted-client');
    assert.equal(await handler(e), e);
  });
  it('lets Microsoft sign-ups through', async () => {
    const e = event('own-pages-client', undefined, 'PreSignUp_ExternalProvider');
    assert.equal(await handler(e), e);
  });
});
