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
import ReliabilityBadge from '../../components/ReliabilityBadge';
import colors from '../../constants/colors';

// The rest are one tap away in Challenges, the matches are what Home is for.
const MAX_ACTIVE_CARDS = 2;

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
  const [proofToReview, setProofToReview] = useState([]);
  const [matches, setMatches] = useState([]);
  const [availableSports, setAvailableSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [wonLost, setWonLost] = useState({ won: 0, lost: 0 });
  const [loadError, setLoadError] = useState(false);
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
      .select('username, forfeits_done, forfeits_ducked')
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
      .order('created_at', { ascending: false });

    const all = challenges || [];
    setActiveChallenges(all.filter(c => c.status === 'pending' || c.status === 'accepted'));

    const completed = all.filter(c => c.status === 'completed');
    const wonCount  = completed.filter(c => c.winner_id === user.id).length;
    const lostCount = completed.filter(c => c.winner_id && c.winner_id !== user.id).length;
    setWonLost({ won: wonCount, lost: lostCount });

    // Forfeits: lost challenges where no proof submitted yet, and the 7 days have
    // not run out. A ducked one is resolved and there is nothing left to do.
    setPendingForfeits(completed.filter(c => c.winner_id && c.winner_id !== user.id && !c.proof_url && !c.proof_photo_url && !c.forfeit_ducked));
    // Proof the loser sent and this user, the winner, has not approved or rejected.
    // The loser's own "waiting for approval" is not an action and is not listed.
    setProofToReview(completed.filter(c =>
      c.winner_id === user.id && (c.proof_url || c.proof_photo_url) && !c.proof_approved && !c.forfeit_ducked
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

  const openDetail = c => navigation.navigate('ChallengeDetail', { challenge: c, currentUserId: user?.id });
  const invites = activeChallenges.filter(c => c.opponent_id === user?.id && c.status === 'pending');
  const actions = [
    ...invites.map(c => ({
      key: `invite-${c.id}`, emoji: '⚔️', color: colors.primary,
      title: `@${c.challenger?.username} challenged you`,
      sub: `${c.match_home_team} vs ${c.match_away_team}`,
      onPress: () => navigation.navigate('AcceptPick', { challenge: c }),
    })),
    ...pendingForfeits.map(c => ({
      key: `forfeit-${c.id}`, emoji: '🏃', color: colors.unreliable,
      title: `Forfeit due: ${c.forfeit}`,
      sub: `${c.match_home_team} vs ${c.match_away_team}`,
      onPress: () => openDetail(c),
    })),
    ...proofToReview.map(c => ({
      key: `review-${c.id}`, emoji: '👀', color: colors.success,
      title: 'Review proof',
      sub: `${c.forfeit} · ${c.match_home_team} vs ${c.match_away_team}`,
      onPress: () => openDetail(c),
    })),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.navigate('Profile')} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{username[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.username}>@{username}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.notifIcon}>🔔</Text>
            {invites.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{invites.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Record and reliability. Points still exist and are still awarded, they
            are only not shown here. */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{won}–{lost}</Text>
            <Text style={styles.statLabel}>Record</Text>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statBadge}>
              <ReliabilityBadge done={profile?.forfeits_done} ducked={profile?.forfeits_ducked} />
            </View>
            <Text style={styles.statLabel}>Reliability</Text>
          </View>
        </View>

        {/* Requires your action, only when there is something */}
        {actions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚡ Requires your action</Text>
            <View style={styles.actionList}>
              {actions.map((a, i) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.actionRow, i > 0 && styles.actionRowDivider]}
                  onPress={a.onPress}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionDot, { backgroundColor: a.color }]} />
                  <Text style={styles.actionEmoji}>{a.emoji}</Text>
                  <View style={styles.actionBody}>
                    <Text style={styles.actionTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={styles.actionSub} numberOfLines={1}>{a.sub}</Text>
                  </View>
                  <Text style={styles.actionArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Active duels, at most two, the rest are in Challenges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleInline}>⚔️ Your active duels</Text>
            {activeChallenges.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Challenges')}>
                <Text style={styles.seeAll}>
                  {activeChallenges.length > MAX_ACTIVE_CARDS ? `See all ${activeChallenges.length} →` : 'See all →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {activeChallenges.length === 0 ? (
            <Text style={styles.emptyInline}>No active duels. Pick a match below to start one.</Text>
          ) : (
            activeChallenges.slice(0, MAX_ACTIVE_CARDS).map(item => (
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
                onChallenge={(m) => { updateChallenge({ match: m, opponent: null }); navigation.navigate('Step2Pick'); }}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 18 },
  username: { color: colors.white, fontWeight: 'bold', fontSize: 16, flexShrink: 1 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  notifIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.unreliable, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.background },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: 'bold' },

  statsBar: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.primary, fontWeight: 'bold', fontSize: 18 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  statBadge: { height: 24, justifyContent: 'center' },

  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: colors.white, fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
  sectionTitleInline: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  seeAll: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  actionList: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 14 },
  actionRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  actionDot: { width: 3, alignSelf: 'stretch', marginRight: 12 },
  actionEmoji: { fontSize: 18, marginRight: 10 },
  actionBody: { flex: 1 },
  actionTitle: { color: colors.white, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  actionSub: { color: colors.textSecondary, fontSize: 12 },
  actionArrow: { color: colors.textSecondary, fontSize: 22, marginLeft: 8 },

  activeChallengeCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  acTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  acOpponent: { color: colors.white, fontWeight: '700', fontSize: 14 },
  acBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  acBadgeText: { fontSize: 11, fontWeight: '700' },
  acMatch: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  acForfeit: { color: colors.textSecondary, fontSize: 12 },

  emptyInline: { color: colors.textSecondary, fontSize: 13 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
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
