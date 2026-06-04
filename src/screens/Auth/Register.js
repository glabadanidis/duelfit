import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

export default function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null); // 'checking' | 'available' | 'taken' | 'invalid'
  const debounceRef = useRef(null);

  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus(username.length > 0 ? 'invalid' : null);
      return;
    }
    if (username.includes(' ')) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', username)
        .maybeSingle();
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500);
  }, [username]);

  async function handleRegister() {
    if (!fullName || !username || !email || !password || !confirm) {
      return Alert.alert('Error', 'Please fill in all fields.');
    }
    if (password !== confirm) {
      return Alert.alert('Error', 'Passwords do not match.');
    }
    if (password.length < 8) {
      return Alert.alert('Error', 'Password must be at least 8 characters.');
    }
    if (usernameStatus === 'taken') {
      return Alert.alert('Error', 'This username is already taken.');
    }
    if (usernameStatus === 'invalid' || username.length < 3 || username.includes(' ')) {
      return Alert.alert('Error', 'Username must be at least 3 characters with no spaces.');
    }
    if (usernameStatus === 'checking') {
      return Alert.alert('Please wait', 'Checking username availability...');
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, username } },
    });
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>DUELFIT</Text>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join the challenge</Text>

      <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={colors.textSecondary}
        value={fullName} onChangeText={setFullName} />
      <TextInput
        style={[
          styles.input,
          usernameStatus === 'available' && styles.inputValid,
          (usernameStatus === 'taken' || usernameStatus === 'invalid') && styles.inputError,
        ]}
        placeholder="Username"
        placeholderTextColor={colors.textSecondary}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      {usernameStatus === 'checking' && (
        <Text style={styles.statusChecking}>Checking availability…</Text>
      )}
      {usernameStatus === 'available' && (
        <Text style={styles.statusAvailable}>✓ Username available</Text>
      )}
      {usernameStatus === 'taken' && (
        <Text style={styles.statusTaken}>✗ Username already taken</Text>
      )}
      {usernameStatus === 'invalid' && (
        <Text style={styles.statusTaken}>Must be at least 3 characters, no spaces</Text>
      )}
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textSecondary}
        value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textSecondary}
        value={password} onChangeText={setPassword} secureTextEntry />
      <TextInput style={styles.input} placeholder="Confirm Password" placeholderTextColor={colors.textSecondary}
        value={confirm} onChangeText={setConfirm} secureTextEntry />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.replace('Login')}>
        <Text style={styles.link}>Already have an account? <Text style={styles.linkBold}>Log in</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 28, fontWeight: 'bold', color: colors.primary, letterSpacing: 4, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.white, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 32 },
  input: { width: '100%', backgroundColor: colors.surface, color: colors.white, borderRadius: 10,
    padding: 14, marginBottom: 14, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  inputValid: { borderColor: '#10B981' },
  inputError: { borderColor: '#EF4444' },
  statusChecking: { color: colors.textSecondary, fontSize: 12, marginTop: -10, marginBottom: 8, paddingHorizontal: 4 },
  statusAvailable: { color: '#10B981', fontSize: 12, marginTop: -10, marginBottom: 8, paddingHorizontal: 4 },
  statusTaken: { color: '#EF4444', fontSize: 12, marginTop: -10, marginBottom: 8, paddingHorizontal: 4 },
  button: { width: '100%', backgroundColor: colors.primary, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 20 },
  buttonText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  link: { color: colors.textSecondary, fontSize: 14 },
  linkBold: { color: colors.primary, fontWeight: 'bold' },
});
