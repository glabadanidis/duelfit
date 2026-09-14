import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SPORTS_DB = 'https://www.thesportsdb.com/api/v1/json/3';

// Only fixtures kicking off inside this window are shown anywhere in the app. A league with
// nothing inside it is hidden, and a sport whose every league is hidden is hidden too.
export const WINDOW_DAYS = 7;

// Formula 1 is the one exception. There is at most one race a fortnight, so the next race is always
// shown however far away it is, and the tab only disappears once the season is genuinely over.
const ALWAYS_SHOW_LEAGUE_IDS = new Set([4370]);

// The free tier rate limits hard. Measured: 12 sequential requests 300ms apart all return 200,
// 150ms apart starts failing on the tenth, and any real concurrency returns 429 for every request
// in the batch and then keeps rejecting for a minute or so. A 429 body is an HTML error page, not
// JSON, so a careless caller reads events as undefined and concludes the league has no fixtures.
// Every call therefore goes through the queue below. Never call axios against SPORTS_DB directly.
const MIN_GAP_MS = 350;
const RETRY_DELAY_MS = 1500;
const RESPONSE_TTL_MS = 60 * 1000;

const responseCache = new Map();
let lastRequestAt = 0;
let chain = Promise.resolve();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Resolves to the parsed body, or null when the request failed. null means "we cannot tell", which
// is deliberately not the same as "no events", so a rate limited probe can never hide a live league.
function fetchJson(url) {
  const hit = responseCache.get(url);
  if (hit && Date.now() - hit.at < RESPONSE_TTL_MS) return Promise.resolve(hit.data);

  const run = async () => {
    const fresh = responseCache.get(url);
    if (fresh && Date.now() - fresh.at < RESPONSE_TTL_MS) return fresh.data;

    for (let attempt = 0; attempt < 2; attempt++) {
      const gap = MIN_GAP_MS - (Date.now() - lastRequestAt);
      if (gap > 0) await sleep(gap);
      lastRequestAt = Date.now();
      try {
        const res = await axios.get(url, { timeout: 12000 });
        // Insist on a parsed object, since a rate limited response is an HTML string
        if (res.data && typeof res.data === 'object') {
          responseCache.set(url, { at: Date.now(), data: res.data });
          return res.data;
        }
      } catch (e) {
        // fall through to the retry
      }
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
    return null;
  };

  chain = chain.then(run, run);
  return chain;
}

export function lookupEvent(eventId) {
  return fetchJson(`${SPORTS_DB}/lookupevent.php?id=${eventId}`);
}

function eventTime(e) {
  return new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}`).getTime();
}

function isNotStarted(e) {
  return !e.strStatus || e.strStatus === 'Not Started' || e.strStatus === 'NS';
}

// Not started and still in the future. The future check matters because TheSportsDB leaves
// strStatus as 'NS' for a while after kick off, and a match that has already started cannot be
// challenged on.
function isUpcoming(e, now = Date.now()) {
  return isNotStarted(e) && eventTime(e) >= now;
}

function isInWindow(e, now = Date.now()) {
  return isUpcoming(e, now) && eventTime(e) <= now + WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function byKickoff(a, b) {
  return eventTime(a) - eventTime(b);
}

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

// Returns an array of fixtures, or null when the request failed
export async function getF1Races() {
  const data = await fetchJson(`${SPORTS_DB}/eventsnextleague.php?id=4370`);
  if (!data) return null;
  const events = data.events || [];

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
  // Always the next race, however far away it is. F1 is exempt from WINDOW_DAYS.
  return [...gpMap.values()].filter(e => isUpcoming(e)).sort(byKickoff).slice(0, 1);
}

export async function getNBAGames() {
  const data = await fetchJson(`${SPORTS_DB}/eventsnextleague.php?id=4387`);
  if (!data) return null;
  return (data.events || []).filter(e => isInWindow(e)).sort(byKickoff);
}

// Returns the in window fixtures for a league, or null when the request failed. The caller has to
// tell those two apart, otherwise a rate limited response reads as "this league has no games".
export async function getUpcomingMatches(leagueId) {
  if (leagueId === 4370) return getF1Races();
  if (leagueId === 4387) return getNBAGames();

  // eventsnextleague gives the genuinely next fixture and, with it, the round and season to ask for
  const next = await fetchJson(`${SPORTS_DB}/eventsnextleague.php?id=${leagueId}`);
  if (!next) return null;
  const nextEvents = next.events || [];
  if (nextEvents.length === 0) return [];

  const { intRound, strSeason } = nextEvents[0];
  // intRound comes back as a string. Without Number() the additions below concatenate and
  // [4, 5, 6] becomes ['4', '41', '42'], which is why domestic leagues showed nothing at all.
  const round = Number(intRound);

  let pool = nextEvents;

  // The free tier caps eventsnextleague at a single fixture, so round based leagues need the
  // current and next two rounds pulled explicitly. Knockout rounds (>= 100) and anything with no
  // round info have only eventsnextleague to go on.
  if (round && strSeason && round < 100) {
    const rounds = [];
    for (const r of [round, round + 1, round + 2]) {
      const data = await fetchJson(`${SPORTS_DB}/eventsround.php?id=${leagueId}&r=${r}&s=${strSeason}`);
      if (data) rounds.push(...(data.events || []));
    }
    pool = [...nextEvents, ...rounds];
  }

  // The current round overlaps with eventsnextleague, so dedupe on the event id
  const byId = new Map(pool.map(e => [e.idEvent, e]));
  return [...byId.values()].filter(e => isInWindow(e)).sort(byKickoff);
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

// Earliest upcoming kick off (ms) for a league, Infinity when there is genuinely nothing, or null
// when the request failed and we cannot tell. One request per league: eventsnextleague returns the
// genuinely next fixture, so if that is outside the window there is nothing inside it either.
export async function getLeagueNextMatchDate(leagueId) {
  const data = await fetchJson(`${SPORTS_DB}/eventsnextleague.php?id=${leagueId}`);
  if (!data) return null;
  const times = (data.events || [])
    .filter(e => isNotStarted(e))
    .map(eventTime)
    .filter(t => t >= Date.now());
  return times.length > 0 ? Math.min(...times) : Infinity;
}

// Probing every league costs one request each, and at 350ms apart that is around five seconds. Far
// too expensive to repeat on every mount, so the answer is cached on disk. Fixture schedules do not
// change hour to hour, so a long TTL is fine and pull to refresh forces a recheck.
const AVAILABILITY_KEY = 'duelfit.availability.v1';
const AVAILABILITY_TTL_MS = 6 * 60 * 60 * 1000;

let availability = null;
let inFlight = null;

// Rebuilt from SPORTS every time rather than stored, so a cached list can never go stale on a name
// or a logo, only on which leagues are in it.
function sportsFromIds(orderedIds) {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  return SPORTS
    .map(sport => ({
      ...sport,
      leagues: sport.leagues
        .filter(l => rank.has(l.id))
        .sort((a, b) => rank.get(a.id) - rank.get(b.id)),
    }))
    .filter(sport => sport.leagues.length > 0);
}

async function readAvailability() {
  if (availability) return availability;
  try {
    const raw = await AsyncStorage.getItem(AVAILABILITY_KEY);
    if (raw) availability = JSON.parse(raw);
  } catch {
    // no cache, fall through to a probe
  }
  return availability;
}

async function probeAvailability(previous) {
  const cutoff = Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const ids = LEAGUES.map(l => l.id);
  const dates = [];
  for (const id of ids) dates.push(await getLeagueNextMatchDate(id));

  // Every probe failed, so we are rate limited or offline. Keep the previous answer rather than
  // emptying the screen, and do not cache this.
  if (dates.every(d => d === null)) {
    return sportsFromIds(previous ? previous.leagueIds : ids);
  }

  const keep = ids
    .map((id, i) => ({ id, at: dates[i] }))
    // null is one league we could not check. Keep it, an empty chip beats a hidden live league.
    // Infinity means no upcoming event at all, which hides even an always-show league.
    .filter(x => x.at === null || x.at <= cutoff || (ALWAYS_SHOW_LEAGUE_IDS.has(x.id) && x.at !== Infinity))
    .sort((a, b) => (a.at === null ? Infinity : a.at) - (b.at === null ? Infinity : b.at));

  availability = { at: Date.now(), leagueIds: keep.map(x => x.id) };
  try {
    await AsyncStorage.setItem(AVAILABILITY_KEY, JSON.stringify(availability));
  } catch {
    // cache is an optimisation, losing it is not an error
  }
  return sportsFromIds(availability.leagueIds);
}

// SPORTS filtered down to what has something on in the next WINDOW_DAYS days, leagues soonest
// first, sports with nothing left dropped.
export async function getAvailableSports({ force = false } = {}) {
  const cached = await readAvailability();
  if (!force && cached && Date.now() - cached.at < AVAILABILITY_TTL_MS) {
    return sportsFromIds(cached.leagueIds);
  }
  // Home and the challenge wizard can both ask at once. Share the one probe, never run two.
  if (!inFlight) {
    inFlight = probeAvailability(cached).finally(() => { inFlight = null; });
  }
  return inFlight;
}

// Flat version of getAvailableSports for screens that show one league strip instead of tabs
export async function getAvailableLeagues(opts) {
  const sports = await getAvailableSports(opts);
  return sports.flatMap(s => s.leagues);
}
