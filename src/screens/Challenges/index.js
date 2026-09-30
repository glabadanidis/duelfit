import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import { lookupEvent, getF1RaceFlag } from '../../constants/api';
import { TeamSide } from '../../components/MatchRow';
import colors from '../../constants/colors';

// match_date is the fixture's calendar date with no kick off time, so this counts
// whole days. Parsed as a local date: new Date('2026-10-04') would be UTC midnight
// and could land on the day before.
function startsIn(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d) - today) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'Waiting for the result';
  if (days === 0) return 'Starts today';
  if (days === 1) return 'Starts tomorrow';
  return `Starts in ${days} days`;
}

// Home over away with logos, as on Home. F1 challenges are stored with the race
// name as the home team and 'F1 Race' as the away team, see Step4Opponent.
function MatchTeams({ item, badges }) {
  if (item.match_away_team === 'F1 Race') {
    return (
      <Text style={styles.raceName} numberOfLines={2}>
        {getF1RaceFlag(item.match_home_team)} {item.match_home_team}
      </Text>
    );
  }
  return (
    <View style={styles.matchTeams}>
      <TeamSide name={item.match_home_team} badge={item.match_home_badge || badges?.home} />
      <TeamSide name={item.match_away_team} badge={item.match_away_badge || badges?.away} />
    </View>
  );
}

function ActiveChallengeCard({ item, badges, currentUserId, onAccept, onDecline, onCancel, onPress }) {
  const isReceived = item.opponent_id === currentUserId;
  const isSent = item.challenger_id === currentUserId;
  const otherUser = isReceived ? item.challenger?.username : item.opponent?.username;
  const isPending = item.status === 'pending';
  const statusColor = isPending ? '#F59E0B' : '#10B981';
  const statusLabel = isPending ? 'Pending' : 'Active';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {isReceived ? `⚔️ vs @${otherUser}` : `📤 @${otherUser}`}
          </Text>
          <Text style={styles.cardDate}>{startsIn(item.match_date)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.matchRow}>
        <Text style={styles.matchLeague}>{item.match_league}</Text>
        <MatchTeams item={item} badges={badges} />
      </View>

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

      {isReceived && item.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineBtn} onPress={() => onDecline(item.id)}>
            <Text style={styles.declineBtnText}>✕  Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(item)}>
            <Text style={styles.acceptBtnText}>✓  Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {isSent && item.status === 'pending' && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => onCancel(item.id)}>
          <Text style={styles.cancelBtnText}>✕  Cancel Challenge</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function CompletedChallengeCard({ item, badges, currentUserId, onPress }) {
  const isReceived = item.opponent_id === currentUserId;
  const otherUser = isReceived ? item.challenger?.username : item.opponent?.username;
  const isWon = item.winner_id === currentUserId;
  const isLost = item.winner_id && item.winner_id !== currentUserId;
  const resultColor = isWon ? '#10B981' : isLost ? '#EF4444' : colors.textSecondary;
  const resultLabel = isWon ? '🏆 Won' : isLost ? '💔 Lost' : item.status === 'declined' ? '✕ Declined' : 'Draw';

  return (
    <TouchableOpacity style={[styles.card, styles.completedCard]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            vs @{otherUser}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: resultColor + '22', borderColor: resultColor }]}>
          <Text style={[styles.badgeText, { color: resultColor }]}>{resultLabel}</Text>
        </View>
      </View>

      <View style={styles.matchRow}>
        <Text style={styles.matchLeague}>{item.match_league}</Text>
        <MatchTeams item={item} badges={badges} />
      </View>

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
    </TouchableOpacity>
  );
}

export default function ChallengesScreen({ navigation }) {
  const [userId, setUserId] = useState(null);
  const [challenges, setChallenges] = useState([]);
  // Labelled In progress and History: "Open" read like a public duel anyone can join
  const [tab, setTab] = useState('active'); // 'active' | 'completed'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const realtimeSubRef = useRef(null);
  // Logos for challenges created before match_home_badge existed, by match_id
  const [lookedUpBadges, setLookedUpBadges] = useState({});
  const requestedBadges = useRef(new Set());

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Same guards as the Home subscription, see the comment there.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      realtimeSubRef.current = supabase
        .channel(`challenges-screen:${user.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `opponent_id=eq.${user.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `challenger_id=eq.${user.id}` }, () => loadData())
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (realtimeSubRef.current) supabase.removeChannel(realtimeSubRef.current);
      realtimeSubRef.current = null;
    };
  }, []);

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
    if (!error) lookUpMissingBadges(data || []);
  }

  // One lookup per match, never repeated, through the serialised queue in api.js.
  // Only older challenges need it, new ones store the badges when created.
  function lookUpMissingBadges(list) {
    const ids = [...new Set(list
      .filter(c => c.match_id && !c.match_home_badge && c.match_away_team !== 'F1 Race')
      .map(c => c.match_id))]
      .filter(id => !requestedBadges.current.has(id));
    ids.forEach(id => {
      requestedBadges.current.add(id);
      lookupEvent(id).then(data => {
        const e = data?.events?.[0];
        if (!e) return;
        setLookedUpBadges(prev => ({ ...prev, [id]: { home: e.strHomeTeamBadge, away: e.strAwayTeamBadge } }));
      }).catch(() => {});
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function handleAccept(challenge) {
    navigation.navigate('AcceptPick', { challenge });
  }

  async function handleCancel(challengeId) {
    Alert.alert('Cancel Challenge', 'Are you sure you want to cancel this challenge?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Challenge', style: 'destructive',
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase
            .from('challenges')
            .delete()
            .eq('id', challengeId)
            .eq('challenger_id', user.id)
            .eq('status', 'pending');
          if (error) return Alert.alert('Error', error.message);
          loadData();
        },
      },
    ]);
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

  const activeChallenges = challenges.filter(c => c.status === 'pending' || c.status === 'accepted');
  const completedChallenges = challenges.filter(c => c.status === 'completed' || c.status === 'declined');

  const pendingCount = activeChallenges.filter(c => c.opponent_id === userId && c.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚔️ Challenges</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'active' && styles.tabActive]}
          onPress={() => setTab('active')}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>
            In progress {pendingCount > 0 ? `(${pendingCount})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => setTab('completed')}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            History {completedChallenges.length > 0 ? `(${completedChallenges.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tab === 'active' ? activeChallenges : completedChallenges}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>{tab === 'active' ? '⚔️' : '🏆'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'active' ? 'Nothing in progress' : 'No history yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {tab === 'active' ? 'Go to Home and challenge someone!' : 'Finish a challenge to see results here'}
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            tab === 'active' ? (
              <ActiveChallengeCard
                item={item}
                badges={lookedUpBadges[item.match_id]}
                currentUserId={userId}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onCancel={handleCancel}
                onPress={() => navigation.navigate('ChallengeDetail', { challenge: item, currentUserId: userId })}
              />
            ) : (
              <CompletedChallengeCard
                item={item}
                badges={lookedUpBadges[item.match_id]}
                currentUserId={userId}
                onPress={() => navigation.navigate('ChallengeDetail', { challenge: item, currentUserId: userId })}
              />
            )
          }
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
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: colors.white },

  list: { paddingHorizontal: 20, paddingBottom: 20 },

  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  completedCard: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: colors.white, fontWeight: '600', fontSize: 14 },
  cardDate: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  matchRow: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 10 },
  matchLeague: { color: colors.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  matchTeams: { gap: 6 },
  raceName: { color: colors.white, fontWeight: 'bold', fontSize: 14 },

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
  cancelBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, padding: 11, alignItems: 'center' },
  cancelBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 6 },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
