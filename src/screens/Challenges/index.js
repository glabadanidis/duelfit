import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  const map = {
    pending:  { label: 'Pending',   color: '#F59E0B' },
    accepted: { label: 'Active',    color: '#10B981' },
    declined: { label: 'Declined',  color: '#EF4444' },
    completed:{ label: 'Completed', color: colors.textSecondary },
  };
  return map[status] || { label: status, color: colors.textSecondary };
}

function ChallengeCard({ item, currentUserId, onAccept, onDecline }) {
  const isReceived = item.opponent_id === currentUserId;
  const badge = statusBadge(item.status);
  const otherUser = isReceived ? item.challenger?.username : item.opponent?.username;

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarSmallText}>{otherUser?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.cardTitle}>
            {isReceived ? `⚔️ Challenge from @${otherUser}` : `📤 Sent to @${otherUser}`}
          </Text>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.color + '22', borderColor: badge.color }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      {/* Match info */}
      <View style={styles.matchRow}>
        <Text style={styles.matchLeague}>{item.match_league}</Text>
        <View style={styles.matchTeams}>
          <Text style={styles.teamName} numberOfLines={1}>{item.match_home_team}</Text>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.teamName} numberOfLines={1}>{item.match_away_team}</Text>
        </View>
      </View>

      {/* Picks */}
      <View style={styles.picksRow}>
        <View style={styles.pickItem}>
          <Text style={styles.pickLabel}>Your pick</Text>
          <Text style={styles.pickValue}>{isReceived ? item.opponent_pick || '—' : item.challenger_pick}</Text>
        </View>
        <View style={styles.pickDivider} />
        <View style={styles.pickItem}>
          <Text style={styles.pickLabel}>Forfeit</Text>
          <Text style={styles.pickValue} numberOfLines={1}>{item.forfeit}</Text>
        </View>
      </View>

      {/* Accept / Decline for received pending challenges */}
      {isReceived && item.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineBtn} onPress={() => onDecline(item.id)}>
            <Text style={styles.declineBtnText}>✕  Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(item.id)}>
            <Text style={styles.acceptBtnText}>✓  Accept</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const [userId, setUserId] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [tab, setTab] = useState('received'); // 'received' | 'sent'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data, error } = await supabase
      .from('challenges')
      .select(`
        *,
        challenger:profiles!challenges_challenger_id_fkey(username),
        opponent:profiles!challenges_opponent_id_fkey(username)
      `)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (!error) setChallenges(data || []);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleAccept(challengeId) {
    const { error } = await supabase
      .from('challenges')
      .update({ status: 'accepted' })
      .eq('id', challengeId);
    if (error) return Alert.alert('Error', error.message);
    loadData();
  }

  async function handleDecline(challengeId) {
    Alert.alert('Decline Challenge', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('challenges')
            .update({ status: 'declined' })
            .eq('id', challengeId);
          if (error) return Alert.alert('Error', error.message);
          loadData();
        },
      },
    ]);
  }

  const filtered = challenges.filter(c =>
    tab === 'received' ? c.opponent_id === userId : c.challenger_id === userId
  );

  const receivedCount = challenges.filter(c => c.opponent_id === userId && c.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚔️ Challenges</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Received {receivedCount > 0 ? `(${receivedCount})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sent' && styles.tabActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>Sent</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>{tab === 'received' ? '📭' : '📤'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'received' ? 'No challenges received yet' : 'No challenges sent yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {tab === 'received' ? 'Ask a friend to challenge you!' : 'Go to Home and challenge someone!'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChallengeCard
              item={item}
              currentUserId={userId}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: 'bold' },

  tabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.white },

  list: { paddingHorizontal: 20, paddingBottom: 20 },

  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  cardTitle: { color: colors.white, fontWeight: '600', fontSize: 14 },
  cardDate: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  matchRow: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 10 },
  matchLeague: { color: colors.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  matchTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 11, marginHorizontal: 6 },

  picksRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pickItem: { flex: 1, alignItems: 'center' },
  pickLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 2 },
  pickValue: { color: colors.white, fontWeight: '600', fontSize: 13 },
  pickDivider: { width: 1, height: 30, backgroundColor: colors.border },

  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, padding: 11, alignItems: 'center' },
  declineBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  acceptBtn: { flex: 1, backgroundColor: '#10B981', borderRadius: 10, padding: 11, alignItems: 'center' },
  acceptBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 6 },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
