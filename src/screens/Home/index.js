import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import { getUpcomingMatches, LEAGUES } from '../../constants/api';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function ActiveChallengeCard({ item, currentUserId, onPress }) {
  const isReceived = item.opponent_id === currentUserId;
  const otherUser = isReceived ? item.challenger?.username : item.opponent?.username;
  const statusColor = item.status === 'accepted' ? '#10B981' : '#F59E0B';
  const statusLabel = item.status === 'accepted' ? 'Active' : 'Pending';

  return (
    <TouchableOpacity style={styles.activeChallengeCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.acTop}>
        <Text style={styles.acOpponent}>
          {isReceived ? `⚔️ vs @${otherUser}` : `📤 @${otherUser}`}
        </Text>
        <View style={[styles.acBadge, { borderColor: statusColor, backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.acBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.acMatch} numberOfLines={1}>
        {item.match_home_team} vs {item.match_away_team}
      </Text>
      <Text style={styles.acForfeit} numberOfLines={1}>🏃 Forfeit: {item.forfeit}</Text>
    </TouchableOpacity>
  );
}

function MatchCard({ match, onChallenge }) {
  return (
    <View style={styles.matchCard}>
      <Text style={styles.matchLeague}>{match.strLeague}</Text>
      <View style={styles.matchTeams}>
        <Text style={styles.teamName} numberOfLines={1}>{match.strHomeTeam}</Text>
        <Text style={styles.vs}>VS</Text>
        <Text style={styles.teamName} numberOfLines={1}>{match.strAwayTeam}</Text>
      </View>
      <Text style={styles.matchDate}>{formatDate(match.dateEvent)} · {match.strTime?.slice(0,5) || 'TBD'}</Text>
      <TouchableOpacity style={styles.challengeBtn} onPress={() => onChallenge(match)}>
        <Text style={styles.challengeBtnText}>⚔️ Challenge Someone</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { updateChallenge } = useChallenge();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeChallenges, setActiveChallenges] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUser(user);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, points')
      .eq('id', user.id)
      .single();
    if (profileData) setProfile(profileData);

    const { data: challenges } = await supabase
      .from('challenges')
      .select(`
        *,
        challenger:profiles!challenges_challenger_id_fkey(username),
        opponent:profiles!challenges_opponent_id_fkey(username)
      `)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });

    setActiveChallenges(challenges || []);
  }

  async function loadMatches(league = selectedLeague) {
    setLoadingMatches(true);
    try {
      const data = await getUpcomingMatches(league.id);
      setMatches(data.slice(0, 10));
    } catch (e) {
      setMatches([]);
    }
    setLoadingMatches(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadUserData(), loadMatches()]);
    setRefreshing(false);
  }

  async function selectLeague(league) {
    setSelectedLeague(league);
    await loadMatches(league);
  }

  const username = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player';

  const won = 0; // будет реализовано когато имаме completed challenges
  const lost = 0;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{username[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.greeting}>Welcome back 👋</Text>
              <Text style={styles.username}>@{username}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.notifIcon}>🔔</Text>
            {activeChallenges.filter(c => c.opponent_id === user?.id && c.status === 'pending').length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {activeChallenges.filter(c => c.opponent_id === user?.id && c.status === 'pending').length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          {[
            { label: 'Points', value: profile?.points ?? 0 },
            { label: 'Won', value: won },
            { label: 'Lost', value: lost },
            { label: 'Win Rate', value: `${winRate}%` },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Active Challenges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚔️ Active Challenges</Text>
            {activeChallenges.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Challenges')}>
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {activeChallenges.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={styles.emptyText}>No active challenges yet</Text>
              <Text style={styles.emptySubtext}>Pick a match below and challenge a friend!</Text>
            </View>
          ) : (
            activeChallenges.slice(0, 3).map(item => (
              <ActiveChallengeCard
                key={item.id}
                item={item}
                currentUserId={user?.id}
                onPress={() => navigation.navigate('Challenges')}
              />
            ))
          )}
        </View>

        {/* Upcoming Matches */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Upcoming Matches</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll}>
            {LEAGUES.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.leagueChip, selectedLeague.id === l.id && styles.leagueChipActive]}
                onPress={() => selectLeague(l)}
              >
                <Text style={styles.leagueChipText}>{l.emoji} {l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingMatches ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : matches.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No upcoming matches found</Text>
            </View>
          ) : (
            matches.map((match) => (
              <MatchCard
                key={match.idEvent}
                match={match}
                onChallenge={(m) => { updateChallenge({ match: m }); navigation.navigate('Step2Pick'); }}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 18 },
  greeting: { color: colors.textSecondary, fontSize: 12 },
  username: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  notifIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.background },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: 'bold' },

  statsBar: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.primary, fontWeight: 'bold', fontSize: 18 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: colors.white, fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
  seeAll: { color: colors.primary, fontSize: 13, fontWeight: '600', marginBottom: 12 },

  activeChallengeCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  acTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  acOpponent: { color: colors.white, fontWeight: '700', fontSize: 14 },
  acBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  acBadgeText: { fontSize: 11, fontWeight: '700' },
  acMatch: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  acForfeit: { color: colors.textSecondary, fontSize: 12 },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 14, marginBottom: 4 },
  emptySubtext: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },

  leagueScroll: { marginBottom: 16, marginHorizontal: -20, paddingHorizontal: 20 },
  leagueChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  leagueChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  leagueChipText: { color: colors.white, fontSize: 13, fontWeight: '500' },

  matchCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  matchLeague: { color: colors.textSecondary, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 12, marginHorizontal: 8 },
  matchDate: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  challengeBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  challengeBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
