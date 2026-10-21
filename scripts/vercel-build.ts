/**
 * Vercel build (Build Output API v3): one deployment serves the web app and the API.
 *
 *   /                 static React app (frontend/dist), page routes fall back to index.html
 *   /api/*            one Node function: the same API handler as local and Lambda
 *   everything else   behind a username/password prompt (scripts/vercel/gate.ts)
 *
 * Run by Vercel (vercel.json buildCommand). Locally: `npm run vercel:build` writes .vercel/output.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });

// 1. Web app
execFileSync('npm', ['--prefix', 'frontend', 'run', 'build'], { stdio: 'inherit' });
cpSync('frontend/dist', `${out}/static`, { recursive: true });
// Same origin, so the app calls /api/... (no cross-site requests)
writeFileSync(`${out}/static/runtime-config.json`, JSON.stringify({ apiUrl: '/api', region: process.env.APP_AWS_REGION ?? 'ap-south-1' }));

// 2. API function (bundled into one file, like the Lambda triggers)
const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['scripts/vercel/api-entry.ts'],
  outfile: `${fn}/index.js`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  logLevel: 'error',
});
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'commonjs' }));
writeFileSync(
  `${fn}/.vc-config.json`,
  // Mumbai (bom1): next to Cognito and the registry table in ap-south-1
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 10, regions: ['bom1'] }),
);

// 3. Site password (Edge Middleware): everything except /api asks for the POC username and password
const gate = `${out}/functions/gate.func`;
mkdirSync(gate, { recursive: true });
await build({
  entryPoints: ['scripts/vercel/gate.ts'],
  outfile: `${gate}/index.js`,
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  minify: true,
  logLevel: 'error',
  define: {
    // Hash of the shared POC username:password, unless the Vercel project sets its own
    __AUTH_SHA256__: JSON.stringify((process.env.DEMO_SITE_AUTH_SHA256 ?? 'b11fead5b829ca5e4f3c50e38028c5c1673f8502c979544bf697744933a6bfc7').toLowerCase()),
    __AUTH_OFF__: JSON.stringify(process.env.DEMO_SITE_AUTH === 'off'),
  },
});
writeFileSync(`${gate}/.vc-config.json`, JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }));

// 4. Routing: password check, files, then the API, then the app's page routes
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { src: '^/(?!api(?:/|$)).*$', middlewarePath: 'gate', continue: true },
      { src: '^/runtime-config\\.json$', headers: { 'cache-control': 'no-store' }, continue: true },
      { handle: 'filesystem' },
      { src: '^/api(?:/.*)?$', dest: '/api' },
      { src: '^/(.*)$', dest: '/index.html' },
    ],
  }),
);
console.log(`✔ Vercel build output written to ${out}`);
