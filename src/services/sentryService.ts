// Sentry error monitoring wrapper — LD-801 SENTRY_PERMITTED_ERROR_MONITORING_LD220_NARROWED_V1
// @sentry/react-native is ONLY imported here. All other files use this wrapper.
// Constraints: Session Replay disabled, PII scrubbing on, DSN from env only.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

export function initializeSentry(): void {
  const dsn = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
    ?.sentryDsn as string | null | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Session Replay disabled — LD-801: no user interaction recording (COPPA).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip user context to prevent child PII in error payloads.
    beforeSend(event) {
      delete event.user;
      return event;
    },
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
  });
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, { extra: context });
}
