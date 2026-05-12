import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from '../../constants/colors';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function statusInfo(status) {
  const map = {
    pending:   { label: 'Pending',   color: '#F59E0B', emoji: '⏳' },
    accepted:  { label: 'Active',    color: '#10B981', emoji: '⚔️' },
    declined:  { label: 'Declined',  color: '#EF4444', emoji: '❌' },
    completed: { label: 'Completed', color: colors.textSecondary, emoji: '🏁' },
  };
  return map[status] || { label: status, color: colors.textSecondary, emoji: '❓' };
}

export default function ChallengeDetailScreen({ route, navigation }) {
  const { challenge, currentUserId } = route.params;
  const isChallenger = challenge.challenger_id === currentUserId;
  const myPick    = isChallenger ? challenge.challenger_pick : challenge.opponent_pick;
  const theirPick = isChallenger ? challenge.opponent_pick  : challenge.challenger_pick;
  const theirUsername = isChallenger
    ? challenge.opponent?.username
    : challenge.challenger?.username;
  const myUsername = isChallenger
    ? challenge.challenger?.username
    : challenge.opponent?.username;

  const status = statusInfo(challenge.status);
  const isWinner   = challenge.winner_id === currentUserId;
  const isLoser    = challenge.status === 'completed' && challenge.winner_id && !isWinner;
  const isDraw     = challenge.status === 'completed' && !challenge.winner_id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenge Detail</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: status.color + '18', borderColor: status.color }]}>
          <Text style={styles.statusEmoji}>{status.emoji}</Text>
          <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
        </View>

        {/* Result banner for completed */}
        {challenge.status === 'completed' && (
          <View style={[styles.resultBanner, {
            backgroundColor: isDraw ? '#F59E0B18' : isWinner ? '#10B98118' : '#EF444418',
            borderColor: isDraw ? '#F59E0B' : isWinner ? '#10B981' : '#EF4444',
          }]}>
            <Text style={styles.resultEmoji}>{isDraw ? '🤝' : isWinner ? '🏆' : '💪'}</Text>
            <Text style={[styles.resultText, { color: isDraw ? '#F59E0B' : isWinner ? '#10B981' : '#EF4444' }]}>
              {isDraw ? "It's a draw!" : isWinner ? 'You won!' : 'You lost'}
            </Text>
            {isWinner && <Text style={styles.resultSub}>+10 points earned</Text>}
            {isLoser  && <Text style={styles.resultSub}>Forfeit: {challenge.forfeit}</Text>}
          </View>
        )}

        {/* Match Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚽ Match</Text>
          <Text style={styles.league}>{challenge.match_league}</Text>
          <View style={styles.matchRow}>
            <Text style={styles.teamName} numberOfLines={2}>{challenge.match_home_team}</Text>
            <Text style={styles.vs}>VS</Text>
            <Text style={styles.teamName} numberOfLines={2}>{challenge.match_away_team}</Text>
          </View>
          <Text style={styles.matchDate}>{formatDate(challenge.match_date)}</Text>
        </View>

        {/* Players */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Players</Text>
          <View style={styles.playersRow}>
            <View style={styles.playerSide}>
              <View style={[styles.playerAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.playerAvatarText}>{myUsername?.[0]?.toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>@{myUsername}</Text>
              <Text style={styles.playerRole}>You</Text>
            </View>
            <Text style={styles.playerVs}>⚔️</Text>
            <View style={styles.playerSide}>
              <View style={[styles.playerAvatar, { backgroundColor: '#6366F1' }]}>
                <Text style={styles.playerAvatarText}>{theirUsername?.[0]?.toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>@{theirUsername}</Text>
              <Text style={styles.playerRole}>Opponent</Text>
            </View>
          </View>
        </View>

        {/* Picks */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎯 Picks</Text>
          <View style={styles.picksRow}>
            <View style={styles.pickSide}>
              <Text style={styles.pickLabel}>Your pick</Text>
              <Text style={[styles.pickValue, !myPick && { color: colors.textSecondary }]}>
                {myPick || '—'}
              </Text>
            </View>
            <View style={styles.pickDivider} />
            <View style={styles.pickSide}>
              <Text style={styles.pickLabel}>@{theirUsername}</Text>
              <Text style={[styles.pickValue, !theirPick && { color: colors.textSecondary }]}>
                {theirPick || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Forfeit */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏃 Forfeit</Text>
          <Text style={styles.forfeitText}>{challenge.forfeit}</Text>
          <Text style={styles.forfeitSub}>The loser must complete this forfeit</Text>
        </View>

        {/* Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Timeline</Text>
          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>Sent</Text>
            <Text style={styles.timelineValue}>{formatDate(challenge.created_at)}</Text>
          </View>
          {challenge.status !== 'pending' && (
            <View style={styles.timelineRow}>
              <Text style={styles.timelineLabel}>
                {challenge.status === 'declined' ? 'Declined' : 'Accepted'}
              </Text>
              <Text style={styles.timelineValue}>{formatDate(challenge.updated_at || challenge.created_at)}</Text>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 32, lineHeight: 36 },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: 'bold' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, gap: 8 },
  statusEmoji: { fontSize: 20 },
  statusLabel: { fontWeight: '700', fontSize: 16 },

  resultBanner: { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, alignItems: 'center' },
  resultEmoji: { fontSize: 32, marginBottom: 6 },
  resultText: { fontWeight: '800', fontSize: 20, marginBottom: 4 },
  resultSub: { color: colors.textSecondary, fontSize: 13 },

  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },

  league: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 15, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 13, marginHorizontal: 10 },
  matchDate: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },

  playersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerSide: { flex: 1, alignItems: 'center' },
  playerAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  playerAvatarText: { color: colors.white, fontWeight: 'bold', fontSize: 20 },
  playerName: { color: colors.white, fontWeight: '600', fontSize: 13, marginBottom: 2 },
  playerRole: { color: colors.textSecondary, fontSize: 11 },
  playerVs: { fontSize: 24, marginHorizontal: 10 },

  picksRow: { flexDirection: 'row', alignItems: 'center' },
  pickSide: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  pickLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  pickValue: { color: colors.white, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  pickDivider: { width: 1, height: 40, backgroundColor: colors.border },

  forfeitText: { color: colors.white, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  forfeitSub: { color: colors.textSecondary, fontSize: 12 },

  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  timelineLabel: { color: colors.textSecondary, fontSize: 13 },
  timelineValue: { color: colors.white, fontSize: 13, fontWeight: '500' },
});
