// Auth service wrapper. All screens call THIS module, never import firebase/auth
// directly (enforced via ESLint no-restricted-imports).
//
// Preflight 78 decisions:
//  - refreshClaims(): forces token refresh so newly-set custom claims
//    (e.g., from onParentSignup CF) are available in rules.
//  - No authedWrite() helper yet — first client-write flows are all inside
//    screens with explicit refresh before write; an abstraction would be
//    premature until the write surface grows.
//  - Export typed subscribe pattern rather than raw onAuthStateChanged to
//    keep screens off `firebase/auth` imports.

// eslint-disable-next-line no-restricted-imports -- services/ IS the wrapper
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

export type AuthUser = User;

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
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return cred.user;
}

export async function signUp(email: string, password: string): Promise<AuthUser> {
  const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  return cred.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(firebaseAuth);
}

export function subscribeAuth(onChange: (user: AuthUser | null) => void): Unsubscribe {
  return onAuthStateChanged(firebaseAuth, onChange);
}

/**
 * Force token refresh + return custom claims. Use after sign-up (CF sets
 * role claim async; client's first token has role=undefined) and after
 * claimTherapistInvite success.
 */
export async function refreshClaims(): Promise<IdTokenClaims> {
  const user = firebaseAuth.currentUser;
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
