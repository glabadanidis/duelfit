import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../constants/supabase';
import colors from '../../constants/colors';

function Avatar({ username, size = 40, bg = colors.primary }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{username?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

export default function FriendsScreen({ navigation }) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'search'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());

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

  async function searchUsers(text) {
    setSearchText(text);
    if (text.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .ilike('username', `%${text}%`)
      .neq('id', userId)
      .limit(10);
    setSearchResults(data || []);
  }

  async function sendRequest(addresseeId) {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: addresseeId });
    if (error) return Alert.alert('Error', error.message);
    setPendingIds(prev => new Set([...prev, addresseeId]));
  }

  async function acceptRequest(friendshipId) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    loadAll();
  }

  async function declineRequest(friendshipId) {
    await supabase.from('friendships').delete().eq('id', friendshipId);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👥 Friends</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'friends', label: `Friends${friends.length ? ` (${friends.length})` : ''}` },
          { key: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}` },
          { key: 'search', label: 'Find' },
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
            <FlatList
              data={friends}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>👥</Text>
                  <Text style={styles.emptyText}>No friends yet</Text>
                  <Text style={styles.emptySubtext}>Use "Find" tab to add friends</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Avatar username={item.profile?.username} />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{item.profile?.full_name || item.profile?.username}</Text>
                    <Text style={styles.rowSub}>@{item.profile?.username}</Text>
                  </View>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeFriend(item.id)}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
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

          {/* SEARCH TAB */}
          {tab === 'search' && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor={colors.textSecondary}
                value={searchText}
                onChangeText={searchUsers}
                autoCapitalize="none"
                autoFocus
              />
              <FlatList
                data={searchResults}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  searchText.length >= 2 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No users found</Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  const isFriend = friendIds.has(item.id);
                  const isPending = pendingIds.has(item.id);
                  return (
                    <View style={styles.row}>
                      <Avatar username={item.username} />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName}>{item.full_name || item.username}</Text>
                        <Text style={styles.rowSub}>@{item.username}</Text>
                      </View>
                      {isFriend ? (
                        <View style={styles.friendBadge}>
                          <Text style={styles.friendBadgeText}>Friends</Text>
                        </View>
                      ) : isPending ? (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>Sent</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.addBtn} onPress={() => sendRequest(item.id)}>
                          <Text style={styles.addBtnText}>+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            </View>
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

  addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  friendBadge: { backgroundColor: '#10B98122', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#10B981' },
  friendBadgeText: { color: '#10B981', fontWeight: '700', fontSize: 12 },
  pendingBadge: { backgroundColor: '#F59E0B22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#F59E0B' },
  pendingBadgeText: { color: '#F59E0B', fontWeight: '700', fontSize: 12 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  removeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 6 },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
