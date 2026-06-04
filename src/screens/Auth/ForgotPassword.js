import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    if (!email) return Alert.alert('Error', 'Please enter your email address.');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>DUELFIT</Text>
        <Text style={styles.checkmark}>✉️</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a password reset link to{'\n'}
          <Text style={styles.emailHighlight}>{email}</Text>
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Login')}>
          <Text style={styles.buttonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>DUELFIT</Text>
      <Text style={styles.title}>Forgot Password?</Text>
      <Text style={styles.subtitle}>Enter your email and we'll send you a reset link</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoFocus
      />

      <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Send Reset Link</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>← Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 28, fontWeight: 'bold', color: colors.primary, letterSpacing: 4, marginBottom: 24 },
  checkmark: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.white, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 32, textAlign: 'center', lineHeight: 20 },
  emailHighlight: { color: colors.white, fontWeight: '600' },
  input: { width: '100%', backgroundColor: colors.surface, color: colors.white, borderRadius: 10,
    padding: 14, marginBottom: 14, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  button: { width: '100%', backgroundColor: colors.primary, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 20 },
  buttonText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  link: { color: colors.textSecondary, fontSize: 14 },
});
