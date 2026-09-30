import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../constants/supabase';
import ReliabilityBadge from '../../components/ReliabilityBadge';
import { reliabilityDetail } from '../../constants/reliability';
import colors from '../../constants/colors';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ won: 0, lost: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
      const completed = challenges.filter(c => c.status === 'completed');
      const won = completed.filter(c => c.winner_id === user.id).length;
      const lost = completed.filter(c => c.winner_id && c.winner_id !== user.id).length;
      const pending = challenges.filter(c => c.status === 'pending' || c.status === 'accepted').length;
      setStats({ won, lost, pending });
    }

    setLoading(false);
  }

  // Square crop, then into avatars/<user id>/ under a new name each time, see
  // 20260930000001_profile_avatars.sql. The old file goes only once the new URL
  // is saved, so a failed upload never leaves the profile pointing at nothing.
  async function changeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photos to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user.id}/${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: 'base64' });
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: saveError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (saveError) throw saveError;

      const oldPath = profile?.avatar_url?.split('/avatars/')[1];
      if (oldPath) supabase.storage.from('avatars').remove([oldPath]);
      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

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
          <TouchableOpacity onPress={changeAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            <View style={styles.avatar}>
              {profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                : <Text style={styles.avatarText}>{initials}</Text>}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}
            </View>
            <View style={styles.avatarEdit}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.fullName}>{profile?.full_name || 'Player'}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
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

        {/* Reliability replaces Win Rate: whether you do your forfeits matters
            more to an opponent than how often you predict right. */}
        <View style={styles.reliabilityCard}>
          <View>
            <Text style={styles.reliabilityLabel}>Reliability</Text>
            <Text style={styles.reliabilityDetail}>
              {reliabilityDetail(profile?.forfeits_done, profile?.forfeits_ducked)}
            </Text>
          </View>
          <ReliabilityBadge done={profile?.forfeits_done} ducked={profile?.forfeits_ducked} />
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

        {/* No action yet, inviting people who are not on DuelFit is still to be built */}
        <TouchableOpacity style={styles.inviteBtn} activeOpacity={0.8}>
          <Text style={styles.inviteBtnText}>✉️ Invite Friends</Text>
        </TouchableOpacity>

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
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  avatarImage: { width: 88, height: 88 },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 34 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'AA', alignItems: 'center', justifyContent: 'center' },
  avatarEdit: { position: 'absolute', right: -2, bottom: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarEditIcon: { fontSize: 14 },
  fullName: { color: colors.white, fontWeight: 'bold', fontSize: 22, marginBottom: 4 },
  username: { color: colors.textSecondary, fontSize: 15, marginBottom: 12 },

  statsGrid: { flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.primary, fontWeight: 'bold', fontSize: 22 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },

  reliabilityCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reliabilityLabel: { color: colors.white, fontWeight: '600', fontSize: 14 },
  reliabilityDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  infoCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  infoTitle: { color: colors.white, fontWeight: 'bold', fontSize: 15, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { color: colors.textSecondary, fontSize: 14 },
  infoValue: { color: colors.white, fontSize: 14, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.border },

  inviteBtn: { marginHorizontal: 20, backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  inviteBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 14 },

  quickLinks: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden' },
  quickLink: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  quickLinkEmoji: { fontSize: 18, marginRight: 12 },
  quickLinkText: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '500' },
  quickLinkArrow: { color: colors.textSecondary, fontSize: 20 },
  quickLinkDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  logoutBtn: { marginHorizontal: 20, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  logoutText: { color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
});
