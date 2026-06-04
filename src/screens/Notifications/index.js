import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function notifFromChallenge(challenge, currentUserId) {
  const isChallenger = challenge.challenger_id === currentUserId;
  const isOpponent = challenge.opponent_id === currentUserId;
  const other = isChallenger ? challenge.opponent?.username : challenge.challenger?.username;

  if (challenge.status === 'pending' && isOpponent) {
    return {
      id: challenge.id,
      emoji: '⚔️',
      title: `@${other} challenged you!`,
      body: `${challenge.match_home_team} vs ${challenge.match_away_team}`,
      sub: `Forfeit: ${challenge.forfeit}`,
      color: '#F59E0B',
      time: challenge.created_at,
    };
  }
  if (challenge.status === 'accepted' && isChallenger) {
    return {
      id: challenge.id,
      emoji: '✅',
      title: `@${other} accepted your challenge!`,
      body: `${challenge.match_home_team} vs ${challenge.match_away_team}`,
      sub: `The duel is on — good luck!`,
      color: '#10B981',
      time: challenge.updated_at || challenge.created_at,
    };
  }
  if (challenge.status === 'declined' && isChallenger) {
    return {
      id: challenge.id,
      emoji: '❌',
      title: `@${other} declined your challenge`,
      body: `${challenge.match_home_team} vs ${challenge.match_away_team}`,
      sub: `Better luck next time`,
      color: '#EF4444',
      time: challenge.updated_at || challenge.created_at,
    };
  }
  if (challenge.status === 'completed') {
    const won = challenge.winner_id === currentUserId;
    return {
      id: challenge.id,
      emoji: won ? '🏆' : '👎',
      title: won ? 'You won the challenge!' : 'You lost the challenge',
      body: `${challenge.match_home_team} vs ${challenge.match_away_team}`,
      sub: won ? 'Points added to your profile' : `Forfeit: ${challenge.forfeit}`,
      color: won ? '#F59E0B' : '#EF4444',
      time: challenge.updated_at || challenge.created_at,
    };
  }
  return null;
}

function NotifCard({ notif, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: notif.color, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.emoji}>{notif.emoji}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.title}>{notif.title}</Text>
        <Text style={styles.body}>{notif.body}</Text>
        <Text style={styles.sub}>{notif.sub}</Text>
      </View>
      <Text style={styles.time}>{timeAgo(notif.time)}</Text>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  async function loadNotifications() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('challenges')
      .select(`
        *,
        challenger:profiles!challenges_challenger_id_fkey(username),
        opponent:profiles!challenges_opponent_id_fkey(username)
      `)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    const notifs = (data || [])
      .map(c => notifFromChallenge(c, user.id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    setNotifications(notifs);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔔 Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🔕</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>Challenge someone to get started!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotifCard
              notif={item}
              onPress={() => item.id && navigation.navigate('ChallengeDetail', { challengeId: item.id })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 32, lineHeight: 36 },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: 'bold' },

  list: { paddingHorizontal: 20, paddingBottom: 20 },

  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'flex-start' },
  cardLeft: { marginRight: 12, paddingTop: 2 },
  emoji: { fontSize: 24 },
  cardBody: { flex: 1 },
  title: { color: colors.white, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  body: { color: colors.textSecondary, fontSize: 12, marginBottom: 2 },
  sub: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  time: { color: colors.textSecondary, fontSize: 11, marginLeft: 8, paddingTop: 2 },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 6 },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
