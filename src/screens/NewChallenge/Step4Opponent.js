import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../constants/supabase';
import { useChallenge } from '../../constants/challengeContext';
import { notifyChallengeSent } from '../../constants/notifications';
import colors from '../../constants/colors';

export default function Step4Opponent({ navigation }) {
  const { challenge, updateChallenge, resetChallenge } = useChallenge();
  const { match, pick, forfeit } = challenge;
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [opponent, setOpponent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function searchUsers(text) {
    setSearch(text);
    if (text.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .ilike('username', `%${text}%`)
      .limit(10);
    const { data: { user } } = await supabase.auth.getUser();
    setResults((data || []).filter(u => u.id !== user.id));
  }

  async function sendChallenge() {
    if (!opponent) return Alert.alert('Error', 'Please select an opponent.');
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('challenges').insert({
      challenger_id: user.id,
      opponent_id: opponent.id,
      match_id: match.idEvent,
      match_home_team: match.strHomeTeam,
      match_away_team: match.strAwayTeam,
      match_date: match.dateEvent,
      match_league: match.strLeague,
      challenger_pick: pick,
      forfeit,
      status: 'pending',
    });
    setSending(false);
    if (error) return Alert.alert('Error', error.message);

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', currentUser.id).single();
    notifyChallengeSent(opponent.id, profile?.username || 'Someone', `${match.strHomeTeam} vs ${match.strAwayTeam}`);

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
            <Text style={styles.summaryValue}>{match?.strHomeTeam} vs {match?.strAwayTeam}</Text>
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

        {/* Search */}
        <Text style={styles.sectionLabel}>Search by username:</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="e.g. john_doe"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={searchUsers}
          autoCapitalize="none"
        />

        {results.map(u => (
          <TouchableOpacity
            key={u.id}
            style={[styles.userCard, opponent?.id === u.id && styles.userCardActive]}
            onPress={() => setOpponent(u)}
          >
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{u.username[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.userUsername}>@{u.username}</Text>
              <Text style={styles.userFullName}>{u.full_name}</Text>
            </View>
            {opponent?.id === u.id && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}

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
  userUsername: { color: colors.white, fontWeight: 'bold', fontSize: 14 },
  userFullName: { color: colors.textSecondary, fontSize: 12 },
  checkmark: { color: colors.accent, fontWeight: 'bold', fontSize: 18, marginLeft: 'auto' },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  sendBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
});
