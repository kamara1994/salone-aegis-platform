// Keycloak OIDC (authorization code + PKCE) in live mode. Mock mode signs in a local operator.
import type { UserManager } from 'oidc-client-ts';

export const API_MODE: 'live' | 'mock' = process.env.NEXT_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

let manager: UserManager | null = null;

async function getManager(): Promise<UserManager> {
  if (manager) return manager;
  const { UserManager, WebStorageStateStore } = await import('oidc-client-ts');
  manager = new UserManager({
    authority: process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? '',
    client_id: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? 'aegis-cockpit',
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/login`,
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    // Tokens live in session storage only: closing the tab ends the session.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
  return manager;
}

export async function getToken(): Promise<string | null> {
  if (API_MODE === 'mock') return 'mock-token';
  const m = await getManager();
  const u = await m.getUser();
  if (!u || u.expired) return null;
  return u.access_token;
}

export async function isSignedIn(): Promise<boolean> {
  if (API_MODE === 'mock') return true;
  return (await getToken()) !== null;
}

export async function signIn(returnTo = '/'): Promise<void> {
  if (API_MODE === 'mock') {
    window.location.assign(returnTo);
    return;
  }
  const m = await getManager();
  await m.signinRedirect({ state: { returnTo } });
}

export async function completeSignIn(): Promise<string> {
  const m = await getManager();
  const u = await m.signinRedirectCallback();
  const s = u.state as { returnTo?: string } | undefined;
  return s?.returnTo ?? '/';
}

export async function signOut(): Promise<void> {
  if (API_MODE === 'mock') {
    window.location.assign('/login');
    return;
  }
  const m = await getManager();
  await m.signoutRedirect();
}
