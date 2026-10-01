import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert, Image, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../constants/supabase';
import { getTeamFlag, lookupEvent } from '../../constants/api';
import { daysAfter, proofDeadline, MAX_REJECTIONS, REJECT_GRACE_DAYS } from '../../constants/reliability';
import ReliabilityBadge from '../../components/ReliabilityBadge';
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
  const { challenge: initialChallenge, currentUserId, challengeId } = route.params;
  const [challenge, setChallenge] = useState(initialChallenge || null);
  const [score, setScore] = useState(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [loadingChallenge, setLoadingChallenge] = useState(true);
  const [ogImage, setOgImage] = useState(null);


  const [resolvedUserId, setResolvedUserId] = useState(currentUserId || null);

  useEffect(() => {
    const id = challengeId || initialChallenge?.id;
    if (!id) { setLoadingChallenge(false); return; }
    loadChallenge(id);
  }, []);

  async function loadChallenge(id) {
    setLoadingChallenge(true);
    const [{ data }, { data: { user } }] = await Promise.all([
      supabase.from('challenges')
        .select(`*, challenger:profiles!challenges_challenger_id_fkey(username, forfeits_done, forfeits_ducked), opponent:profiles!challenges_opponent_id_fkey(username, forfeits_done, forfeits_ducked)`)
        .eq('id', id)
        .single(),
      supabase.auth.getUser(),
    ]);
    if (data) {
      setChallenge(data);
      if (data.proof_url && !data.proof_url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)$/i)) {
        fetchOgImage(data.proof_url);
      }
    }

    if (user) setResolvedUserId(user.id);
    setLoadingChallenge(false);
  }

  async function fetchOgImage(url) {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      const match = json.contents?.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                 || json.contents?.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (match?.[1]) setOgImage(match[1]);
    } catch {}
  }

  useEffect(() => {
    if (!challenge) return;
    if (challenge.match_id && challenge.status === 'completed') {
      setScoreLoading(true);
      lookupEvent(challenge.match_id)
        .then(data => {
          const e = data?.events?.[0];
          if (e && e.intHomeScore !== null && e.intHomeScore !== '') {
            setScore({ home: e.intHomeScore, away: e.intAwayScore });
          }
        })
        .catch(() => {})
        .finally(() => setScoreLoading(false));
    }
  }, [challenge?.id]);

  if (loadingChallenge || !challenge) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const isChallenger = challenge.challenger_id === resolvedUserId;
  const myPick    = isChallenger ? challenge.challenger_pick : challenge.opponent_pick;
  const theirPick = isChallenger ? challenge.opponent_pick  : challenge.challenger_pick;
  const theirUsername = isChallenger
    ? challenge.opponent?.username
    : challenge.challenger?.username;
  const myUsername = isChallenger
    ? challenge.challenger?.username
    : challenge.opponent?.username;
  const theirProfile = isChallenger ? challenge.opponent : challenge.challenger;

  async function pickAndUploadProof(useCamera) {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to continue.');
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });

    if (result.canceled) return;

    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop();
    const fileName = `${challenge.id}_photo_${Date.now()}.${ext}`;
    const contentType = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';

    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(fileName, byteArray, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(fileName);

      const { error: saveError } = await supabase.from('challenges').update({ proof_photo_url: publicUrl }).eq('id', challenge.id);
      if (saveError) throw saveError;
      setChallenge(prev => ({ ...prev, proof_photo_url: publicUrl }));
      Alert.alert('Photo submitted!', 'Your opponent can now see your proof.');
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  async function submitLink() {
    const url = linkInput.trim();
    if (!url.startsWith('http')) {
      Alert.alert('Invalid link', 'Please paste a valid URL.');
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase.from('challenges').update({ proof_url: url }).eq('id', challenge.id);
      if (error) throw error;
      setChallenge(prev => ({ ...prev, proof_url: url, _removingLink: false }));
      setLinkInput('');
      fetchOgImage(url);
      Alert.alert('Activity submitted!', 'Your opponent can now see your Strava activity.');
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  async function approveProof() {
    if (challenge.winner_id !== resolvedUserId) {
      Alert.alert('Error', 'Only the winner can approve proof.');
      return;
    }
    const { error } = await supabase.from('challenges').update({ proof_approved: true }).eq('id', challenge.id).eq('winner_id', resolvedUserId);
    if (error) { Alert.alert('Error', error.message); return; }
    setChallenge(prev => ({ ...prev, proof_approved: true }));
    Alert.alert('Proof approved! ✅', `The forfeit has been confirmed and counts towards @${theirUsername}'s reliability.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  function rejectProof() {
    const left = MAX_REJECTIONS - (challenge.proof_rejections || 0) - 1;
    Alert.alert(
      'Reject proof?',
      `The proof is removed and @${theirUsername} gets at least ${REJECT_GRACE_DAYS} more days to send new proof. `
        + 'If nothing arrives, it counts as a missed forfeit.'
        + (left === 0 ? '\n\nThis is your last rejection. After it you can only approve.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: async () => {
          const { data, error } = await supabase.from('challenges')
            .update({ proof_url: null, proof_photo_url: null })
            .eq('id', challenge.id).eq('winner_id', resolvedUserId)
            .select('proof_rejected_at, proof_rejections')
            .single();
          if (error) { Alert.alert('Error', error.message); return; }
          setOgImage(null);
          setChallenge(prev => ({ ...prev, ...data, proof_url: null, proof_photo_url: null, proof_submitted_at: null }));
        } },
      ],
    );
  }

  const status = statusInfo(challenge.status);
  const isWinner   = challenge.winner_id === resolvedUserId;
  const isLoser    = challenge.status === 'completed' && challenge.winner_id && !isWinner;
  const isDraw     = challenge.status === 'completed' && !challenge.winner_id;
  const ducked     = !!challenge.forfeit_ducked;
  // Proof can be sent or replaced until the deadline, which a rejection can push
  // back. The database enforces the same rule, this only hides controls that
  // would fail.
  const shortDate = d => d?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) || null;
  const deadline = proofDeadline(challenge);
  const hasProof = !!(challenge.proof_url || challenge.proof_photo_url);
  const wasRejected = !!challenge.proof_rejected_at && !hasProof && !challenge.proof_approved;
  const canReject = isWinner && hasProof && !challenge.proof_approved && (challenge.proof_rejections || 0) < MAX_REJECTIONS;
  const deadlineText = shortDate(deadline);
  const reviewDeadlineText = shortDate(daysAfter(challenge.proof_submitted_at));
  const canSubmitProof = isLoser && !challenge.proof_approved && !ducked && (!deadline || deadline > new Date());

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            <Text style={styles.resultEmoji}>{isDraw ? '🤝' : isWinner ? '🏆' : '👎'}</Text>
            <Text style={[styles.resultText, { color: isDraw ? '#F59E0B' : isWinner ? '#10B981' : '#EF4444' }]}>
              {isDraw ? "It's a draw!" : isWinner ? 'You won!' : 'You lost'}
            </Text>
            {isWinner && (
              <Text style={styles.resultSub}>
                {challenge.proof_approved
                  ? 'Forfeit delivered ✅'
                  : ducked ? 'Forfeit missed' : `Waiting for @${theirUsername} to do the forfeit`}
              </Text>
            )}
            {isLoser && <Text style={styles.resultSub}>Forfeit: {challenge.forfeit}</Text>}
            {isLoser && !challenge.proof_approved && !ducked && (
              <Text style={styles.resultSub}>
                {deadlineText ? `Send your proof by ${deadlineText}` : 'Send your proof to the winner'}
              </Text>
            )}
          </View>
        )}

        {/* Forfeit — shown right after result so winner/loser context is clear */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏃 Forfeit</Text>
          <Text style={styles.forfeitText}>{challenge.forfeit}</Text>

          {(isLoser || isWinner) && ducked && (
            <View style={styles.proofSection}>
              <Text style={styles.duckedText}>
                {isLoser
                  ? `⛔ ${challenge.proof_rejected_at ? 'Your proof was rejected and no new proof came in time' : 'No proof within 7 days'}. This counts as a missed forfeit.`
                  : `⛔ ${challenge.proof_rejected_at ? 'No new proof after your rejection' : 'No proof within 7 days'}. It counts against @${theirUsername}'s reliability.`}
              </Text>
            </View>
          )}

          {(isLoser || isWinner) && !ducked && (
            <View style={styles.proofSection}>
              <Text style={styles.proofTitle}>
                {isLoser ? 'Prove you did it' : "Opponent's proof"}
              </Text>

              {wasRejected && (
                <Text style={styles.rejectedText}>
                  {isLoser
                    ? `❌ @${theirUsername} rejected your proof. Send new proof by ${deadlineText}.`
                    : `❌ You rejected the proof. @${theirUsername} has until ${deadlineText} to send new proof.`}
                </Text>
              )}

              {/* Strava activity link */}
              <View style={styles.proofBlock}>
                <Text style={styles.proofBlockLabel}>🟠 Strava Activity</Text>
                {challenge.proof_url && !challenge._removingLink ? (
                  <>
                    <TouchableOpacity
                      style={styles.proofLinkBtn}
                      onPress={() => Linking.openURL(challenge.proof_url.trim())}
                      activeOpacity={0.85}
                    >
                      {ogImage ? (
                        <Image source={{ uri: ogImage }} style={styles.proofOgImage} resizeMode="cover" />
                      ) : null}
                      <View style={styles.proofLinkFooter}>
                        <Text style={styles.proofLinkText}>🔗 View on Strava</Text>
                        <Text style={styles.proofLinkUrl} numberOfLines={1}>{challenge.proof_url.trim()}</Text>
                      </View>
                    </TouchableOpacity>
                    {canSubmitProof && (
                      <TouchableOpacity
                        style={styles.removeLinkBtn}
                        onPress={() => setChallenge(prev => ({ ...prev, _removingLink: true }))}
                      >
                        <Text style={styles.removeLinkText}>✕ Remove & replace link</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : isWinner ? (
                  <Text style={styles.proofPending}>⏳ No activity linked yet</Text>
                ) : null}
                {canSubmitProof && (!challenge.proof_url || challenge._removingLink) && (
                  <>
                    <TouchableOpacity style={[styles.proofBtn, styles.proofBtnStrava]} onPress={() => Linking.openURL('strava://athlete/activities').catch(() => Linking.openURL('https://www.strava.com/athlete/activities'))}>
                      <Text style={styles.proofBtnText}>🟠 Open Strava to copy link</Text>
                    </TouchableOpacity>
                    <View style={styles.linkRow}>
                      <TextInput
                        style={styles.linkInput}
                        placeholder="https://strava.com/activities/..."
                        placeholderTextColor={colors.textSecondary}
                        value={linkInput}
                        onChangeText={setLinkInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity style={styles.linkSubmitBtn} onPress={submitLink} disabled={uploading || !linkInput.trim()}>
                        <Text style={styles.linkSubmitText}>✓</Text>
                      </TouchableOpacity>
                    </View>
                    {challenge._removingLink && (
                      <TouchableOpacity onPress={() => setChallenge(prev => ({ ...prev, _removingLink: false }))}>
                        <Text style={[styles.removeLinkText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>

              {/* Photo / video proof */}
              <View style={styles.proofBlock}>
                <Text style={styles.proofBlockLabel}>📸 Photo / Video</Text>
                {challenge.proof_photo_url ? (
                  challenge.proof_photo_url.match(/\.(mp4|mov|avi)$/i) ? (
                    <Text style={styles.proofVideoText}>🎥 Video submitted</Text>
                  ) : (
                    <Image
                      source={{ uri: challenge.proof_photo_url.trim(), cache: 'reload' }}
                      style={styles.proofImage}
                      resizeMode="cover"
                    />
                  )
                ) : isWinner ? (
                  <Text style={styles.proofPending}>⏳ No photo submitted yet</Text>
                ) : null}
                {canSubmitProof && (
                  <View style={styles.photoRow}>
                    <TouchableOpacity style={[styles.proofBtnSmall, { flex: 1 }]} onPress={() => pickAndUploadProof(false)} disabled={uploading}>
                      {uploading ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.proofBtnText}>{challenge.proof_photo_url ? '🔄 Replace' : '🖼️ Upload'}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.proofBtnSmall, styles.proofBtnCamera, { flex: 1 }]} onPress={() => pickAndUploadProof(true)} disabled={uploading}>
                      <Text style={styles.proofBtnText}>📸 Camera</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Approve / submitted status */}
              {(challenge.proof_url || challenge.proof_photo_url) && (
                <>
                  {isLoser && (
                    <Text style={styles.proofSubmittedLabel}>
                      {challenge.proof_approved ? '✅ Proof approved' : '✅ Proof submitted, waiting for approval'}
                    </Text>
                  )}
                  {isWinner && !challenge.proof_approved && (
                    <TouchableOpacity style={styles.approveBtn} onPress={approveProof}>
                      <Text style={styles.approveBtnText}>✅ Approve Proof</Text>
                    </TouchableOpacity>
                  )}
                  {canReject && (
                    <TouchableOpacity style={styles.rejectBtn} onPress={rejectProof}>
                      <Text style={styles.rejectBtnText}>❌ Reject Proof</Text>
                    </TouchableOpacity>
                  )}
                  {isWinner && challenge.proof_approved && (
                    <Text style={styles.proofSubmittedLabel}>✅ Proof approved</Text>
                  )}
                </>
              )}
              {isWinner && !hasProof && !wasRejected && (
                <Text style={styles.proofPending}>
                  ⏳ Waiting for opponent's proof{deadlineText ? ` until ${deadlineText}` : '...'}
                </Text>
              )}
              {isWinner && !challenge.proof_approved && (challenge.proof_url || challenge.proof_photo_url) && reviewDeadlineText && (
                <Text style={styles.proofPending}>Approved automatically on {reviewDeadlineText} if you do not review it</Text>
              )}
            </View>
          )}
        </View>

        {/* Match Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚽ Match</Text>
          <Text style={styles.league}>{challenge.match_league}</Text>
          <View style={styles.matchRow}>
            <View style={styles.matchTeamBlock}>
              {getTeamFlag(challenge.match_home_team)
                ? <Text style={styles.matchTeamFlag}>{getTeamFlag(challenge.match_home_team)}</Text>
                : null}
              <Text style={styles.teamName} numberOfLines={2}>{challenge.match_home_team}</Text>
            </View>
            {scoreLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginHorizontal: 10 }} />
            ) : score ? (
              <View style={styles.scoreBox}>
                <Text style={styles.scoreText}>{score.home} – {score.away}</Text>
                <Text style={styles.scoreFinal}>FT</Text>
              </View>
            ) : (
              <Text style={styles.vs}>VS</Text>
            )}
            <View style={styles.matchTeamBlock}>
              {getTeamFlag(challenge.match_away_team)
                ? <Text style={styles.matchTeamFlag}>{getTeamFlag(challenge.match_away_team)}</Text>
                : null}
              <Text style={styles.teamName} numberOfLines={2}>{challenge.match_away_team}</Text>
            </View>
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
              {theirProfile && (
                <View style={styles.playerBadge}>
                  <ReliabilityBadge
                    done={theirProfile.forfeits_done}
                    ducked={theirProfile.forfeits_ducked}
                    username={theirUsername}
                  />
                </View>
              )}
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

        {/* Nobody marks the result. settle-challenges reads it from the match feed,
            and the database rejects a player trying to set it. */}
        {challenge.status === 'accepted' && (
          <View style={styles.autoResultNote}>
            <Text style={styles.autoResultText}>⏱ The result is settled automatically from the official score after the match.</Text>
          </View>
        )}

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 32, lineHeight: 36 },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: 'bold' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 8, marginBottom: 8, borderWidth: 1, gap: 6 },
  statusEmoji: { fontSize: 16 },
  statusLabel: { fontWeight: '700', fontSize: 14 },

  resultBanner: { borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, alignItems: 'center' },
  resultEmoji: { fontSize: 26, marginBottom: 4 },
  resultText: { fontWeight: '800', fontSize: 18, marginBottom: 2 },
  resultSub: { color: colors.textSecondary, fontSize: 12 },

  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

  league: { color: colors.primary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  matchTeamBlock: { flex: 1, alignItems: 'center', gap: 3 },
  matchTeamFlag: { fontSize: 28 },
  teamName: { flex: 1, color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  vs: { color: colors.primary, fontWeight: 'bold', fontSize: 12, marginHorizontal: 8 },
  scoreBox: { alignItems: 'center', marginHorizontal: 8 },
  scoreText: { color: colors.white, fontWeight: 'bold', fontSize: 20 },
  scoreFinal: { color: colors.textSecondary, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  matchDate: { color: colors.textSecondary, fontSize: 11, textAlign: 'center' },

  playersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerSide: { flex: 1, alignItems: 'center' },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  playerAvatarText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  playerName: { color: colors.white, fontWeight: '600', fontSize: 12, marginBottom: 2 },
  playerRole: { color: colors.textSecondary, fontSize: 10 },
  playerVs: { fontSize: 20, marginHorizontal: 8 },
  playerBadge: { marginTop: 6 },

  picksRow: { flexDirection: 'row', alignItems: 'center' },
  pickSide: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  pickLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 4 },
  pickValue: { color: colors.white, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  pickDivider: { width: 1, height: 36, backgroundColor: colors.border },

  forfeitText: { color: colors.white, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  forfeitSub: { color: colors.textSecondary, fontSize: 11 },
  proofSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  proofTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  proofBlock: { marginBottom: 14 },
  proofBlockLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  photoRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  proofBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  proofBtnSmall: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  proofBtnCamera: { backgroundColor: '#6366F1' },
  proofBtnStrava: { backgroundColor: '#FC4C02' },
  proofBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  proofPreview: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  proofImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 8 },
  proofVideoText: { color: colors.white, fontSize: 14, padding: 12, backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8 },
  proofSubmittedLabel: { color: '#10B981', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  approveBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  approveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  rejectBtn: { borderWidth: 1, borderColor: colors.unreliable, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  rejectBtnText: { color: colors.unreliable, fontWeight: '700', fontSize: 15 },
  rejectedText: { color: colors.unreliable, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  duckedText: { color: colors.unreliable, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  proofPending: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  proofLinkBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, overflow: 'hidden', marginBottom: 6 },
  removeLinkBtn: { alignItems: 'center', marginBottom: 8 },
  removeLinkText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  proofOgImage: { width: '100%', height: 200 },
  proofLinkFooter: { padding: 12 },
  proofLinkText: { color: colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  proofLinkUrl: { color: colors.textSecondary, fontSize: 11 },
  proofOrLabel: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginVertical: 10 },
  linkRow: { flexDirection: 'row', gap: 8 },
  linkInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.white, fontSize: 13 },
  linkSubmitBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  linkSubmitText: { color: colors.white, fontWeight: '700', fontSize: 18 },

  autoResultNote: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  autoResultText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  timelineLabel: { color: colors.textSecondary, fontSize: 13 },
  timelineValue: { color: colors.white, fontSize: 13, fontWeight: '500' },
});
