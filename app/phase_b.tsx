import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function PhaseBScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phase B — Guided Meditation</Text>
      <Text style={styles.subtitle}>Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description}>
        The child closes their eyes. Myrrhin narrates.
        Breathing circle syncs to audio cues.
      </Text>

      <Link href="/resolution" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Continue to Resolution</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EDE7F6", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#4527A0", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#4527A0", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
