import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import { notifyFriendRequest, notifyFriendAccepted } from '../../constants/notifications';
import colors from '../../constants/colors';

function Avatar({ username, size = 40, bg = colors.primary }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{username?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

export default function FriendsScreen({ navigation, route }) {
  const [tab, setTab] = useState(route?.params?.tab || 'friends'); // 'friends' | 'requests'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const latestQuery = useRef('');
  const [userId, setUserId] = useState(null);
  const [myUsername, setMyUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  // As a tab the screen stays mounted, so the initial useState above only sees
  // the first tab param. This picks up later ones, like the Home badge opening
  // Requests.
  useEffect(() => {
    if (route?.params?.tab) setTab(route.params.tab);
  }, [route?.params]);
  // The same screen is a bottom tab and a stack screen opened from Step4Opponent.
  // Only the stack version has anywhere to go back to.
  const isTab = route?.name === 'FriendsTab';

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single();
    setMyUsername(me?.username || '');

    const { data: fs } = await supabase
      .from('friendships')
      .select(`
        id, status, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username, full_name),
        addressee:profiles!friendships_addressee_id_fkey(id, username, full_name)
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const accepted = (fs || []).filter(f => f.status === 'accepted').map(f => ({
      id: f.id,
      profile: f.requester_id === user.id ? f.addressee : f.requester,
    }));

    const incoming = (fs || []).filter(
      f => f.status === 'pending' && f.addressee_id === user.id
    ).map(f => ({ id: f.id, profile: f.requester }));

    const sentIds = new Set(
      (fs || []).filter(f => f.status === 'pending' && f.requester_id === user.id)
        .map(f => f.addressee_id)
    );

    setFriends(accepted);
    setRequests(incoming);
    setPendingIds(sentIds);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  // One search box does both jobs: it filters your friends as you type, and from
  // two characters on it also finds other players to add. latestQuery drops a
  // slow response to an earlier keystroke so it cannot overwrite the current one.
  async function searchUsers(text) {
    setSearchText(text);
    const q = text.trim();
    latestQuery.current = q;
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .ilike('username', `%${q}%`)
      .neq('id', userId)
      .limit(10);
    if (latestQuery.current === q) setSearchResults(data || []);
  }

  async function sendRequest(addresseeId) {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: addresseeId, status: 'pending' });
    // 23505 is friendships_pair_key: a row for this pair already exists, most likely
    // because they sent you one at the same moment. Reloading shows it as it is.
    if (error?.code === '23505') return loadAll();
    if (error) return Alert.alert('Error', error.message);
    setPendingIds(prev => new Set([...prev, addresseeId]));
    notifyFriendRequest(addresseeId, myUsername || 'Someone');
  }

  async function acceptRequest(friendshipId) {
    const req = requests.find(r => r.id === friendshipId);
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    if (error) return Alert.alert('Error', error.message);
    if (req?.profile?.id) notifyFriendAccepted(req.profile.id, myUsername || 'Someone');
    loadAll();
  }

  async function declineRequest(friendshipId) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) return Alert.alert('Error', error.message);
    loadAll();
  }

  async function removeFriend(friendshipId) {
    Alert.alert('Remove Friend', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('friendships').delete().eq('id', friendshipId);
          loadAll();
        },
      },
    ]);
  }

  const friendIds = new Set(friends.map(f => f.profile?.id));
  // People who already sent you a request: offer Accept rather than a second
  // request going the other way.
  const incomingByUser = new Map(requests.map(r => [r.profile?.id, r.id]));

  const query = searchText.trim().toLowerCase();
  const shownFriends = query
    ? friends.filter(f =>
        (f.profile?.username || '').toLowerCase().includes(query) ||
        (f.profile?.full_name || '').toLowerCase().includes(query))
    : friends;
  const otherPlayers = query.length >= 2 ? searchResults.filter(u => !friendIds.has(u.id)) : [];

  // Friends and other players share one list, so rows carry a kind and the two
  // groups are separated by label rows.
  const friendsTabRows = [
    ...shownFriends.map(f => ({ kind: 'friend', key: f.id, friendshipId: f.id, profile: f.profile })),
    ...(query.length >= 2
      ? [{ kind: 'label', key: 'others-label', text: '🌍 Other players' },
         ...(otherPlayers.length
           ? otherPlayers.map(u => ({ kind: 'other', key: u.id, profile: u }))
           : [{ kind: 'note', key: 'others-none', text: `No other players match "${searchText.trim()}"` }])]
      : []),
  ];

  function renderFriendsTabRow({ item }) {
    if (item.kind === 'label') return <Text style={styles.groupLabel}>{item.text}</Text>;
    if (item.kind === 'note') return <Text style={styles.noMatch}>{item.text}</Text>;
    const p = item.profile;
    const incomingId = incomingByUser.get(p?.id);
    return (
      <View style={styles.row}>
        <Avatar username={p?.username} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{p?.full_name || p?.username}</Text>
          <Text style={styles.rowSub}>@{p?.username}</Text>
        </View>
        {item.kind === 'friend' ? (
          <TouchableOpacity style={styles.removeBtn} onPress={() => removeFriend(item.friendshipId)}>
            <Text style={styles.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        ) : incomingId ? (
          <TouchableOpacity style={styles.acceptPill} onPress={() => acceptRequest(incomingId)}>
            <Text style={styles.acceptPillText}>✓ Accept</Text>
          </TouchableOpacity>
        ) : pendingIds.has(p.id) ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Sent</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => sendRequest(p.id)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {isTab ? <View style={{ width: 36 }} /> : (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>👥 Friends</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'friends', label: `Friends${friends.length ? ` (${friends.length})` : ''}` },
          { key: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}` },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* FRIENDS TAB */}
          {tab === 'friends' && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search friends or add by username..."
                placeholderTextColor={colors.textSecondary}
                value={searchText}
                onChangeText={searchUsers}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              <FlatList
                data={friendsTabRows}
                keyExtractor={item => item.key}
                renderItem={renderFriendsTabRow}
                contentContainerStyle={styles.listInSearch}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                ListHeaderComponent={
                  friends.length > 0 && query && shownFriends.length === 0
                    ? <Text style={styles.noMatch}>No friend matches "{searchText.trim()}"</Text>
                    : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyEmoji}>👥</Text>
                    <Text style={styles.emptyText}>No friends yet</Text>
                    <Text style={styles.emptySubtext}>Type a username above to find someone and send a request</Text>
                  </View>
                }
              />
            </View>
          )}

          {/* REQUESTS TAB */}
          {tab === 'requests' && (
            <FlatList
              data={requests}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>📭</Text>
                  <Text style={styles.emptyText}>No pending requests</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Avatar username={item.profile?.username} />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{item.profile?.full_name || item.profile?.username}</Text>
                    <Text style={styles.rowSub}>@{item.profile?.username}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(item.id)}>
                      <Text style={styles.declineBtnText}>✕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(item.id)}>
                      <Text style={styles.acceptBtnText}>✓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}

        </>
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

  tabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: colors.white },

  list: { paddingHorizontal: 20, paddingBottom: 20 },
  listInSearch: { paddingBottom: 20 },
  groupLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  noMatch: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  searchContainer: { flex: 1, paddingHorizontal: 20 },
  searchInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, color: colors.white, borderWidth: 1, borderColor: colors.border, fontSize: 14, marginBottom: 12 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: 'bold' },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { color: colors.white, fontWeight: '600', fontSize: 14 },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },

  requestActions: { flexDirection: 'row', gap: 8 },
  declineBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { color: '#EF4444', fontWeight: 'bold' },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: colors.white, fontWeight: 'bold' },

  acceptPill: { backgroundColor: colors.success, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  acceptPillText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  pendingBadge: { backgroundColor: '#F59E0B22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#F59E0B' },
  pendingBadgeText: { color: '#F59E0B', fontWeight: '700', fontSize: 12 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  removeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 6 },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
