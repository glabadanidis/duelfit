import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

// Every label is an instruction to the loser, verb first, so it reads the same
// on a card as "Forfeit: Do 30 push-ups". Only the label is stored, in
// challenges.forfeit; nothing matches on it, so renaming one is safe.
const CATEGORIES = [
  {
    key: 'popular', emoji: '🔥', name: 'Most Popular',
    forfeits: [
      { emoji: '💪', label: 'Do 10 pull-ups' },
      { emoji: '🏃', label: 'Run 5 km' },
      { emoji: '💪', label: 'Do 25 burpees' },
      { emoji: '💪', label: 'Do 30 push-ups' },
      { emoji: '🍦', label: 'Buy the winner an ice cream' },
      { emoji: '☕', label: 'Buy the winner a coffee' },
    ],
  },
  {
    key: 'bodyweight', emoji: '🤸', name: 'Bodyweight',
    forfeits: [
      { emoji: '🐒', label: 'Do 3 muscle-ups' },
      { emoji: '💪', label: 'Do 10 pull-ups' },
      { emoji: '🦾', label: 'Do 20 dips' },
      { emoji: '💪', label: 'Do 30 push-ups' },
      { emoji: '🦵', label: 'Do 50 squats' },
      { emoji: '🧘‍♂️', label: 'Do 50 sit-ups' },
    ],
  },
  {
    key: 'cardio', emoji: '🏃', name: 'Cardio',
    forfeits: [
      { emoji: '🏃', label: 'Run 5 km' },
      { emoji: '🏊', label: 'Swim 500 m' },
      { emoji: '🚴', label: 'Cycle 10 km' },
      { emoji: '💪', label: 'Do 25 burpees' },
      { emoji: '👟', label: 'Jump rope 100 times' },
      { emoji: '🧘‍♂️', label: 'Hold a 2-minute plank' },
    ],
  },
  {
    key: 'gym', emoji: '🏋️', name: 'Gym',
    forfeits: [
      { emoji: '🏋️', label: 'Bench press your bodyweight for 1 rep' },
      { emoji: '🦵', label: 'Squat your bodyweight for 1 rep' },
      { emoji: '🚣', label: 'Row 1 km' },
      { emoji: '🏋️', label: 'Do 10 thrusters at 40 kg' },
      { emoji: '🏋️', label: 'Snatch 40 kg' },
      { emoji: '🏋️', label: 'Clean and jerk 60 kg' },
    ],
  },
  {
    key: 'social', emoji: '🤝', name: 'Social',
    forfeits: [
      { emoji: '☕', label: 'Buy the winner a coffee' },
      { emoji: '🍦', label: 'Buy the winner an ice cream' },
      { emoji: '🍽️', label: 'Treat the winner to breakfast, lunch or dinner' },
      { emoji: '🍎', label: 'Treat the winner to a healthy snack' },
      { emoji: '🎧', label: 'Let the winner pick your music at work tomorrow' },
      { emoji: '📋', label: 'Let the winner choose your next workout' },
    ],
  },
  {
    key: 'skills', emoji: '⚽', name: 'Sport Skills',
    forfeits: [
      { emoji: '⚽', label: 'Do 20 football keepy-ups' },
      { emoji: '🥅', label: 'Hit the crossbar 3 times from the penalty spot' },
      { emoji: '🏀', label: 'Score 10 basketball free throws' },
      { emoji: '🎯', label: 'Score 3 three-pointers' },
      { emoji: '🎾', label: 'Hit 30 tennis or padel shots against a wall' },
      { emoji: '🏐', label: 'Do 30 volleyball passes against a wall' },
    ],
  },
];

// Categories first, then the forfeits of the one tapped, on the same screen.
// Back and the header arrow return to the categories before leaving the step.
export default function Step3Forfeit({ navigation }) {
  const { updateChallenge } = useChallenge();
  const [openKey, setOpenKey] = useState(null);
  const [selected, setSelected] = useState(null); // { categoryKey, label }
  const [custom, setCustom] = useState('');

  const openCategory = CATEGORIES.find(c => c.key === openKey);
  const forfeit = custom.trim() || selected?.label;

  function proceed() {
    if (!forfeit) return;
    updateChallenge({ forfeit });
    navigation.navigate('Step4Opponent');
  }

  function goBack() {
    if (openCategory) setOpenKey(null);
    else navigation.goBack();
  }

  // Android's hardware back does the same as the header arrow.
  useEffect(() => {
    if (!openKey) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenKey(null); return true; });
    return () => sub.remove();
  }, [openKey]);

  function pick(label) {
    setSelected({ categoryKey: openKey, label });
    setCustom('');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Text style={styles.back}>{openCategory ? '← Categories' : '← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Define Forfeit</Text>
        <Text style={styles.step}>3 of 4</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {openCategory ? (
          <>
            <Text style={styles.sectionLabel}>{openCategory.emoji} {openCategory.name}</Text>
            <View style={styles.grid}>
              {openCategory.forfeits.map(f => {
                const active = selected?.label === f.label && selected?.categoryKey === openCategory.key;
                return (
                  <TouchableOpacity
                    key={f.label}
                    style={[styles.presetCard, active && styles.presetCardActive]}
                    onPress={() => pick(f.label)}
                  >
                    <Text style={styles.presetEmoji}>{f.emoji}</Text>
                    <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Choose a forfeit for the loser:</Text>

            <View style={styles.grid}>
              {CATEGORIES.map(c => {
                const active = selected?.categoryKey === c.key && !custom.trim();
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.presetCard, active && styles.presetCardActive]}
                    onPress={() => setOpenKey(c.key)}
                  >
                    <Text style={styles.presetEmoji}>{c.emoji}</Text>
                    <Text style={[styles.categoryName, active && styles.presetLabelActive]}>{c.name}</Text>
                    <Text style={styles.categoryHint} numberOfLines={2}>
                      {active ? selected.label : `${c.forfeits.length} forfeits`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.orText}>— or create your own —</Text>

            <TextInput
              style={styles.customInput}
              placeholder="Type a custom forfeit..."
              placeholderTextColor={colors.textSecondary}
              value={custom}
              onChangeText={setCustom}
              maxLength={100}
            />
            <View style={styles.customFooter}>
              <Text style={styles.safetyNote}>*Keep it safe, legal and agreed by both players.</Text>
              <Text style={styles.charCount}>{custom.length}/100</Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.nextBtn, !forfeit && styles.nextBtnDisabled]}
          onPress={proceed}
          disabled={!forfeit}
        >
          <Text style={styles.nextBtnText}>Next →</Text>
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
  step: { color: colors.textSecondary, fontSize: 13 },
  scroll: { paddingHorizontal: 20 },
  sectionLabel: { color: colors.white, fontWeight: '600', fontSize: 15, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  presetCard: { width: '47%', backgroundColor: colors.surface, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  presetCardActive: { borderColor: colors.primary, backgroundColor: colors.navy },
  presetEmoji: { fontSize: 28, marginBottom: 6 },
  presetLabel: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  presetLabelActive: { color: colors.primary, fontWeight: 'bold' },
  categoryName: { color: colors.white, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  categoryHint: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 },
  orText: { color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  customInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, color: colors.white, borderWidth: 1, borderColor: colors.border, fontSize: 14, marginBottom: 6 },
  customFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
  safetyNote: { color: colors.textSecondary, fontSize: 11, fontStyle: 'italic', flex: 1 },
  charCount: { color: colors.textSecondary, fontSize: 11 },
  nextBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 40 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
});
