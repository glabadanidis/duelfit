import { View, Text, StyleSheet } from 'react-native';
import colors from '../../constants/colors';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Notifications</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
});
