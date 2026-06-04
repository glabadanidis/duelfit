import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../constants/supabase';
import { notifyChallengeAccepted } from '../../constants/notifications';
import { F1_DRIVERS, getTeamFlag } from '../../constants/api';
import colors from '../../constants/colors';

const F1_LEAGUE_ID = 4370;

export default function AcceptPickScreen({ route, navigation }) {
  const { challenge } = route.params;
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const isF1 = Number(challenge.match_id?.toString().length) > 0 &&
    challenge.match_league?.toLowerCase().includes('formula');

  const options = [
    { value: challenge.match_home_team, emoji: getTeamFlag(challenge.match_home_team) || '🏠', label: 'Home Win' },
    { value: 'Draw',                    emoji: '🤝', label: 'Draw'     },
    { value: challenge.match_away_team, emoji: getTeamFlag(challenge.match_away_team) || '✈️', label: 'Away Win' },
  ];

  async function confirmAccept() {
    if (!selected) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== challenge.opponent_id) {
      setLoading(false);
      return Alert.alert('Error', 'You are not the opponent of this challenge.');
    }
    const { error } = await supabase
      .from('challenges')
      .update({ status: 'accepted', opponent_pick: selected })
      .eq('id', challenge.id)
      .eq('opponent_id', user.id)
      .eq('status', 'pending');
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
    notifyChallengeAccepted(challenge.challenger_id, profile?.username || 'Someone');

    Alert.alert('Challenge Accepted! ⚔️', `You picked: ${selected}\nMay the best prediction win!`, [
      { text: 'OK', onPress: () => navigation.navigate('Main') },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Accept Challenge</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Challenge info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoLeague}>{challenge.match_league}</Text>
        <View style={styles.matchRow}>
          <Text style={styles.teamName} numberOfLines={1}>{challenge.match_home_team}</Text>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.teamName} numberOfLines={1}>{challenge.match_away_team}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Opponent's pick</Text>
          <Text style={styles.infoValue}>{challenge.challenger_pick}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Forfeit</Text>
          <Text style={styles.infoValue}>{challenge.forfeit}</Text>
        </View>
      </View>

      <Text style={styles.question}>
        {isF1 ? 'Who will win the race?' : 'Now pick YOUR side:'}
      </Text>

      {isF1 ? (
        <ScrollView style={styles.driverList} showsVerticalScrollIndicator={false}>
          {F1_DRIVERS.filter(d => d !== challenge.challenger_pick).map(driver => (
            <TouchableOpacity
              key={driver}
              style={[styles.driverRow, selected === driver && styles.driverRowActive]}
              onPress={() => setSelected(driver)}
            >
              <Text style={styles.driverEmoji}>🏎️</Text>
              <Text style={[styles.driverName, selected === driver && styles.driverNameActive]}>
                {driver}
              </Text>
              {selected === driver && <Text style={styles.driverCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.options}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.pickCard,
                selected === opt.value && styles.pickCardActive,
                opt.value === challenge.challenger_pick && styles.pickCardTaken,
              ]}
              onPress={() => {
                if (opt.value === challenge.challenger_pick) return;
                setSelected(opt.value);
              }}
            >
              <Text style={styles.pickEmoji}>{opt.emoji}</Text>
              <Text style={styles.pickTeam} numberOfLines={2}>{opt.value}</Text>
              <Text style={styles.pickLabel}>{opt.label}</Text>
              {opt.value === challenge.challenger_pick && (
                <Text style={styles.takenLabel}>Opponent's pick</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.acceptBtn, !selected && styles.acceptBtnDisabled]}
        onPress={confirmAccept}
        disabled={!selected || loading}
      >
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.acceptBtnText}>✓  Accept Challenge</Text>
        }
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontWeight: 'bold', fontSize: 17 },

  infoCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  infoLeague: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 12, marginHorizontal: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  infoLabel: { color: colors.textSecondary, fontSize: 13 },
  infoValue: { color: colors.white, fontSize: 13, fontWeight: '600' },

  question: { color: colors.white, fontWeight: 'bold', fontSize: 18, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },

  driverList: { flex: 1, paddingHorizontal: 20, marginBottom: 8 },
  driverRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 12 },
  driverRowActive: { borderColor: '#10B981', backgroundColor: '#10B98115' },
  driverEmoji: { fontSize: 20 },
  driverName: { flex: 1, color: colors.white, fontWeight: '600', fontSize: 14 },
  driverNameActive: { color: '#10B981' },
  driverCheck: { color: '#10B981', fontWeight: 'bold', fontSize: 16 },
  options: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 24 },
  pickCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  pickCardActive: { borderColor: '#10B981', backgroundColor: '#10B98115' },
  pickCardTaken: { opacity: 0.6 },
  pickEmoji: { fontSize: 28, marginBottom: 6 },
  pickTeam: { color: colors.white, fontWeight: 'bold', fontSize: 12, marginBottom: 2, textAlign: 'center' },
  pickLabel: { color: colors.textSecondary, fontSize: 11 },
  takenLabel: { color: '#F59E0B', fontSize: 10, fontWeight: '700', marginTop: 4 },

  acceptBtn: { marginHorizontal: 20, backgroundColor: '#10B981', borderRadius: 14, padding: 16, alignItems: 'center' },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
});
