import axios from 'axios';

const SPORTS_DB = 'https://www.thesportsdb.com/api/v1/json/3';

const COUNTRY_FLAG = {
  'Algeria':             '🇩🇿',
  'Argentina':           '🇦🇷',
  'Australia':           '🇦🇺',
  'Austria':             '🇦🇹',
  'Belgium':             '🇧🇪',
  'Bosnia-Herzegovina':  '🇧🇦',
  'Brazil':              '🇧🇷',
  'Canada':              '🇨🇦',
  'Cape Verde':          '🇨🇻',
  'Colombia':            '🇨🇴',
  'Croatia':             '🇭🇷',
  'Curaçao':             '🇨🇼',
  'Czech Republic':      '🇨🇿',
  'DR Congo':            '🇨🇩',
  'Ecuador':             '🇪🇨',
  'Egypt':               '🇪🇬',
  'England':             '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'France':              '🇫🇷',
  'Germany':             '🇩🇪',
  'Ghana':               '🇬🇭',
  'Haiti':               '🇭🇹',
  'Iran':                '🇮🇷',
  'Iraq':                '🇮🇶',
  'Ivory Coast':         '🇨🇮',
  'Japan':               '🇯🇵',
  'Jordan':              '🇯🇴',
  'Mexico':              '🇲🇽',
  'Morocco':             '🇲🇦',
  'Netherlands':         '🇳🇱',
  'New Zealand':         '🇳🇿',
  'Norway':              '🇳🇴',
  'Panama':              '🇵🇦',
  'Paraguay':            '🇵🇾',
  'Portugal':            '🇵🇹',
  'Qatar':               '🇶🇦',
  'Saudi Arabia':        '🇸🇦',
  'Scotland':            '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Senegal':             '🇸🇳',
  'South Africa':        '🇿🇦',
  'South Korea':         '🇰🇷',
  'Spain':               '🇪🇸',
  'Sweden':              '🇸🇪',
  'Switzerland':         '🇨🇭',
  'Tunisia':             '🇹🇳',
  'Turkey':              '🇹🇷',
  'USA':                 '🇺🇸',
  'Uruguay':             '🇺🇾',
  'Uzbekistan':          '🇺🇿',
};

export function getTeamFlag(teamName) {
  return COUNTRY_FLAG[teamName] || null;
}

const TEAM_LOGO_RED_BULL    = 'https://r2.thesportsdb.com/images/media/team/badge/nhlev81679826274.png';
const TEAM_LOGO_FERRARI     = 'https://r2.thesportsdb.com/images/media/team/badge/rxwsqv1420417429.png';
const TEAM_LOGO_MCLAREN     = 'https://r2.thesportsdb.com/images/media/team/badge/kzqi7v1743602056.png';
const TEAM_LOGO_MERCEDES    = 'https://r2.thesportsdb.com/images/media/team/badge/6caw0r1744037679.png';
const TEAM_LOGO_ASTON       = 'https://r2.thesportsdb.com/images/media/team/badge/ez5rlk1740774066.png';
const TEAM_LOGO_ALPINE      = 'https://r2.thesportsdb.com/images/media/team/badge/ozhoj31740774899.png';
const TEAM_LOGO_RACING_BULLS= 'https://r2.thesportsdb.com/images/media/team/badge/ot7pjx1740775883.png';
const TEAM_LOGO_HAAS        = 'https://r2.thesportsdb.com/images/media/team/badge/9yp3s51740773680.png';
const TEAM_LOGO_AUDI        = 'https://r2.thesportsdb.com/images/media/team/badge/3uce6h1773158180.png';
const TEAM_LOGO_CADILLAC    = 'https://r2.thesportsdb.com/images/media/team/badge/2wqnjo1769429652.png';

