/**
 * Registration demo: one shared user pool used by two sets of pages.
 *   A  Cognito's hosted (managed login) sign-up and sign-in pages
 *   B  our own sign-up and sign-in pages, calling the Cognito API
 * Stored as one registry row (SIGNUP_DEMO_KEY) and served by GET /public/signup-demo.
 * Every value here is public by design: pool and client IDs are sent to the browser anyway.
 */
export const SIGNUP_DEMO_KEY = 'demo#signup';

/** Shown on our own pages (B). Kept out of git: the provisioning script reads it from a local file. */
export interface SignupDemoBrand {
  /** Product name, split so the first word can take the accent colour ("Smart" + " Submission") */
  nameAccent: string;
  nameRest: string;
  accent: string;
  primary: string;
  /** Illustration for the left panel, as a data: URL (optional) */
  illustration?: string;
}

export interface SignupDemoConfig {
  region: string;
  userPoolId: string;
  issuer: string;
  /** Managed login domain, e.g. https://cpoc-signup-xxxx.auth.ap-south-1.amazoncognito.com */
  loginDomain: string;
  /** Hosted pages (A): two products on one pool, to show single sign-on between them */
  hostedClients: { product1: string; product2: string };
  /** Our own pages (B) */
  ownClientId: string;
  /** Name of the Microsoft Entra identity provider in the pool, if configured */
  microsoftIdp?: string;
  /** Email domains that are sent straight to Microsoft (work-email SSO) */
  ssoDomains: string[];
  /** First factors the pool allows, e.g. ["PASSWORD", "EMAIL_OTP", "WEB_AUTHN"] */
  signInFactors: string[];
  /** Why a factor is missing, e.g. EMAIL_OTP needs Amazon SES */
  notes: string[];
  brand: SignupDemoBrand;
}

export const AFFILIATION_ATTR = 'custom:affiliation';
export const AFFILIATION_MAX = 500;
