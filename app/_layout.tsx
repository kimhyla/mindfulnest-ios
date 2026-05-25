import { useEffect, type ReactElement } from "react";
import { Stack, Redirect, usePathname } from "expo-router";
import { AuthProvider } from "../src/contexts/AuthContext";
import { useAuth } from "../src/hooks/useAuth";
import { initAudioSession } from "../src/services/audioSession";
import { initActiveArcPin } from "../src/services/activeArcPin";
import { loadFromStorage as loadCacheIndex } from "../src/services/cacheIndex";
import { initializeAppCheck } from "../src/services/appCheckService";
import { initializeCrashlytics } from "../src/services/crashlyticsService";
import { initializeSentry } from "../src/services/sentryService";

function AuthGate({ children }: { children: ReactElement }): ReactElement {
  const { status } = useAuth();
  const pathname = usePathname();
  // Don't redirect while auth state is still resolving (avoids flashing
  // the sign-in screen on cold start for signed-in users).
  if (status === 'signedOut' && !pathname.startsWith('/(auth)') && !pathname.startsWith('/sign-')) {
    return <Redirect href="/sign-in" />;
  }
  return children;
}

export default function RootLayout(): ReactElement {
  useEffect(() => {
    // Track C init (LD-280/281/282/286): audio session category, active-arc
    // pin session UUID + stale-pin clear, cache index hydrate.
    // Fire-and-forget — these are idempotent and their failures do not block
    // app startup (audioSession init failure falls back to Expo defaults;
    // activeArcPin failure means eviction can over-evict this session, safe
    // failure mode; cacheIndex load failure drops to empty, files are
    // re-downloaded on demand).
    void initAudioSession();
    void initActiveArcPin();
    void loadCacheIndex();

    // G0 compliance inits (LD-802, LD-801): App Check attestation, Crashlytics
    // collection (disabled at launch, enabled on parent consent), Sentry error
    // monitoring. Sentry is synchronous. Crashlytics is fire-and-forget (COPPA
    // collection disabled at launch; init failure is non-fatal).
    // App Check is awaited inside an async IIFE so init errors surface rather
    // than being silently swallowed. When enforceAppCheck flips to true
    // (LD-802 gate), any Firebase callable made before this resolves will fail —
    // add a callable-layer readiness guard at that point.
    void (async () => {
      await initializeAppCheck();
    })();
    void initializeCrashlytics();
    initializeSentry();

    if (__DEV__) {
      // Conditional require so Metro DCEs the entire DevTelemetry + DevTelemetryServer
      // modules from production bundles. Top-level ES imports would survive tree-shaking.
      // typeof import(...) is a type-only expression (Babel-erased) preserving strict-mode types.
      // Per LD-157 Layer 1 (JS DCE) + Blocker #16 fix pattern.
      const { initDevTelemetry } =
        require("../src/dev/DevTelemetry") as typeof import("../src/dev/DevTelemetry");
      initDevTelemetry();
      // DevTelemetryServer is native-only; on web Platform.OS check inside the server's
      // safetyGatesPass() returns false. Wrapping the require in a Platform check would
      // also avoid bundling it for web — but the inner gate already prevents execution,
      // and Metro's per-platform bundle pruning drops native-only modules from web bundles.
      const { startDevTelemetryServer } =
        require("../src/dev/DevTelemetryServer") as typeof import("../src/dev/DevTelemetryServer");
      // Fire-and-forget — startDevTelemetryServer returns a Promise<boolean>; failures
      // are logged to console by the server itself. The cleanup return below stops it.
      void startDevTelemetryServer();
    }
    return () => {
      if (__DEV__) {
        const { stopDevTelemetryServer } =
          require("../src/dev/DevTelemetryServer") as typeof import("../src/dev/DevTelemetryServer");
        stopDevTelemetryServer();
      }
    };
  }, []);

  return (
    <AuthProvider>
      <AuthGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#4A6741" },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ title: "MindfulNest — Everdale Map" }} />
          <Stack.Screen name="intro" options={{ title: "The Call" }} />
          <Stack.Screen name="phase_a" options={{ title: "Buy-In + Phase A" }} />
          <Stack.Screen name="phase_b" options={{ title: "Phase B — Guided Meditation" }} />
          <Stack.Screen name="resolution" options={{ title: "The Rescue" }} />
          <Stack.Screen name="win" options={{ title: "Win!" }} />
          <Stack.Screen name="decoration" options={{ title: "My Space" }} />
          <Stack.Screen name="module/[moduleId]" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
