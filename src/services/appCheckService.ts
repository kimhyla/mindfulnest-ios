// App Check service — LD-802 APP_CHECK_NATIVE_RN_FIREBASE_V1
// Uses @react-native-firebase/app-check (DeviceCheck iOS / Play Integrity Android).
// Must be called at app startup before any Firebase callable is invoked.
//
// LD-802 gate closed 2026-05-25: onCall Cloud Functions (e.g. generateModuleDownloadUrl,
// claimTherapistInvite) use enforceAppCheck: true. Client init here attaches tokens to
// outbound requests; callables made before initializeAppCheck() resolves will fail.
import appCheck from '@react-native-firebase/app-check';

let initPromise: Promise<void> | null = null;

export async function initializeAppCheck(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = initializeAppCheckOnce();
  return initPromise;
}

export async function ensureAppCheckReady(): Promise<void> {
  await initializeAppCheck();
}

async function initializeAppCheckOnce(): Promise<void> {
  const provider = appCheck().newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: {
      // DeviceCheck in production; debug token in dev builds.
      provider: __DEV__ ? 'debug' : 'deviceCheck',
      debugToken: __DEV__ ? process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN : undefined,
    },
    android: {
      // Play Integrity in production; debug token in dev builds.
      provider: __DEV__ ? 'debug' : 'playIntegrity',
      debugToken: __DEV__ ? process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN : undefined,
    },
  });
  await appCheck().initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
}
