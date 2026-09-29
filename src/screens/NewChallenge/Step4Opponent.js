import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import { useChallenge } from '../../constants/challengeContext';
import { notifyChallengeSent } from '../../constants/notifications';
import ReliabilityBadge from '../../components/ReliabilityBadge';
import colors from '../../constants/colors';

export default function Step4Opponent({ navigation }) {
  const { challenge, updateChallenge, resetChallenge } = useChallenge();
  const { match, pick, forfeit } = challenge;
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState([]);
  const [others, setOthers] = useState([]);
  const [userId, setUserId] = useState(null);
  const latestQuery = useRef('');
  // Already chosen when the wizard was started from a friend's ⚔️ on the Friends tab
  const [opponent, setOpponent] = useState(challenge.opponent);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Reloads on focus so that adding a friend via the Friends screen and coming
  // back shows them straight away.
  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [])
  );

  // Friends come first so the usual opponents are one tap away. Anyone else can
  // still be challenged by searching their username, see onSearch.
  async function loadFriends() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase
      .from('friendships')
      .select(`
        requester_id,
        requester:profiles!friendships_requester_id_fkey(id, username, full_name, forfeits_done, forfeits_ducked),
        addressee:profiles!friendships_addressee_id_fkey(id, username, full_name, forfeits_done, forfeits_ducked)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const list = (data || [])
      .map(f => (f.requester_id === user.id ? f.addressee : f.requester))
      .filter(Boolean)
      .sort((a, b) => a.username.localeCompare(b.username));
    setFriends(list);
    setLoading(false);
  }

  // Filters the friends list locally and, from two characters on, also searches
  // every player. latestQuery drops a slow response to an earlier keystroke so it
  // cannot overwrite the results for what is typed now.
  async function onSearch(text) {
    setSearch(text);
    const q = text.trim();
    latestQuery.current = q;
    if (q.length < 2) { setOthers([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, forfeits_done, forfeits_ducked')
      .ilike('username', `%${q}%`)
      .neq('id', userId)
      .limit(10);
    if (latestQuery.current === q) setOthers(data || []);
  }

  const query = search.trim().toLowerCase();
  const shown = query
    ? friends.filter(u =>
        u.username.toLowerCase().includes(query) ||
        (u.full_name || '').toLowerCase().includes(query))
    : friends;
  const friendIds = new Set(friends.map(u => u.id));
  const otherPlayers = query.length >= 2 ? others.filter(u => !friendIds.has(u.id)) : [];
  // A player challenged from the Friends tab search is not a friend and would not
  // be in either list, so they are shown on their own until someone else is picked.
  const chosenElsewhere = opponent && !friendIds.has(opponent.id) && !otherPlayers.some(u => u.id === opponent.id);

  function renderUser(u) {
    return (
      <TouchableOpacity
        key={u.id}
        style={[styles.userCard, opponent?.id === u.id && styles.userCardActive]}
        onPress={() => setOpponent(u)}
      >
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{u.username[0].toUpperCase()}</Text>
        </View>
        <View>
          <View style={styles.userNameRow}>
            <Text style={styles.userUsername}>@{u.username}</Text>
            <ReliabilityBadge compact done={u.forfeits_done} ducked={u.forfeits_ducked} username={u.username} />
          </View>
          <Text style={styles.userFullName}>{u.full_name}</Text>
        </View>
        {opponent?.id === u.id && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
    );
  }

  async function sendChallenge() {
    if (!opponent) return Alert.alert('Error', 'Please select an opponent.');
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from('challenges').insert({
      challenger_id: user.id,
      opponent_id: opponent.id,
      match_id: match.idEvent,
      match_home_team: match.strHomeTeam || match.strEvent || 'F1 Race',
      match_away_team: match.strAwayTeam || 'F1 Race',
      match_date: match.dateEvent,
      match_league: match.strLeague,
      challenger_pick: pick,
      forfeit,
      status: 'pending',
    }).select('id').single();
    setSending(false);
    if (error) return Alert.alert('Error', error.message);

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
    const matchLabel = match.strHomeTeam && match.strAwayTeam
      ? `${match.strHomeTeam} vs ${match.strAwayTeam}`
      : match.strEvent || 'F1 Race';
    notifyChallengeSent(opponent.id, profile?.username || 'Someone', matchLabel, inserted?.id);

    resetChallenge();
    Alert.alert('Challenge Sent! ⚔️', `Your challenge has been sent to @${opponent.username}!`, [
      { text: 'OK', onPress: () => navigation.navigate('Main') },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pick Opponent</Text>
        <Text style={styles.step}>4 of 4</Text>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Challenge Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Match</Text>
            <Text style={styles.summaryValue}>
              {match?.strHomeTeam && match?.strAwayTeam
                ? `${match.strHomeTeam} vs ${match.strAwayTeam}`
                : match?.strEvent || 'F1 Race'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Your pick</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{pick}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Forfeit</Text>
            <Text style={styles.summaryValue}>{forfeit}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Pick your opponent:</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends or any username..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={onSearch}
          autoCapitalize="none"
        />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (
          <>
            {chosenElsewhere && (
              <>
                <Text style={styles.groupLabel}>🎯 Chosen opponent</Text>
                {renderUser(opponent)}
              </>
            )}
            <Text style={styles.groupLabel}>👥 Friends</Text>
            {friends.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptySubtext}>No friends yet. Search any username above to challenge someone, or add friends so they show up here.</Text>
                <TouchableOpacity style={styles.findBtn} onPress={() => navigation.navigate('Friends', { tab: 'friends' })}>
                  <Text style={styles.findBtnText}>+ Find Friends</Text>
                </TouchableOpacity>
              </View>
            ) : shown.length === 0 ? (
              <Text style={styles.noMatch}>No friend matches "{search.trim()}"</Text>
            ) : (
              shown.map(renderUser)
            )}

            {query.length >= 2 && (
              <>
                <Text style={styles.groupLabel}>🌍 Other players</Text>
                {otherPlayers.length === 0
                  ? <Text style={styles.noMatch}>No other players match "{search.trim()}"</Text>
                  : otherPlayers.map(renderUser)}
              </>
            )}
          </>
        )}

        {opponent && (
          <TouchableOpacity style={styles.sendBtn} onPress={sendChallenge} disabled={sending}>
            {sending
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.sendBtnText}>⚔️ Send Challenge to @{opponent.username}</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontWeight: 'bold', fontSize: 17 },
  step: { color: colors.textSecondary, fontSize: 13 },
  scroll: { paddingHorizontal: 20 },
  summaryCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { color: colors.primary, fontWeight: 'bold', fontSize: 14, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: colors.textSecondary, fontSize: 13 },
  summaryValue: { color: colors.white, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  sectionLabel: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 10 },
  searchInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, color: colors.white, borderWidth: 1, borderColor: colors.border, fontSize: 14, marginBottom: 12 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 12 },
  userCardActive: { borderColor: colors.primary },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userUsername: { color: colors.white, fontWeight: 'bold', fontSize: 14 },
  userFullName: { color: colors.textSecondary, fontSize: 12 },
  checkmark: { color: colors.accent, fontWeight: 'bold', fontSize: 18, marginLeft: 'auto' },
  groupLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  noMatch: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  findBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 },
  findBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  sendBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
});
