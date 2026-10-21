/**
 * Site-wide username/password prompt (HTTP Basic auth) for the POC, run as Vercel Edge Middleware
 * before any page or file is served. Keeps bots and crawlers out of the demo.
 *
 *   • /api/* is not gated: the tenant API uses the Authorization header for Cognito tokens, and
 *     already checks them; its public routes only return public settings.
 *   • Only a SHA-256 hash of "user:password" is in the code. Override it with the Vercel environment
 *     variable DEMO_SITE_AUTH_SHA256 (hex of sha256("user:password")), or set DEMO_SITE_AUTH=off.
 *
 * The values below are baked in at build time by scripts/vercel-build.ts.
 */
declare const __AUTH_SHA256__: string;
declare const __AUTH_OFF__: boolean;

const REALM = 'Cognito POC';
const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });
const challenge = () =>
  new Response('Sign in to view the Cognito POC.', {
    status: 401,
    headers: { 'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-length hex strings */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function gate(request: Request): Promise<Response> {
  if (__AUTH_OFF__) return next();
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return challenge();
  let pair: string;
  try {
    pair = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)));
  } catch {
    return challenge();
  }
  return same(await sha256Hex(pair), __AUTH_SHA256__) ? next() : challenge();
}
