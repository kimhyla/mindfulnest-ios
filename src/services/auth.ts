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
