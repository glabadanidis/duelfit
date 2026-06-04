import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChallenge } from '../../constants/challengeContext';
import { SPORTS, F1_DRIVERS, F1_TEAM_LOGOS, getTeamFlag } from '../../constants/api';
import colors from '../../constants/colors';

const FOOTBALL_LEAGUE_IDS = new Set(SPORTS.find(s => s.id === 'football').leagues.map(l => l.id));
const F1_LEAGUE_ID = 4370;

function TeamBadge({ uri, teamName }) {
  const flag = getTeamFlag(teamName);
  if (flag) {
    return <Text style={styles.teamFlag}>{flag}</Text>;
  }
  if (uri) {
    return <Image source={{ uri }} style={styles.teamLogo} resizeMode="contain" />;
  }
  return (
    <View style={styles.teamLogoFallback}>
      <Text style={styles.teamLogoFallbackText}>{teamName?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

function F1DriverPicker({ selected, onSelect }) {
  return (
    <ScrollView style={styles.driverList} showsVerticalScrollIndicator={false}>
      {F1_DRIVERS.map(driver => {
        const logoUri = F1_TEAM_LOGOS[driver];
        return (
          <TouchableOpacity
            key={driver}
            style={[styles.driverRow, selected === driver && styles.driverRowActive]}
            onPress={() => onSelect(driver)}
          >
            {logoUri ? (
              <Image
                source={{ uri: logoUri }}
                style={styles.driverTeamLogo}
                resizeMode="contain"
                onError={() => {}}
              />
            ) : (
              <Text style={styles.driverEmoji}>🏎️</Text>
            )}
            <Text style={[styles.driverName, selected === driver && styles.driverNameActive]}>
              {driver}
            </Text>
            {selected === driver && <Text style={styles.driverCheck}>✓</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function Step2Pick({ navigation }) {
  const { challenge, updateChallenge } = useChallenge();
  const { match } = challenge;
  const isF1 = Number(match?.idLeague) === F1_LEAGUE_ID;
  const showDraw = !isF1 && (match?.idLeague ? FOOTBALL_LEAGUE_IDS.has(Number(match.idLeague)) : true);
  const [f1Pick, setF1Pick] = useState(null);

  function selectPick(pick) {
    updateChallenge({ pick });
    navigation.navigate('Step3Forfeit');
  }

  function confirmF1Pick() {
    if (!f1Pick) return;
    selectPick(f1Pick);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pick Your Side</Text>
        <Text style={styles.step}>2 of 4</Text>
      </View>

      <View style={styles.matchBanner}>
        <Text style={styles.leagueName}>{match?.strLeague}</Text>
        <Text style={styles.matchDate}>
          {isF1 ? match?.strEvent : match?.dateEvent}
        </Text>
      </View>

      <Text style={styles.question}>
        {isF1 ? 'Who will win the race?' : 'Who do you think will win?'}
      </Text>

      {isF1 ? (
        <>
          <F1DriverPicker selected={f1Pick} onSelect={setF1Pick} />
          <TouchableOpacity
            style={[styles.confirmBtn, !f1Pick && styles.confirmBtnDisabled]}
            onPress={confirmF1Pick}
            disabled={!f1Pick}
          >
            <Text style={styles.confirmBtnText}>
              {f1Pick ? `✓  Pick ${f1Pick}` : 'Select a driver'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.options}>
          <TouchableOpacity style={styles.pickCard} onPress={() => selectPick(match?.strHomeTeam)}>
            <TeamBadge uri={match?.strHomeTeamBadge} teamName={match?.strHomeTeam} />
            <Text style={styles.pickTeam}>{match?.strHomeTeam}</Text>
            <Text style={styles.pickLabel}>Home Win</Text>
          </TouchableOpacity>

          {showDraw && (
            <TouchableOpacity style={styles.pickCard} onPress={() => selectPick('Draw')}>
              <Text style={styles.pickEmoji}>🤝</Text>
              <Text style={styles.pickTeam}>Draw</Text>
              <Text style={styles.pickLabel}>Equal Result</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.pickCard} onPress={() => selectPick(match?.strAwayTeam)}>
            <TeamBadge uri={match?.strAwayTeamBadge} teamName={match?.strAwayTeam} />
            <Text style={styles.pickTeam}>{match?.strAwayTeam}</Text>
            <Text style={styles.pickLabel}>Away Win</Text>
          </TouchableOpacity>
        </View>
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
  matchBanner: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  leagueName: { color: colors.primary, fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  matchDate: { color: colors.textSecondary, fontSize: 12 },
  question: { color: colors.white, fontWeight: 'bold', fontSize: 20, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },

  // F1 driver picker
  driverList: { flex: 1, paddingHorizontal: 20 },
  driverRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 12 },
  driverRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  driverEmoji: { fontSize: 20 },
  driverTeamLogo: { width: 32, height: 32 },
  driverName: { flex: 1, color: colors.white, fontWeight: '600', fontSize: 14 },
  driverNameActive: { color: colors.primary },
  driverCheck: { color: colors.primary, fontWeight: 'bold', fontSize: 16 },
  confirmBtn: { margin: 20, backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },

  // Team picker
  options: { paddingHorizontal: 20, gap: 12 },
  pickCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  teamFlag: { fontSize: 48, marginBottom: 10 },
  teamLogo: { width: 56, height: 56, marginBottom: 10 },
  teamLogoFallback: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  teamLogoFallbackText: { color: colors.white, fontWeight: 'bold', fontSize: 22 },
  pickEmoji: { fontSize: 36, marginBottom: 10 },
  pickTeam: { color: colors.white, fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' },
  pickLabel: { color: colors.textSecondary, fontSize: 12 },
});
