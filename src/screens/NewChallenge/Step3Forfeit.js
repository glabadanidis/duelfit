import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChallenge } from '../../constants/challengeContext';
import colors from '../../constants/colors';

const PRESETS = [
  { emoji: '🏃', label: 'Run 5km' },
  { emoji: '🏃', label: 'Run 10km' },
  { emoji: '💪', label: '50 Push-ups' },
  { emoji: '💪', label: '100 Push-ups' },
  { emoji: '🦵', label: '100 Squats' },
  { emoji: '🧊', label: 'Cold shower' },
  { emoji: '📸', label: 'Post embarrassing photo' },
  { emoji: '🍦', label: 'Buy ice cream' },
  { emoji: '🎤', label: 'Sing a song in public' },
  { emoji: '🏋️', label: '50 Burpees' },
];

export default function Step3Forfeit({ navigation }) {
  const { updateChallenge } = useChallenge();
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');

  function proceed() {
    const forfeit = custom.trim() || selected;
    if (!forfeit) return;
    updateChallenge({ forfeit });
    navigation.navigate('Step4Opponent');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Define Forfeit</Text>
        <Text style={styles.step}>3 of 4</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.sectionLabel}>Choose a forfeit for the loser:</Text>

        <View style={styles.grid}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetCard, selected === p.label && styles.presetCardActive]}
              onPress={() => { setSelected(p.label); setCustom(''); }}
            >
              <Text style={styles.presetEmoji}>{p.emoji}</Text>
              <Text style={[styles.presetLabel, selected === p.label && styles.presetLabelActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.orText}>— or create your own —</Text>

        <TextInput
          style={styles.customInput}
          placeholder="Type a custom forfeit..."
          placeholderTextColor={colors.textSecondary}
          value={custom}
          onChangeText={t => { setCustom(t); setSelected(''); }}
          maxLength={100}
        />
        <Text style={styles.charCount}>{custom.length}/100</Text>

        <TouchableOpacity
          style={[styles.nextBtn, !(selected || custom.trim()) && styles.nextBtnDisabled]}
          onPress={proceed}
          disabled={!(selected || custom.trim())}
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
  orText: { color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  customInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, color: colors.white, borderWidth: 1, borderColor: colors.border, fontSize: 14, marginBottom: 6 },
  charCount: { color: colors.textSecondary, fontSize: 11, textAlign: 'right', marginBottom: 24 },
  nextBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 40 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
});
