// App Check service — LD-802 APP_CHECK_NATIVE_RN_FIREBASE_V1
// Uses @react-native-firebase/app-check (DeviceCheck iOS / Play Integrity Android).
// Must be called at app startup before any Firebase callable is invoked.
//
// Ordering gate (LD-802): enforceAppCheck on Cloud Functions remains false
// until a device-level proof confirms this token attaches to outbound onCall
// requests. This init wires the client side; the CF flip is a separate step.
import appCheck from '@react-native-firebase/app-check';

export async function initializeAppCheck(): Promise<void> {
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
