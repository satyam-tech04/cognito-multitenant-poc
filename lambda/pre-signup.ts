import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { AFFILIATION_ATTR, AFFILIATION_MAX } from '../shared/signup-demo';

/**
 * Pre sign-up trigger for the registration demo pool.
 * Cognito can't mark a custom attribute as required, so this makes Affiliation mandatory for
 * sign-ups from our own registration page (clients in REQUIRE_AFFILIATION_CLIENTS).
 * The hosted sign-up page can't show custom fields, so its users are asked after first sign-in.
 * Microsoft (federated) sign-ups are left alone.
 */
const enforced = () => (process.env.REQUIRE_AFFILIATION_CLIENTS ?? '').split(',').filter(Boolean);

export const handler = async (event: PreSignUpTriggerEvent) => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;
  if (!enforced().includes(event.callerContext.clientId)) return event;
  const value = (event.request.userAttributes[AFFILIATION_ATTR] ?? '').trim();
  if (!value) throw new Error('Affiliation is required.');
  if (value.length > AFFILIATION_MAX) throw new Error(`Affiliation must be at most ${AFFILIATION_MAX} characters.`);
  if (/[<>]/.test(value)) throw new Error('Affiliation cannot contain < or >.');
  return event;
};
