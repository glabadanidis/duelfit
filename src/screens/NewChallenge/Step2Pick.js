import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

export default function Step2Pick({ navigation }) {
  const { challenge, updateChallenge } = useChallenge();
  const { match } = challenge;

  function selectPick(pick) {
    updateChallenge({ pick });
    navigation.navigate('Step3Forfeit');
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
        <Text style={styles.matchDate}>{match?.dateEvent}</Text>
      </View>

      <Text style={styles.question}>Who do you think will win?</Text>

      <View style={styles.options}>
        <TouchableOpacity style={styles.pickCard} onPress={() => selectPick(match?.strHomeTeam)}>
          <Text style={styles.pickEmoji}>🏠</Text>
          <Text style={styles.pickTeam}>{match?.strHomeTeam}</Text>
          <Text style={styles.pickLabel}>Home Win</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pickCard} onPress={() => selectPick('Draw')}>
          <Text style={styles.pickEmoji}>🤝</Text>
          <Text style={styles.pickTeam}>Draw</Text>
          <Text style={styles.pickLabel}>Equal Result</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pickCard} onPress={() => selectPick(match?.strAwayTeam)}>
          <Text style={styles.pickEmoji}>✈️</Text>
          <Text style={styles.pickTeam}>{match?.strAwayTeam}</Text>
          <Text style={styles.pickLabel}>Away Win</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontWeight: 'bold', fontSize: 17 },
  step: { color: colors.textSecondary, fontSize: 13 },
  matchBanner: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 32, borderWidth: 1, borderColor: colors.border },
  leagueName: { color: colors.primary, fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  matchDate: { color: colors.textSecondary, fontSize: 12 },
  question: { color: colors.white, fontWeight: 'bold', fontSize: 20, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  options: { paddingHorizontal: 20, gap: 12 },
  pickCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  pickEmoji: { fontSize: 36, marginBottom: 8 },
  pickTeam: { color: colors.white, fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' },
  pickLabel: { color: colors.textSecondary, fontSize: 12 },
});
