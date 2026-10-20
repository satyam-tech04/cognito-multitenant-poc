import { useEffect, useState } from 'react';
import { Directory } from './pages/Directory';
import { TenantHome } from './pages/TenantHome';
import { ModulePage } from './pages/ModulePage';
import { Callback } from './pages/Callback';
import { OwnLogin } from './pages/OwnLogin';
import { ThemeEditor } from './pages/ThemeEditor';
import { DemoHome } from './demo/DemoHome';
import { DemoCallback } from './demo/DemoCallback';
import { DemoAccount } from './demo/DemoAccount';
import { OwnRegister } from './demo/OwnRegister';
import { OwnSignIn } from './demo/OwnSignIn';
import { DemoTenants } from './demo/DemoTenants';
import { DevOpsGuide } from './demo/DevOpsGuide';
import { DevGuide } from './demo/DevGuide';
import type { ModuleId } from './lib';

function usePath() {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const on = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

/**
 * Routes (path-based tenancy, one codebase for every tenant):
 *   /                              tenant directory (POC convenience)
 *   /t/:tenantId                   tenant portal — 3 module tiles
 *   /t/:tenantId/login?module=     our own login page (scenario C tenants)
 *   /t/:tenantId/admin/branding    login theme editor (scenario C, tenant admins)
 *   /t/:tenantId/m/:module         signed-in module: tokens + API console
 *   /callback                      OIDC redirect URI shared by all clients
 *   /demo, /demo/register, /demo/login, /demo/account, /demo/callback, /demo/tenants, /demo/tenants-own, /demo/guide, /demo/guide/dev
 *                                  registration demo (one shared pool, hosted vs own pages)
 * With a real domain the tenant would come from the subdomain (acme.ourapp.com) instead.
 */
export function App() {
  const full = usePath();
  const path = full.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/callback') return <Callback />;
  // Registration demo: one shared pool, Cognito hosted pages (A) and our own pages (B)
  if (path === '/demo') return <DemoHome />;
  if (path === '/demo/callback') return <DemoCallback />;
  if (path === '/demo/account') return <DemoAccount key={full} />;
  if (path === '/demo/register') return <OwnRegister />;
  if (path === '/demo/login') return <OwnSignIn />;
  if (path === '/demo/tenants') return <DemoTenants key={full} />;
  if (path === '/demo/tenants-own') return <DemoTenants key={full} own />;
  if (path === '/demo/guide') return <DevOpsGuide />;
  if (path === '/demo/guide/dev') return <DevGuide />;
  const m = path.match(/^\/t\/([a-z0-9-]+)(?:\/(login|admin\/branding|m\/(module[123])))?\/?$/);
  if (m) {
    if (m[2] === 'login') return <OwnLogin key={full} tenantId={m[1]} />;
    if (m[2] === 'admin/branding') return <ThemeEditor key={full} tenantId={m[1]} />;
    if (m[3]) return <ModulePage key={full} tenantId={m[1]} module={m[3] as ModuleId} />;
    return <TenantHome key={full} tenantId={m[1]} />;
  }
  return <Directory />;
}
