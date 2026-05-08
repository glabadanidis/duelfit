import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, useWindowDimensions, Animated,
} from 'react-native';
import colors from '../../constants/colors';

const slides = [
  {
    id: '1',
    emoji: '⚽',
    title: 'Challenge your friends\non any sport',
    subtitle: 'Pick a match, choose your side, and dare your friends to disagree.',
  },
  {
    id: '2',
    emoji: '💪',
    title: 'Loser pays the price.\nWinner earns the glory.',
    subtitle: 'No money. Just real physical forfeits — run 5km, do 50 push-ups, or worse.',
  },
  {
    id: '3',
    emoji: '🏆',
    title: 'Connect.\nCompete.\nForfeit.',
    subtitle: 'Track your wins, climb the leaderboard, and never let your friends forget.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  function goNext() {
    if (currentIndex < slides.length - 1) {
      flatListRef.current.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.replace('Register');
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={() => navigation.replace('Login')}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onMomentumScrollEnd={e => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={goNext}>
        <Text style={styles.buttonText}>
          {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.loginButton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.loginText}>
          Already have an account? <Text style={styles.loginBold}>Log in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  skip: { alignSelf: 'flex-end', padding: 20, marginTop: 20 },
  skipText: { color: colors.textSecondary, fontSize: 14 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 80, marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.white, textAlign: 'center', lineHeight: 36, marginBottom: 16 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginHorizontal: 4 },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  button: { width: '85%', backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  loginButton: { marginBottom: 40 },
  loginText: { color: colors.textSecondary, fontSize: 14 },
  loginBold: { color: colors.primary, fontWeight: 'bold' },
});
