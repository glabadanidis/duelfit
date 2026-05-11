import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

function Medal({ rank }) {
  if (rank === 1) return <Text style={styles.medal}>🥇</Text>;
  if (rank === 2) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 3) return <Text style={styles.medal}>🥉</Text>;
  return <Text style={styles.rankNum}>#{rank}</Text>;
}

function LeaderboardRow({ item, rank, isCurrentUser }) {
  const initials = item.full_name
    ? item.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : item.username?.[0]?.toUpperCase() || '?';

  return (
    <View style={[styles.row, isCurrentUser && styles.rowHighlight, rank <= 3 && styles.rowTop]}>
      <View style={styles.rankCol}>
        <Medal rank={rank} />
      </View>
      <View style={[styles.avatar, isCurrentUser && styles.avatarCurrent]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.nameCol}>
        <Text style={[styles.name, isCurrentUser && styles.nameCurrent]}>
          {item.full_name || item.username}
          {isCurrentUser ? '  (You)' : ''}
        </Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>
      <View style={styles.pointsCol}>
        <Text style={[styles.points, rank === 1 && { color: '#F59E0B' }]}>
          {item.points ?? 0}
        </Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const [players, setPlayers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserRank, setCurrentUserRank] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadLeaderboard();
    }, [])
  );

  async function loadLeaderboard() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, points')
      .order('points', { ascending: false })
      .limit(50);

    if (data) {
      setPlayers(data);
      if (user) {
        const rank = data.findIndex(p => p.id === user.id) + 1;
        setCurrentUserRank(rank > 0 ? rank : null);
      }
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏆 Leaderboard</Text>
        {currentUserRank && (
          <View style={styles.myRankBadge}>
            <Text style={styles.myRankText}>Your rank: #{currentUserRank}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={players}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            top3.length >= 3 ? (
              <View style={styles.podium}>
                {/* 2nd place */}
                <View style={[styles.podiumItem, styles.podiumSecond]}>
                  <Text style={styles.podiumEmoji}>🥈</Text>
                  <View style={[styles.podiumAvatar, { backgroundColor: '#9CA3AF' }]}>
                    <Text style={styles.podiumAvatarText}>
                      {top3[1]?.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>@{top3[1]?.username}</Text>
                  <Text style={styles.podiumPts}>{top3[1]?.points ?? 0} pts</Text>
                  <View style={[styles.podiumBar, { height: 60, backgroundColor: '#9CA3AF33' }]} />
                </View>

                {/* 1st place */}
                <View style={[styles.podiumItem, styles.podiumFirst]}>
                  <Text style={styles.podiumEmoji}>🥇</Text>
                  <View style={[styles.podiumAvatar, { backgroundColor: '#F59E0B' }]}>
                    <Text style={styles.podiumAvatarText}>
                      {top3[0]?.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>@{top3[0]?.username}</Text>
                  <Text style={styles.podiumPts}>{top3[0]?.points ?? 0} pts</Text>
                  <View style={[styles.podiumBar, { height: 80, backgroundColor: '#F59E0B33' }]} />
                </View>

                {/* 3rd place */}
                <View style={[styles.podiumItem, styles.podiumThird]}>
                  <Text style={styles.podiumEmoji}>🥉</Text>
                  <View style={[styles.podiumAvatar, { backgroundColor: '#CD7F32' }]}>
                    <Text style={styles.podiumAvatarText}>
                      {top3[2]?.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>@{top3[2]?.username}</Text>
                  <Text style={styles.podiumPts}>{top3[2]?.points ?? 0} pts</Text>
                  <View style={[styles.podiumBar, { height: 44, backgroundColor: '#CD7F3233' }]} />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={styles.emptyText}>No players yet</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <LeaderboardRow
              item={item}
              rank={index + 1}
              isCurrentUser={item.id === currentUserId}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
  myRankBadge: { backgroundColor: colors.primary + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.primary },
  myRankText: { color: colors.primary, fontWeight: '700', fontSize: 12 },

  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 24, gap: 8 },
  podiumItem: { flex: 1, alignItems: 'center' },
  podiumFirst: { marginBottom: 0 },
  podiumSecond: { marginBottom: 0 },
  podiumThird: { marginBottom: 0 },
  podiumEmoji: { fontSize: 24, marginBottom: 6 },
  podiumAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumAvatarText: { color: colors.white, fontWeight: 'bold', fontSize: 18 },
  podiumName: { color: colors.white, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  podiumPts: { color: colors.textSecondary, fontSize: 11, marginBottom: 6 },
  podiumBar: { width: '100%', borderRadius: 6 },

  list: { paddingHorizontal: 20, paddingBottom: 20 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rowHighlight: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  rowTop: { borderColor: colors.border },

  rankCol: { width: 36, alignItems: 'center' },
  medal: { fontSize: 22 },
  rankNum: { color: colors.textSecondary, fontWeight: 'bold', fontSize: 15 },

  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '44', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  avatarCurrent: { backgroundColor: colors.primary },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },

  nameCol: { flex: 1 },
  name: { color: colors.white, fontWeight: '600', fontSize: 14 },
  nameCurrent: { color: colors.primary },
  username: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },

  pointsCol: { alignItems: 'flex-end' },
  points: { color: colors.primary, fontWeight: 'bold', fontSize: 18 },
  pointsLabel: { color: colors.textSecondary, fontSize: 11 },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15 },
});
