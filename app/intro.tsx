import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function IntroScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Call — Intro Video</Text>
      <Text style={styles.subtitle}>Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description}>
        Narrative scene plays. The creature is in trouble.
        Guide Bird explains the situation. Child sees what is happening.
      </Text>

      <Link href="/phase_a" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Continue to Buy-In + Phase A</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#E65100", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#E65100", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
