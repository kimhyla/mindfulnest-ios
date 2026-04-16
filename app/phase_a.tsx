import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function PhaseAScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Buy-In + Phase A</Text>
      <Text style={styles.subtitle}>Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description}>
        Guide Bird gets the child excited about the technique (Buy-In).
        Then shows them what they are about to do (Phase A demo).
        One visual demo, brief narration, done.
      </Text>

      <Link href="/phase_b" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Begin Phase B</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E3F2FD", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#1565C0", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#1565C0", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