export const F1_TEAM_LOGOS = {
  'Max Verstappen':    TEAM_LOGO_RED_BULL,
  'Isack Hadjar':      TEAM_LOGO_RED_BULL,
  'Charles Leclerc':   TEAM_LOGO_FERRARI,
  'Lewis Hamilton':    TEAM_LOGO_FERRARI,
  'Lando Norris':      TEAM_LOGO_MCLAREN,
  'Oscar Piastri':     TEAM_LOGO_MCLAREN,
  'George Russell':    TEAM_LOGO_MERCEDES,
  'Kimi Antonelli':    TEAM_LOGO_MERCEDES,
  'Fernando Alonso':   TEAM_LOGO_ASTON,
  'Lance Stroll':      TEAM_LOGO_ASTON,
  'Pierre Gasly':      TEAM_LOGO_ALPINE,
  'Franco Colapinto':  TEAM_LOGO_ALPINE,
  'Alexander Albon':   null, // Williams not in TheSportsDB — falls back to emoji
  'Carlos Sainz':      null,
  'Liam Lawson':       TEAM_LOGO_RACING_BULLS,
  'Arvid Lindblad':    TEAM_LOGO_RACING_BULLS,
  'Esteban Ocon':      TEAM_LOGO_HAAS,
  'Oliver Bearman':    TEAM_LOGO_HAAS,
  'Nico Hülkenberg':   TEAM_LOGO_AUDI,
  'Gabriel Bortoleto': TEAM_LOGO_AUDI,
  'Sergio Perez':      TEAM_LOGO_CADILLAC,
  'Valtteri Bottas':   TEAM_LOGO_CADILLAC,
};

export const F1_DRIVERS = [
  'Max Verstappen', 'Isack Hadjar',
  'Charles Leclerc', 'Lewis Hamilton',
  'Lando Norris', 'Oscar Piastri',
  'George Russell', 'Kimi Antonelli',
  'Fernando Alonso', 'Lance Stroll',
  'Pierre Gasly', 'Franco Colapinto',
  'Alexander Albon', 'Carlos Sainz',
  'Liam Lawson', 'Arvid Lindblad',
  'Esteban Ocon', 'Oliver Bearman',
  'Nico Hülkenberg', 'Gabriel Bortoleto',
  'Sergio Perez', 'Valtteri Bottas',
];

const F1_FLAG_MAP = {
  'bahrain':        '🇧🇭',
  'saudi':          '🇸🇦',
  'australian':     '🇦🇺',
  'japanese':       '🇯🇵',
  'chinese':        '🇨🇳',
  'miami':          '🇺🇸',
  'emilia':         '🇮🇹',
  'monaco':         '🇲🇨',
  'canadian':       '🇨🇦',
  'spanish':        '🇪🇸',
  'austrian':       '🇦🇹',
  'british':        '🇬🇧',
  'hungarian':      '🇭🇺',
  'belgian':        '🇧🇪',
  'dutch':          '🇳🇱',
  'italian':        '🇮🇹',
  'azerbaijan':     '🇦🇿',
  'singapore':      '🇸🇬',
  'united states':  '🇺🇸',
  'mexico':         '🇲🇽',
  'são paulo':      '🇧🇷',
  'brazil':         '🇧🇷',
  'las vegas':      '🇺🇸',
  'qatar':          '🇶🇦',
  'abu dhabi':      '🇦🇪',
};

export function getF1RaceFlag(eventName) {
  if (!eventName) return '🏎️';
  const lower = eventName.toLowerCase();
  for (const [key, flag] of Object.entries(F1_FLAG_MAP)) {
    if (lower.includes(key)) return flag;
  }
  return '🏎️';
}

export async function getF1Races() {
  const res = await axios.get(`${SPORTS_DB}/eventsnextleague.php?id=4370`);
  const events = res.data.events || [];

  // Group all sessions by GP name, keep one entry per Grand Prix (prefer Race, fall back to any session)
  const gpMap = new Map();
  for (const e of events) {
    const lower = e.strEvent?.toLowerCase() || '';
    const gpName = e.strEvent
      ?.replace(/\s+(Race\s*\d?|Practice\s*\d?|Qualifying|Sprint|Sprint Shootout)$/i, '')
      .trim() || e.strEvent;
    const isRace = !lower.includes('practice') && !lower.includes('qualifying') && !lower.includes('sprint');
    if (!gpMap.has(gpName)) {
      gpMap.set(gpName, { ...e, strEvent: gpName, _isRace: isRace });
    } else if (isRace && !gpMap.get(gpName)._isRace) {
      gpMap.set(gpName, { ...e, strEvent: gpName, _isRace: true });
    }
  }
  // Always return the next race regardless of how far away it is
  return [...gpMap.values()].slice(0, 1);
}

