// Auth service wrapper. All screens call THIS module, never import Firebase
// auth directly (enforced via ESLint no-restricted-imports).
//
// LD-278: Auth uses @react-native-firebase/auth, whose native SDK owns durable
// keychain persistence across app restarts. Callable functions use
// @react-native-firebase/functions so auth context stays in the same native
// Firebase stack.
//
// Preflight 78 decisions retained:
//  - refreshClaims(): forces token refresh so newly-set custom claims
//    (e.g., from onParentSignup CF) are available in rules.
//  - No authedWrite() helper yet — first client-write flows are all inside
//    screens with explicit refresh before write; an abstraction would be
//    premature until the write surface grows.
//  - Export typed subscribe pattern rather than raw native auth APIs.

import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

export type AuthUser = FirebaseAuthTypes.User;
export type Unsubscribe = () => void;

export interface IdTokenClaims {
  readonly role?: 'parent' | 'therapist';
  // Other custom claims may appear; keep narrow for v1.
}

export interface RefreshClaimsUntilRoleOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

export const CLAIMS_ROLE_RETRY_TIMEOUT_MS = 5_000;
export const CLAIMS_ROLE_RETRY_INTERVAL_MS = 250;

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const cred = await auth().signInWithEmailAndPassword(email, password);
  return cred.user;
}

export async function signUp(email: string, password: string): Promise<AuthUser> {
  const cred = await auth().createUserWithEmailAndPassword(email, password);
  return cred.user;
}

export async function signOut(): Promise<void> {
  await auth().signOut();
}

export function subscribeAuth(onChange: (user: AuthUser | null) => void): Unsubscribe {
  return auth().onAuthStateChanged(onChange);
}

/**
 * Force token refresh + return custom claims. Use after sign-up (CF sets
 * role claim async; client's first token has role=undefined) and after
 * claimTherapistInvite success.
 */
export async function refreshClaims(): Promise<IdTokenClaims> {
  const user = auth().currentUser;
  if (!user) return {};
  const result = await user.getIdTokenResult(true);
  const claims = result.claims;
  return { role: claims.role as IdTokenClaims['role'] };
}

/**
 * Retry claim refresh until the async onParentSignup trigger has attached a role.
 * Bounded so sign-up never hangs indefinitely if the trigger or network is down.
 */
export async function refreshClaimsUntilRole(
  options: RefreshClaimsUntilRoleOptions = {},
): Promise<IdTokenClaims> {
  const timeoutMs = options.timeoutMs ?? CLAIMS_ROLE_RETRY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? CLAIMS_ROLE_RETRY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastClaims: IdTokenClaims = {};

  do {
    lastClaims = await refreshClaims();
    if (lastClaims.role) return lastClaims;
    if (Date.now() >= deadline) break;
    await delay(intervalMs);
  } while (true);

  return lastClaims;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
