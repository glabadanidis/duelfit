import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, SUPABASE_URL } from '../../constants/supabase';
import colors from '../../constants/colors';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function RowItem({ label, value, onPress, danger, last }) {
  return (
    <TouchableOpacity
      style={[styles.rowItem, !last && styles.rowItemBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Text style={[styles.rowLabel, danger && { color: '#EF4444' }]}>{label}</Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && <Text style={styles.rowArrow}>›</Text>}
    </TouchableOpacity>
  );
}

function ToggleRow({ label, subtitle, value, onChange, last }) {
  return (
    <View style={[styles.rowItem, !last && styles.rowItemBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit states
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');

  // Preferences (stored locally for now)
  const [notifChallenges, setNotifChallenges] = useState(true);
  const [notifResults, setNotifResults] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setProfile(data);
      setNewUsername(data.username);
      setNewName(data.full_name || '');
    }
    setLoading(false);
  }

  async function saveUsername() {
    if (newUsername.length < 3 || newUsername.includes(' ')) {
      return Alert.alert('Error', 'Username must be at least 3 characters with no spaces.');
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setProfile(p => ({ ...p, username: newUsername }));
    setEditingUsername(false);
    Alert.alert('Saved', 'Username updated!');
  }

  async function saveName() {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: newName })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setProfile(p => ({ ...p, full_name: newName }));
    setEditingName(false);
    Alert.alert('Saved', 'Name updated!');
  }

  async function changePassword() {
    Alert.alert(
      'Change Password',
      'We will send a password reset email to your address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.auth.resetPasswordForEmail(user.email);
            if (error) return Alert.alert('Error', error.message);
            Alert.alert('Email Sent', 'Check your inbox for the reset link.');
          },
        },
      ]
    );
  }

  async function deleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => Alert.alert(
            'Are you sure?',
            'Last chance — all your challenges, points and profile will be gone forever.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, delete my account', style: 'destructive',
                onPress: async () => {
                  setSaving(true);
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(
                    `${SUPABASE_URL}/functions/v1/delete-account`,
                    {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${session?.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    }
                  );
                  setSaving(false);
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    return Alert.alert('Error', body.error || 'Failed to delete account. Please try again.');
                  }
                  await supabase.auth.signOut();
                },
              },
            ]
          ),
        },
      ]
    );
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Profile */}
        <Section title="PROFILE">
          {editingUsername ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
                autoFocus
              />
              <TouchableOpacity style={styles.saveBtn} onPress={saveUsername} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingUsername(false)}>
                <Text style={styles.cancelBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <RowItem label="Username" value={`@${profile?.username}`} onPress={() => setEditingUsername(true)} />
          )}

          {editingName ? (
            <View style={[styles.editRow, styles.rowItemBorder]}>
              <TextInput
                style={styles.editInput}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingName(false)}>
                <Text style={styles.cancelBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <RowItem label="Full Name" value={profile?.full_name || '—'} onPress={() => setEditingName(true)} last />
          )}
        </Section>

        {/* Security */}
        <Section title="SECURITY">
          <RowItem label="Change Password" onPress={changePassword} last />
        </Section>

        {/* Notifications */}
        <Section title="NOTIFICATIONS">
          <ToggleRow
            label="Challenge Requests"
            subtitle="When someone challenges you"
            value={notifChallenges}
            onChange={setNotifChallenges}
          />
          <ToggleRow
            label="Match Results"
            subtitle="When a result is marked"
            value={notifResults}
            onChange={setNotifResults}
            last
          />
        </Section>

        {/* About */}
        <Section title="ABOUT">
          <RowItem label="Version" value="1.0.0" last />
        </Section>

        {/* Account */}
        <Section title="ACCOUNT">
          <RowItem label="Log Out" onPress={handleLogout} danger />
          <RowItem label="Delete Account" onPress={deleteAccount} danger last />
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 32, lineHeight: 36 },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: 'bold' },

  scroll: { paddingBottom: 40 },

  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  sectionCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  rowItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowItemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { flex: 1, color: colors.white, fontSize: 15 },
  rowSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowValue: { color: colors.textSecondary, fontSize: 14, marginRight: 6 },
  rowArrow: { color: colors.textSecondary, fontSize: 20 },

  editRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  editInput: { flex: 1, backgroundColor: colors.background, color: colors.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: colors.primary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  cancelBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: colors.textSecondary, fontSize: 16 },
});
