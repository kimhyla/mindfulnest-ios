import { useEffect } from "react";
import { Stack } from "expo-router";
import { initDevTelemetry } from "../src/dev/DevTelemetry";

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) {
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
