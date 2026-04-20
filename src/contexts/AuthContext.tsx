// AuthContext — exposes {user, claimsReady, status} to consumers.
//
// IMPORTANT for route guards: `status === 'loading'` must be treated as
// "unknown yet" — DO NOT redirect to sign-in while loading, or cold-start
// of a signed-in user flashes the sign-in screen before resolving.
// Pattern: `if (status === 'signedOut') redirect`, leave `'loading'` alone.

import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { subscribeAuth, refreshClaims, type AuthUser, type IdTokenClaims } from '../services/auth';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly claims: IdTokenClaims;
  readonly claimsReady: boolean;
  readonly status: AuthStatus;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  claims: {},
  claimsReady: false,
  status: 'loading',
});

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [claims, setClaims] = useState<IdTokenClaims>({});
  const [claimsReady, setClaimsReady] = useState(false);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const unsubscribe = subscribeAuth(async (next) => {
      setUser(next);
      if (next == null) {
        setClaims({});
        setClaimsReady(false);
        setStatus('signedOut');
        return;
      }
      setStatus('signedIn');
      // Refresh claims once on sign-in. Callers can re-refresh via the
      // services/auth.ts refreshClaims() after role-upgrade flows.
      try {
        const fresh = await refreshClaims();
        setClaims(fresh);
      } catch {
        // Network failure on token refresh — keep user signed in but mark
        // claims-not-ready so guards can show a retry UI.
        setClaims({});
      } finally {
        setClaimsReady(true);
      }
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, claims, claimsReady, status }),
    [user, claims, claimsReady, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
