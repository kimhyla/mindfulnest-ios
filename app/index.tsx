import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Link } from "expo-router";
import { getDevTelemetry, updateDevTelemetry } from "../src/dev/DevTelemetry";
import type { DevTelemetryData } from "../src/dev/DevTelemetry";

export default function MapScreen() {
  const [telemetry, setTelemetry] = useState<DevTelemetryData | null>(null);

  useEffect(() => {
    if (__DEV__) {
      updateDevTelemetry({ currentScreen: "home" });
      setTelemetry(getDevTelemetry());
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Everdale Map</Text>
      <Text style={styles.subtitle}>Stage 1 Scaffold — Placeholder</Text>

      {/* DEV-ONLY: Telemetry status banner — proves Layer 3 is working */}
      {__DEV__ && telemetry && (
        <View style={styles.telemetryBanner}>
          <Text style={styles.telemetryTitle}>Layer 3 Telemetry: ACTIVE</Text>
          <Text style={styles.telemetryText}>
            v{telemetry.version} | {telemetry.health.platform} | devMode={String(telemetry.health.devMode)}
          </Text>
          <Text style={styles.telemetryText}>
            screen={telemetry.state.currentScreen} | coins={telemetry.state.coinBalance} | stones={telemetry.state.stonesCollected.length}
          </Text>
        </View>
      )}

      <View style={styles.creaturesContainer}>
        <Text style={styles.sectionLabel}>Creatures</Text>
        <Text style={styles.creature}>M1 Tessa — Body Stone (Orange)</Text>
        <Text style={styles.creature}>M2 Luna — Watching Stone (Yellow)</Text>
        <Text style={styles.creature}>M4 Ember — Heart Stone (Red)</Text>
        <Text style={styles.creature}>M6 Bramble — Calm Stone (Blue)</Text>
        <Text style={styles.creature}>M3 Benson — Courage Stone (Green)</Text>
        <Text style={styles.creature}>M5 Mo — Grounding Stone (Purple)</Text>
      </View>

      <Link href="/intro" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Tap Creature (Start Module)</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#2E7D32", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  creaturesContainer: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 24, width: "100%", maxWidth: 400 },
  sectionLabel: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 8 },
  creature: { fontSize: 14, color: "#555", paddingVertical: 4 },
  button: { backgroundColor: "#4A6741", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  telemetryBanner: { backgroundColor: "#1B5E20", borderRadius: 8, padding: 12, marginBottom: 16, width: "100%", maxWidth: 400 },
  telemetryTitle: { color: "#A5D6A7", fontSize: 12, fontWeight: "bold", marginBottom: 4 },
  telemetryText: { color: "#C8E6C9", fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
});
