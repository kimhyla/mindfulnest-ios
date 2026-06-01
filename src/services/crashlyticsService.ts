// Crashlytics service — spec §8.1, LD-345 PRE_LAUNCH_SERVICES_V1
// Collection disabled by default per LD-225 data minimization (COPPA).
// Call enableCrashlytics() only after parent has completed the consent flow.
import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
  setAttribute,
  recordError,
} from '@react-native-firebase/crashlytics';

export async function initializeCrashlytics(): Promise<void> {
  await setCrashlyticsCollectionEnabled(getCrashlytics(), false);
}

export async function enableCrashlytics(): Promise<void> {
  await setCrashlyticsCollectionEnabled(getCrashlytics(), true);
}

export function logError(error: Error, context?: Record<string, string>): void {
  const instance = getCrashlytics();
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      setAttribute(instance, key, value);
    });
  }
  recordError(instance, error);
}
