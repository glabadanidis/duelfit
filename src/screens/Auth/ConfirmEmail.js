import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

export default function ConfirmEmailScreen({ route, navigation }) {
  const { email } = route.params || {};

  async function resend() {
    if (!email) return;
    await supabase.auth.resend({ type: 'signup', email });
    alert('Confirmation email resent. Check your inbox.');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📧</Text>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent a confirmation link to{'\n'}
        <Text style={styles.email}>{email}</Text>
        {'\n\n'}Tap the link in the email to activate your account, then come back and log in.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Login')}>
        <Text style={styles.btnText}>Go to Login</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={resend}>
        <Text style={styles.resend}>Didn't receive it? Resend email</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 64, marginBottom: 24 },
  title: { color: colors.white, fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  email: { color: colors.primary, fontWeight: '600' },
  btn: { width: '100%', backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  btnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  resend: { color: colors.primary, fontSize: 14 },
});
