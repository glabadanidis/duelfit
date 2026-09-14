import { View, Text, StyleSheet, Image } from 'react-native';
import { getF1RaceFlag, getTeamFlag } from '../constants/api';
import colors from '../constants/colors';

function formatDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

function TeamSide({ name, badge }) {
  const flag = getTeamFlag(name);
  return (
    <View style={styles.side}>
      {flag
        ? <Text style={styles.flag}>{flag}</Text>
        : badge
          ? <Image source={{ uri: badge }} style={styles.badge} resizeMode="contain" />
          : null}
      <Text style={styles.team} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// Date and kick off time in front, home over away behind it. F1 has no teams, so the race name
// takes the place of the two sides.
export default function MatchRow({ match }) {
  const isF1 = !match.strHomeTeam;
  return (
    <View style={styles.row}>
      <View style={styles.when}>
        <Text style={styles.whenDay}>{formatDay(match.dateEvent)}</Text>
        <Text style={styles.whenTime}>{match.strTime?.slice(0, 5) || 'TBD'}</Text>
      </View>
      {isF1 ? (
        <Text style={styles.raceName} numberOfLines={2}>{getF1RaceFlag(match.strEvent)} {match.strEvent}</Text>
      ) : (
        <View style={styles.sides}>
          <TeamSide name={match.strHomeTeam} badge={match.strHomeTeamBadge} />
          <TeamSide name={match.strAwayTeam} badge={match.strAwayTeamBadge} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  when: { width: 58, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border, paddingRight: 10, marginRight: 12 },
  whenDay: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  whenTime: { color: colors.white, fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  sides: { flex: 1, gap: 6 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 22, height: 22 },
  flag: { fontSize: 18 },
  team: { color: colors.white, fontWeight: 'bold', fontSize: 14, flex: 1 },
  raceName: { color: colors.white, fontWeight: 'bold', fontSize: 15, flex: 1 },
});
