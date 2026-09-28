import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ won: 0, lost: 0, pending: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  async function loadProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { data: challenges } = await supabase
      .from('challenges')
      .select('status, winner_id, challenger_id, opponent_id')
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`);

    if (profileData) setProfile(profileData);

    if (challenges) {
      const total = challenges.length;
      const completed = challenges.filter(c => c.status === 'completed');
      const won = completed.filter(c => c.winner_id === user.id).length;
      const lost = completed.filter(c => c.winner_id && c.winner_id !== user.id).length;
      const pending = challenges.filter(c => c.status === 'pending' || c.status === 'accepted').length;
      setStats({ won, lost, pending, total });
    }

    setLoading(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const winRate = stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0;
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : profile?.username?.[0]?.toUpperCase() || '?';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>👤 Profile</Text>
        </View>

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.fullName}>{profile?.full_name || 'Player'}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsText}>⚡ {profile?.points || 0} points</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.won}</Text>
            <Text style={styles.statLabel}>Won</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.lost}</Text>
            <Text style={styles.statLabel}>Lost</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        {/* Win Rate Bar */}
        <View style={styles.winRateCard}>
          <View style={styles.winRateHeader}>
            <Text style={styles.winRateLabel}>Win Rate</Text>
            <Text style={styles.winRateValue}>{winRate}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${winRate}%` }]} />
          </View>
        </View>

        {/* Account Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Account</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>@{profile?.username}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member since</Text>
            <Text style={styles.infoValue}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                : '—'}
            </Text>
          </View>
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('FriendsTab', { tab: 'friends' })}>
            <Text style={styles.quickLinkEmoji}>👥</Text>
            <Text style={styles.quickLinkText}>Friends</Text>
            <Text style={styles.quickLinkArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.quickLinkDivider} />
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.quickLinkEmoji}>⚙️</Text>
            <Text style={styles.quickLinkText}>Settings</Text>
            <Text style={styles.quickLinkArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Log Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 40 },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: 'bold' },

  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 34 },
  fullName: { color: colors.white, fontWeight: 'bold', fontSize: 22, marginBottom: 4 },
  username: { color: colors.textSecondary, fontSize: 15, marginBottom: 12 },
  pointsBadge: { backgroundColor: colors.primary + '22', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: colors.primary },
  pointsText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  statsGrid: { flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.primary, fontWeight: 'bold', fontSize: 22 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },

  winRateCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  winRateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  winRateLabel: { color: colors.white, fontWeight: '600', fontSize: 14 },
  winRateValue: { color: colors.primary, fontWeight: 'bold', fontSize: 14 },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },

  infoCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  infoTitle: { color: colors.white, fontWeight: 'bold', fontSize: 15, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { color: colors.textSecondary, fontSize: 14 },
  infoValue: { color: colors.white, fontSize: 14, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.border },

  quickLinks: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden' },
  quickLink: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  quickLinkEmoji: { fontSize: 18, marginRight: 12 },
  quickLinkText: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '500' },
  quickLinkArrow: { color: colors.textSecondary, fontSize: 20 },
  quickLinkDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  logoutBtn: { marginHorizontal: 20, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  logoutText: { color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
});
