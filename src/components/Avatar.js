import { View, Text, Image, StyleSheet } from 'react-native';
import colors from '../constants/colors';

// The player's photo if they set one on Profile, otherwise the first letter of
// their username on a coloured circle.
export default function Avatar({ username, url, size = 40, bg = colors.primary }) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatar, circle, { backgroundColor: bg }]}>
      {url
        ? <Image source={{ uri: url }} style={circle} />
        : <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{username?.[0]?.toUpperCase() || '?'}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: colors.white, fontWeight: 'bold' },
});
