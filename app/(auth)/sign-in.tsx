import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { signIn } from '../../src/services/auth';
import { translateAuthError } from '../../src/services/authErrors';

export default function SignInScreen(): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // AuthContext's onAuthStateChanged will pick this up and route away.
    } catch (e: unknown) {
      setError(translateAuthError(e).userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Sign in</Text>
        <TextInput
          testID="sign-in-email"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={styles.input}
          placeholderTextColor="#999"
        />
        <TextInput
          testID="sign-in-password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoComplete="current-password"
          style={styles.input}
          placeholderTextColor="#999"
        />
        {error != null && <Text style={styles.error}>{error}</Text>}
        <Pressable
          testID="sign-in-submit"
          onPress={onSubmit}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Sign in</Text>}
        </Pressable>
        <Link href="/sign-up" style={styles.link}>
          <Text style={styles.linkText}>Need an account? Sign up</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  form: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#c33' },
  button: {
    backgroundColor: '#3b5bff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 8, alignItems: 'center' },
  linkText: { color: '#3b5bff' },
});
