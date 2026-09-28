import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import { getUpcomingMatches, getAvailableSports, WINDOW_DAYS } from '../../constants/api';
import { useChallenge } from '../../constants/challengeContext';
import MatchRow from '../../components/MatchRow';
import colors from '../../constants/colors';

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
      <View style={styles.matchRowWrap}>
        <MatchRow match={match} />
      </View>
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
  const [pendingForfeits, setPendingForfeits] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [matches, setMatches] = useState([]);
  const [availableSports, setAvailableSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [wonLost, setWonLost] = useState({ won: 0, lost: 0 });
  const [loadError, setLoadError] = useState(false);
  const [friendRequests, setFriendRequests] = useState(0);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  useEffect(() => {
    loadSports();
  }, []);

  // Sports and leagues with nothing on in the next WINDOW_DAYS days are not shown at all
  async function loadSports(force = false) {
    setLoadingMatches(true);
    let sports = [];
    try {
      sports = await getAvailableSports({ force });
    } catch (e) {
      sports = [];
    }
    setAvailableSports(sports);
    setSelectedSport(sports[0] || null);
    setSelectedLeague(sports[0]?.leagues[0] || null);
    await loadMatches(sports[0]?.leagues[0] || null);
  }

  // Two things keep this from throwing "cannot add postgres_changes callbacks
  // after subscribe()". supabase.channel() hands back an existing channel with the
  // same name, so the name is unique per mount. And if the screen unmounts before
  // getUser() resolves, which happens on logout and login, cancelled stops a
  // channel being created that the cleanup has already missed.
  useEffect(() => {
    let sub;
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      sub = supabase
        .channel(`home-challenges:${user.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `opponent_id=eq.${user.id}` }, () => loadUserData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `challenger_id=eq.${user.id}` }, () => loadUserData())
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (sub) supabase.removeChannel(sub);
    };
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

    const { count: incoming } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending');
    setFriendRequests(incoming || 0);

    const { data: challenges } = await supabase
      .from('challenges')
      .select(`
        *,
        challenger:profiles!challenges_challenger_id_fkey(username),
        opponent:profiles!challenges_opponent_id_fkey(username)
      `)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    const all = challenges || [];
    setActiveChallenges(all.filter(c => c.status === 'pending' || c.status === 'accepted'));

    const completed = all.filter(c => c.status === 'completed');
    const wonCount  = completed.filter(c => c.winner_id === user.id).length;
    const lostCount = completed.filter(c => c.winner_id && c.winner_id !== user.id).length;
    setWonLost({ won: wonCount, lost: lostCount });

    // Forfeits: lost challenges where no proof submitted yet
    setPendingForfeits(completed.filter(c => c.winner_id && c.winner_id !== user.id && !c.proof_url && !c.proof_photo_url));
    // Pending approval: lost challenges where proof submitted but winner hasn't approved
    setPendingApprovals(completed.filter(c =>
      (c.winner_id === user.id && (c.proof_url || c.proof_photo_url) && !c.proof_approved) ||
      (c.winner_id && c.winner_id !== user.id && (c.proof_url || c.proof_photo_url) && !c.proof_approved)
    ));
  }

  async function loadMatches(league = selectedLeague) {
    if (!league) {
      setMatches([]);
      setLoadingMatches(false);
      return;
    }
    setLoadingMatches(true);
    setLoadError(false);
    try {
      // null means the request failed, which is not the same as the league having no fixtures
      const data = await getUpcomingMatches(league.id);
      setMatches(data === null ? [] : data.slice(0, 10));
      setLoadError(data === null);
    } catch (e) {
      setMatches([]);
      setLoadError(true);
    }
    setLoadingMatches(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    // The window moves, so recheck which sports and leagues still qualify
    await Promise.all([loadUserData(), loadSports(true)]);
    setRefreshing(false);
  }

  async function selectSport(sport) {
    setSelectedSport(sport);
    setSelectedLeague(sport.leagues[0]);
    await loadMatches(sport.leagues[0]);
  }

  async function selectLeague(league) {
    setSelectedLeague(league);
    await loadMatches(league);
  }

  const username = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player';

  const { won, lost } = wonLost;
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
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => navigation.navigate('FriendsTab', { tab: friendRequests > 0 ? 'requests' : 'friends' })}
            >
              <Text style={styles.notifIcon}>👥</Text>
              {friendRequests > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{friendRequests}</Text>
                </View>
              )}
            </TouchableOpacity>
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

        {/* Pending Forfeits */}
        {pendingForfeits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👎 Pending Forfeits</Text>
            {pendingForfeits.map(c => (
              <TouchableOpacity
                key={c.id}
                style={styles.forfeitCard}
                onPress={() => navigation.navigate('ChallengeDetail', { challenge: c, currentUserId: user?.id })}
                activeOpacity={0.8}
              >
                <View style={styles.forfeitCardLeft}>
                  <Text style={styles.forfeitCardEmoji}>🏃</Text>
                </View>
                <View style={styles.forfeitCardBody}>
                  <Text style={styles.forfeitCardTitle}>{c.forfeit}</Text>
                  <Text style={styles.forfeitCardSub}>
                    {c.match_home_team} vs {c.match_away_team}
                  </Text>
                </View>
                <Text style={styles.forfeitCardArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pending Proof Approvals */}
        {pendingApprovals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👀 Proof to Review</Text>
            {pendingApprovals.map(c => {
              const isWinner = c.winner_id === user?.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.approvalCard}
                  onPress={() => navigation.navigate('ChallengeDetail', { challenge: c, currentUserId: user?.id })}
                  activeOpacity={0.8}
                >
                  <View style={styles.forfeitCardLeft}>
                    <Text style={styles.forfeitCardEmoji}>{isWinner ? '👀' : '⏳'}</Text>
                  </View>
                  <View style={styles.forfeitCardBody}>
                    <Text style={styles.forfeitCardTitle}>
                      {isWinner ? 'Review proof' : 'Waiting for approval'}
                    </Text>
                    <Text style={styles.forfeitCardSub}>{c.forfeit} · {c.match_home_team} vs {c.match_away_team}</Text>
                  </View>
                  <Text style={styles.forfeitCardArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

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

          {/* Sport tabs */}
          <View style={styles.sportTabs}>
            {availableSports.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.sportTab, selectedSport?.id === s.id && styles.sportTabActive]}
                onPress={() => selectSport(s)}
              >
                <Text style={styles.sportTabText}>{s.emoji} {s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* League chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll}>
            {(selectedSport?.leagues || []).map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.leagueChip, selectedLeague?.id === l.id && styles.leagueChipActive]}
                onPress={() => selectLeague(l)}
              >
                {l.logo
                  ? <Image source={{ uri: l.logo }} style={styles.leagueChipLogo} onError={() => {}} />
                  : <Text style={styles.leagueChipEmoji}>{l.emoji} </Text>
                }
                <Text style={styles.leagueChipText}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingMatches ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : matches.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {loadError ? 'Could not load fixtures' : `Nothing on in the next ${WINDOW_DAYS} days`}
              </Text>
              <Text style={styles.emptySubtext}>
                {loadError
                  ? 'Pull down to try again'
                  : 'Pull down to refresh once the next round is scheduled'}
              </Text>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  forfeitCard: { backgroundColor: '#EF444415', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#EF4444', flexDirection: 'row', alignItems: 'center' },
  forfeitCardLeft: { marginRight: 12 },
  forfeitCardEmoji: { fontSize: 22 },
  forfeitCardBody: { flex: 1 },
  forfeitCardTitle: { color: colors.white, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  forfeitCardSub: { color: colors.textSecondary, fontSize: 12 },
  forfeitCardArrow: { color: colors.textSecondary, fontSize: 22, marginLeft: 8 },
  approvalCard: { backgroundColor: '#10B98115', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#10B981', flexDirection: 'row', alignItems: 'center' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 14, marginBottom: 4 },
  emptySubtext: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },

  sportTabs: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  sportTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sportTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sportTabText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  leagueScroll: { marginBottom: 16, marginHorizontal: -20, paddingHorizontal: 20 },
  leagueChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  leagueChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  leagueChipLogo: { width: 18, height: 18, marginRight: 5, resizeMode: 'contain' },
  leagueChipEmoji: { fontSize: 13 },
  leagueChipText: { color: colors.white, fontSize: 13, fontWeight: '500' },

  matchCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  matchLeague: { color: colors.textSecondary, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchRowWrap: { marginBottom: 12 },
  challengeBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  challengeBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
