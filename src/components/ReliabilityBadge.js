import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { getReliability, reliabilityDetail } from '../constants/reliability';

// Coloured pill with the word where there is room, the icon alone in dense lists.
// Tapping shows the count behind it, never a percentage.
export default function ReliabilityBadge({ done = 0, ducked = 0, compact = false, username }) {
  const level = getReliability(done, ducked);
  const detail = reliabilityDetail(done, ducked);

  function explain() {
    Alert.alert(
      `${level.emoji} ${level.label}`,
      `${username ? `@${username}: ` : ''}${detail}.\n\nA forfeit counts as delivered when the winner approves the proof, and as missed when no proof arrives within 7 days, or rejected proof is not replaced in time.`,
    );
  }

  if (compact) {
    return (
      <TouchableOpacity onPress={explain} hitSlop={8}>
        <Text style={styles.icon}>{level.emoji}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={explain}
      style={[styles.pill, { borderColor: level.color, backgroundColor: level.color + '22' }]}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, { color: level.color }]}>{level.emoji} {level.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },
  icon: { fontSize: 12 },
});
