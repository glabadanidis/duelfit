import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

export default function MarkResultScreen({ route, navigation }) {
  const { challenge, currentUserId } = route.params;
  const [selected, setSelected] = useState(null); // 'home' | 'draw' | 'away'
  const [loading, setLoading] = useState(false);

  const results = [
    { value: challenge.match_home_team, label: 'Home Win', emoji: '🏠' },
    { value: 'Draw',                    label: 'Draw',     emoji: '🤝' },
    { value: challenge.match_away_team, label: 'Away Win', emoji: '✈️' },
  ];

  function determineWinner(matchResult) {
    const challengerCorrect = challenge.challenger_pick === matchResult;
    const opponentCorrect   = challenge.opponent_pick   === matchResult;
    if (challengerCorrect && !opponentCorrect) return challenge.challenger_id;
    if (opponentCorrect && !challengerCorrect) return challenge.opponent_id;
    return null; // draw in picks — no winner
  }

  async function submitResult() {
    if (!selected) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.id !== challenge.challenger_id && user.id !== challenge.opponent_id)) {
      setLoading(false);
      return Alert.alert('Error', 'You are not a participant of this challenge.');
    }

    const winnerId = determineWinner(selected);

    const { data: updated, error } = await supabase
      .from('challenges')
      .update({ status: 'completed', winner_id: winnerId })
      .eq('id', challenge.id)
      .eq('status', 'accepted')
      .select('id')
      .single();

    if (error) {
      setLoading(false);
      return Alert.alert('Error', error.message);
    }

    // Only award points if we were the one to complete it (prevents double-award race)
    if (updated && winnerId) {
      await supabase.rpc('increment_points', { user_id: winnerId, amount: 10 });
    }

    setLoading(false);

    const isWinner = winnerId === currentUserId;
    const isDraw   = winnerId === null;

    Alert.alert(
      isDraw   ? "It's a draw! 🤝" :
      isWinner ? 'You won! 🏆'     : 'You lost 💪',
      isDraw   ? 'Both picked the same — no forfeit this time!' :
      isWinner ? 'Congrats! +10 points added to your profile.' :
                 `Forfeit: ${challenge.forfeit}. Time to pay up!`,
      [{ text: 'OK', onPress: () => navigation.navigate('Main') }]
    );
  }

  const myPick   = challenge.challenger_id === currentUserId ? challenge.challenger_pick : challenge.opponent_pick;
  const theirPick = challenge.challenger_id === currentUserId ? challenge.opponent_pick  : challenge.challenger_pick;
  const theirUsername = challenge.challenger_id === currentUserId
    ? challenge.opponent?.username
    : challenge.challenger?.username;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mark Result</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Match info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLeague}>{challenge.match_league}</Text>
          <View style={styles.matchRow}>
            <Text style={styles.teamName} numberOfLines={1}>{challenge.match_home_team}</Text>
            <Text style={styles.vs}>VS</Text>
            <Text style={styles.teamName} numberOfLines={1}>{challenge.match_away_team}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.picksRow}>
            <View style={styles.pickSide}>
              <Text style={styles.pickSideLabel}>Your pick</Text>
              <Text style={styles.pickSideValue}>{myPick}</Text>
            </View>
            <View style={styles.pickDivider} />
            <View style={styles.pickSide}>
              <Text style={styles.pickSideLabel}>@{theirUsername}</Text>
              <Text style={styles.pickSideValue}>{theirPick}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.question}>What was the actual result?</Text>

        <View style={styles.options}>
          {results.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[styles.resultCard, selected === r.value && styles.resultCardActive]}
              onPress={() => setSelected(r.value)}
            >
              <Text style={styles.resultEmoji}>{r.emoji}</Text>
              <Text style={styles.resultTeam} numberOfLines={2}>{r.value}</Text>
              <Text style={styles.resultLabel}>{r.label}</Text>
              {selected === r.value && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Preview outcome */}
        {selected && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Result preview:</Text>
            {determineWinner(selected) === currentUserId && (
              <Text style={styles.previewWin}>🏆 You win! +10 points</Text>
            )}
            {determineWinner(selected) !== currentUserId && determineWinner(selected) !== null && (
              <Text style={styles.previewLose}>💪 You lose — Forfeit: {challenge.forfeit}</Text>
            )}
            {determineWinner(selected) === null && (
              <Text style={styles.previewDraw}>🤝 Draw — same pick, no forfeit</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, !selected && styles.submitBtnDisabled]}
          onPress={submitResult}
          disabled={!selected || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.submitBtnText}>Confirm Result</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontWeight: 'bold', fontSize: 17 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  infoCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  infoLeague: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 12, marginHorizontal: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  picksRow: { flexDirection: 'row', alignItems: 'center' },
  pickSide: { flex: 1, alignItems: 'center' },
  pickSideLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 4 },
  pickSideValue: { color: colors.white, fontWeight: '700', fontSize: 13 },
  pickDivider: { width: 1, height: 32, backgroundColor: colors.border },

  question: { color: colors.white, fontWeight: 'bold', fontSize: 18, textAlign: 'center', marginBottom: 16 },

  options: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  resultCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  resultCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  resultEmoji: { fontSize: 28, marginBottom: 6 },
  resultTeam: { color: colors.white, fontWeight: 'bold', fontSize: 11, textAlign: 'center', marginBottom: 2 },
  resultLabel: { color: colors.textSecondary, fontSize: 10 },
  checkmark: { color: colors.primary, fontWeight: 'bold', fontSize: 16, marginTop: 4 },

  previewCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  previewTitle: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  previewWin:  { color: '#10B981', fontWeight: 'bold', fontSize: 16 },
  previewLose: { color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
  previewDraw: { color: '#F59E0B', fontWeight: 'bold', fontSize: 16 },

  submitBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
});
