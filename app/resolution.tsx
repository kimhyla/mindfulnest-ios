import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function ResolutionScreen() {
  return (
    <View style={styles.container} testID="resolution_screen">
      <Text style={styles.title} testID="resolution_title">The Rescue — Resolution Video</Text>
      <Text style={styles.subtitle} testID="resolution_subtitle">Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description} testID="resolution_description">
        Full narrative video — equal or longer than the Intro video.
        The creature is rescued. Domain-specific visual effect plays
        (storm clearing, flowers blooming, etc.). Child watches the
        full resolution scene unfold. This is a major emotional payoff.
      </Text>

      <Link href="/win" asChild>
        <Pressable style={styles.button} testID="resolution_continue_button">
          <Text style={styles.buttonText} testID="resolution_continue_button_text">Continue to Win</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#2E7D32", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#2E7D32", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
