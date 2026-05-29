// Firebase Auth error code → user-facing message. v1 ships 4 codes per
// Counter 3 HIGH (YAGNI on the 20-code map until production surfaces more).
//
// Extend opportunistically when a new error is observed in Crashlytics/logs.

export interface AuthErrorMessage {
  readonly userMessage: string;
  readonly retriable: boolean;
}

const ERROR_MESSAGES: Readonly<Record<string, AuthErrorMessage>> = {
  'auth/invalid-email': {
    userMessage: "That email doesn't look right.",
    retriable: true,
  },
  'auth/wrong-password': {
    userMessage: 'Email or password is incorrect.',
    retriable: true,
  },
  'auth/user-not-found': {
    userMessage: 'Email or password is incorrect.',
    retriable: true,
  },
  'auth/network-request-failed': {
    userMessage: 'Network error. Please check your connection and try again.',
    retriable: true,
  },
};

const FALLBACK: AuthErrorMessage = {
  userMessage: 'Something went wrong. Please try again.',
  retriable: true,
};

export function translateAuthError(error: unknown): AuthErrorMessage {
  if (error == null || typeof error !== 'object') return FALLBACK;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return FALLBACK;
  return ERROR_MESSAGES[code] ?? FALLBACK;
}
