import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";

export default function WinScreen() {
  return (
    <View style={styles.container} testID="win_screen">
      <Text style={styles.title} testID="win_title">Module Complete!</Text>
      <Text style={styles.subtitle} testID="win_subtitle">Stage 1 Scaffold — Placeholder</Text>
      <Text style={styles.description} testID="win_description">
        Coins awarded. Spell learned and added to Spell Book.
        Rune stone glows. Tomorrow hook queued.
        Decoration reward always earned.
        Sometimes a special item is also given.
      </Text>

      <Link href="/decoration" asChild>
        <Pressable style={styles.button} testID="win_continue_button">
          <Text style={styles.buttonText} testID="win_continue_button_text">Go to My Space</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8E1", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#F9A825", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  description: { fontSize: 14, color: "#555", marginBottom: 24, textAlign: "center", maxWidth: 400 },
  button: { backgroundColor: "#F9A825", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
