import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUpcomingMatches, getAvailableLeagues, WINDOW_DAYS } from '../../constants/api';
import { useChallenge } from '../../constants/challengeContext';
import MatchRow from '../../components/MatchRow';
import colors from '../../constants/colors';

export default function Step1Match({ navigation }) {
  const { updateChallenge } = useChallenge();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { loadLeagues(); }, []);

  // Only leagues with something on in the next WINDOW_DAYS days are offered
  async function loadLeagues() {
    setLoading(true);
    let available = [];
    try {
      available = await getAvailableLeagues();
    } catch { available = []; }
    setLeagues(available);
    setSelectedLeague(available[0] || null);
    await loadMatches(available[0] || null);
  }

  async function loadMatches(league) {
    if (!league) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      // null means the request failed, which is not the same as the league having no fixtures
      const data = await getUpcomingMatches(league.id);
      setMatches(data === null ? [] : data.slice(0, 15));
      setLoadError(data === null);
    } catch {
      setMatches([]);
      setLoadError(true);
    }
    setLoading(false);
  }

  async function selectLeague(league) {
    setSelectedLeague(league);
    await loadMatches(league);
  }

  const filtered = matches.filter(m =>
    (m.strHomeTeam?.toLowerCase() || m.strEvent?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (m.strAwayTeam?.toLowerCase() || '').includes(search.toLowerCase())
  );

  function selectMatch(match) {
    updateChallenge({ match });
    navigation.navigate('Step2Pick');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pick a Match</Text>
        <Text style={styles.step}>1 of 4</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search teams..."
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll}>
        {leagues.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[styles.chip, selectedLeague?.id === l.id && styles.chipActive]}
            onPress={() => selectLeague(l)}
          >
            {l.logo
              ? <Image source={{ uri: l.logo }} style={styles.chipLogo} />
              : <Text style={styles.chipEmoji}>{l.emoji} </Text>
            }
            <Text style={styles.chipText}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {filtered.map(match => (
            <TouchableOpacity key={match.idEvent} style={styles.matchCard} onPress={() => selectMatch(match)}>
              <Text style={styles.league}>{match.strLeague}</Text>
              <MatchRow match={match} />
            </TouchableOpacity>
          ))}

          {filtered.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {loadError ? 'Could not load fixtures' : `Nothing on in the next ${WINDOW_DAYS} days`}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontWeight: 'bold', fontSize: 17 },
  step: { color: colors.textSecondary, fontSize: 13 },
  search: { marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: colors.white, borderWidth: 1, borderColor: colors.border },
  leagueScroll: { paddingHorizontal: 20, marginBottom: 16, maxHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLogo: { width: 16, height: 16, marginRight: 5, resizeMode: 'contain' },
  chipEmoji: { fontSize: 12 },
  chipText: { color: colors.white, fontSize: 12, fontWeight: '500' },
  list: { paddingHorizontal: 20 },
  matchCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  league: { color: colors.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
