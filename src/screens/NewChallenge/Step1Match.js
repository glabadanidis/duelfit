import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUpcomingMatches, LEAGUES, getF1RaceFlag, getTeamFlag } from '../../constants/api';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Step1Match({ navigation }) {
  const { updateChallenge } = useChallenge();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0]);
  const [search, setSearch] = useState('');

  useEffect(() => { loadMatches(LEAGUES[0]); }, []);

  async function loadMatches(league) {
    setLoading(true);
    try {
      const data = await getUpcomingMatches(league.id);
      setMatches(data.slice(0, 15));
    } catch { setMatches([]); }
    setLoading(false);
  }

  async function selectLeague(league) {
    setSelectedLeague(league);
    await loadMatches(league);
  }

  const filtered = matches.filter(m =>
    m.strHomeTeam.toLowerCase().includes(search.toLowerCase()) ||
    m.strAwayTeam.toLowerCase().includes(search.toLowerCase())
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
        {LEAGUES.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[styles.chip, selectedLeague.id === l.id && styles.chipActive]}
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
              {match.strHomeTeam ? (
                <View style={styles.teams}>
                  <View style={styles.teamBlock}>
                    {getTeamFlag(match.strHomeTeam)
                      ? <Text style={styles.teamFlag}>{getTeamFlag(match.strHomeTeam)}</Text>
                      : match.strHomeTeamBadge
                        ? <Image source={{ uri: match.strHomeTeamBadge }} style={styles.teamBadge} resizeMode="contain" />
                        : null}
                    <Text style={styles.team} numberOfLines={1}>{match.strHomeTeam}</Text>
                  </View>
                  <Text style={styles.vs}>VS</Text>
                  <View style={styles.teamBlock}>
                    {getTeamFlag(match.strAwayTeam)
                      ? <Text style={styles.teamFlag}>{getTeamFlag(match.strAwayTeam)}</Text>
                      : match.strAwayTeamBadge
                        ? <Image source={{ uri: match.strAwayTeamBadge }} style={styles.teamBadge} resizeMode="contain" />
                        : null}
                    <Text style={styles.team} numberOfLines={1}>{match.strAwayTeam}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.raceName} numberOfLines={1}>{getF1RaceFlag(match.strEvent)} {match.strEvent}</Text>
              )}
              <Text style={styles.date}>📅 {formatDate(match.dateEvent)} · {match.strTime?.slice(0,5) || 'TBD'}</Text>
            </TouchableOpacity>
          ))}
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
  teams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  teamBlock: { flex: 1, alignItems: 'center', gap: 4 },
  teamBadge: { width: 36, height: 36 },
  teamFlag: { fontSize: 32 },
  team: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 11, marginHorizontal: 6 },
  date: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  raceName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'center', marginBottom: 6 },
});
