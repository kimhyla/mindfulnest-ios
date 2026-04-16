import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function DecorationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Space — Decoration</Text>
      <Text style={styles.subtitle}>Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description}>
        Child is taken to MyHouse or the Carriage (based on lastCarouselPage).
        Place decorations, admire items, explore the space.
        Leave when ready to return to the map.
      </Text>

      <Link href="/" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Return to Map</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCE4EC", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#AD1457", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#AD1457", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
