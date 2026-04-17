import { useEffect } from "react";
import { Stack } from "expo-router";

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) {
      // Conditional require so Metro DCEs the entire DevTelemetry module from
      // production bundles. Top-level ES import would survive tree-shaking.
      // typeof import(...) is a type-only expression (Babel-erased) preserving strict-mode types.
      const { initDevTelemetry } =
        require("../src/dev/DevTelemetry") as typeof import("../src/dev/DevTelemetry");
      initDevTelemetry();
    }
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#4A6741" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "MindfulNest — Everdale Map" }} />
      <Stack.Screen name="intro" options={{ title: "The Call" }} />
      <Stack.Screen name="phase_a" options={{ title: "Buy-In + Phase A" }} />
      <Stack.Screen name="phase_b" options={{ title: "Phase B — Guided Meditation" }} />
      <Stack.Screen name="resolution" options={{ title: "The Rescue" }} />
      <Stack.Screen name="win" options={{ title: "Win!" }} />
      <Stack.Screen name="decoration" options={{ title: "My Space" }} />
    </Stack>
  );
}
