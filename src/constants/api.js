import axios from 'axios';

const SPORTS_DB = 'https://www.thesportsdb.com/api/v1/json/3';

export async function getUpcomingMatches(leagueId = 4328) {
  const res = await axios.get(`${SPORTS_DB}/eventsnextleague.php?id=${leagueId}`);
  return res.data.events || [];
}

export const LEAGUES = [
  { id: 4328, name: 'Premier League', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 4332, name: 'La Liga',        emoji: '🇪🇸' },
  { id: 4331, name: 'Serie A',        emoji: '🇮🇹' },
  { id: 4335, name: 'Ligue 1',        emoji: '🇫🇷' },
  { id: 4337, name: 'Bundesliga',     emoji: '🇩🇪' },
  { id: 4346, name: 'NBA',            emoji: '🏀' },
];