export async function getNBAGames() {
  const res = await axios.get(`${SPORTS_DB}/eventsnextleague.php?id=4387`);
  const allEvents = res.data.events || [];

  if (allEvents.length === 0) return [];

  // Sort by date ascending
  const sorted = [...allEvents].sort((a, b) =>
    new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`) -
    new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`)
  );

  // Show all games on the earliest available date
  const firstDate = sorted[0].dateEvent;
  return sorted.filter(e => e.dateEvent === firstDate);
}

export async function getUpcomingMatches(leagueId) {
  if (leagueId === 4370) return getF1Races();
  if (leagueId === 4387) return getNBAGames();

  const now = new Date();
  // World Cup spans weeks — use 30-day window; others use 14 days
  const windowDays = leagueId === 4429 ? 30 : 14;
  const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // First get the next event to find current round + season
  const next = await axios.get(`${SPORTS_DB}/eventsnextleague.php?id=${leagueId}`);
  const events = next.data.events || [];
  if (events.length === 0) return [];

  const { intRound, strSeason } = events[0];

  // Knockout/final rounds (round >= 100) or missing round info — return directly from next
  if (!intRound || !strSeason || intRound >= 100) {
    return events
      .filter(e => {
        const d = new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}`);
        const notStarted = !e.strStatus || e.strStatus === 'Not Started' || e.strStatus === 'NS';
        return notStarted && d <= cutoff;
      })
      .sort((a, b) => new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`) - new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`));
  }

  // Fetch all games in the current round
  const round = await axios.get(`${SPORTS_DB}/eventsround.php?id=${leagueId}&r=${intRound}&s=${strSeason}`);
  const allGames = round.data.events || [];

  // Only not-started games within 14 days, sorted by date
  const upcoming = allGames
    .filter(e => {
      const d = new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}`);
      const notStarted = !e.strStatus || e.strStatus === 'Not Started' || e.strStatus === 'NS';
      return notStarted && d <= cutoff;
    })
    .sort((a, b) => new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`) - new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`));

  if (upcoming.length === 0) return [];

  // World Cup: show all games in the current round (group stage spans multiple days)
  if (leagueId === 4429) return upcoming;

  // Other leagues: show only the earliest match-day in this round
  const firstDate = upcoming[0].dateEvent;
  return upcoming.filter(e => e.dateEvent === firstDate);
}

export const SPORTS = [
  {
    id: 'football',
    name: 'Football',
    emoji: '⚽',
    leagues: [
      { id: 4429, name: 'World Cup',           emoji: '🏆', logo: 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png' },
      { id: 4480, name: 'Champions League',    emoji: '⭐', logo: 'https://r2.thesportsdb.com/images/media/league/badge/facv1u1742998896.png' },
      { id: 4481, name: 'Europa League',       emoji: '🟠', logo: 'https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png' },
      { id: 5071, name: 'Conference League',   emoji: '🟢', logo: 'https://r2.thesportsdb.com/images/media/league/badge/ymfo5j1718775759.png' },
      { id: 4328, name: 'Premier League',      emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
      { id: 4335, name: 'La Liga',             emoji: '🇪🇸' },
      { id: 4332, name: 'Serie A',             emoji: '🇮🇹' },
      { id: 4331, name: 'Bundesliga',          emoji: '🇩🇪' },
      { id: 4334, name: 'Ligue 1',             emoji: '🇫🇷' },
      { id: 4579, name: 'Bulgarian First Pro', emoji: '🇧🇬' },
    ],
  },
  {
    id: 'basketball',
    name: 'Basketball',
    emoji: '🏀',
    leagues: [
      { id: 4387, name: 'NBA', emoji: '🏆' },
    ],
  },
  {
    id: 'f1',
    name: 'Formula 1',
    emoji: '🏎️',
    leagues: [
      { id: 4370, name: 'Race Winner', emoji: '🏎️', logo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png' },
    ],
  },
];

// Flat league list kept for backwards compatibility
export const LEAGUES = SPORTS.flatMap(s => s.leagues);

// Returns the earliest upcoming match date (ms) for a league, or Infinity if none
export async function getLeagueNextMatchDate(leagueId) {
  try {
    const matches = await getUpcomingMatches(leagueId);
    if (!matches || matches.length === 0) return Infinity;
    const first = matches[0];
    return new Date(`${first.dateEvent}T${first.strTime || '00:00:00'}`).getTime();
  } catch {
    return Infinity;
  }
}
