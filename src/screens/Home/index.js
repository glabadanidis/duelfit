import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../constants/supabase';
import { getUpcomingMatches, LEAGUES } from '../../constants/api';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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
  const [matches, setMatches] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadMatches();
  }, []);

  async function loadMatches(league = selectedLeague) {
    setLoading(true);
    try {
      const data = await getUpcomingMatches(league.id);
      setMatches(data.slice(0, 10));
    } catch (e) {
      setMatches([]);
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  }

  async function selectLeague(league) {
    setSelectedLeague(league);
    await loadMatches(league);
  }

  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player';

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
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          {[
            { label: 'Points', value: '0' },
            { label: 'Won', value: '0' },
            { label: 'Lost', value: '0' },
            { label: 'Win Rate', value: '-%' },
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
          </View>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyText}>No active challenges yet</Text>
            <Text style={styles.emptySubtext}>Pick a match below and challenge a friend!</Text>
          </View>
        </View>

        {/* Upcoming Matches */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Upcoming Matches</Text>

          {/* League Filter */}
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

          {loading ? (
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
  statsBar: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.primary, fontWeight: 'bold', fontSize: 18 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: colors.white, fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
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
