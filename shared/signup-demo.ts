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
  /** Colour behind the illustration, so it fits the panel without being cropped */
  panelColor?: string;
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
  /** Multi-tenant flow: tenants sharing this pool, each with three app clients */
  tenants?: DemoTenant[];
}

export interface DemoTenantApp {
  key: 'app1' | 'app2' | 'app3';
  name: string;
  clientId: string;
}
export interface DemoTenant {
  id: string;
  name: string;
  color: string;
  /** Microsoft users with these email domains belong to this tenant */
  allowedDomains: string[];
  apps: DemoTenantApp[];
  /** Seeded password users, so the demo can show both a member and a non-member */
  demoUsers: string[];
}

export const DEMO_APPS: Array<Pick<DemoTenantApp, 'key' | 'name'>> = [
  { key: 'app1', name: 'Submissions' },
  { key: 'app2', name: 'Reviews' },
  { key: 'app3', name: 'Reports' },
];

export const AFFILIATION_ATTR = 'custom:affiliation';
/** Tenant tag set once at self-registration on our own pages (flow D) */
export const TENANT_ATTR = 'custom:tenant_id';
export const AFFILIATION_MAX = 500;
