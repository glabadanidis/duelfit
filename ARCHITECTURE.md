# DuelFit Architecture

Everything below was read out of the code, not from memory. Where the code and the live database
may disagree, that is called out rather than smoothed over.

## The shape of it

```
   React Native app (Expo)                Supabase                    TheSportsDB
  +---------------------+          +---------------------+        +------------------+
  |  screens            |          |  auth (email)       |        |  fixtures        |
  |  constants/api.js   +--------->+  postgres + RLS     |        |  results         |
  |  supabase client    |  anon    |  edge functions     +------->+  free tier v1/3  |
  +----------+----------+   key    |  pg_cron hourly     |        +------------------+
             |                     +----------+----------+
             |  read fixtures                 |
             +--------------------------------+---------> Expo Push (exp.host)
                        direct from client              client side sends
```

Three things to hold on to:

1. **The app talks to TheSportsDB directly from the client.** There is no backend proxy. No API key
   is needed because the free tier key `3` is in the URL path.
2. **Settlement is server side and hourly.** A user never has to open the app for a challenge to
   resolve. The cron does it.
3. **Push notifications are sent from the client**, not from the server. The phone that creates a
   challenge is the phone that calls Expo's push API to notify the opponent. This is the weakest
   part of the design, see [Known weaknesses](#known-weaknesses).

## Data model

Three tables. All three have RLS enabled.

### `profiles`
One row per user, `id` matches `auth.users.id`.

| Column | Notes |
|---|---|
| `id` | uuid, foreign key to `auth.users` |
| `username` | unique case insensitively, enforced by the `profiles_username_lower_key` index |
| `full_name` | set from signup metadata |
| `points` | +10 per challenge won, incremented via the `increment_points` RPC |
| `push_token` | Expo push token, written by `savePushToken()` on every app open |
| `forfeits_done` | forfeits completed as the loser, backfilled from approved proofs. Not yet written by the app |
| `forfeits_ducked` | forfeits not done in time. Always 0 for now, nothing writes it yet |

There is no `email` column (the address lives in `auth.users`) and no `avatar_url` column.

Only logged in users can read `profiles`. Anonymous callers get nothing, see
[Row level security](#row-level-security).

Rows are created by a **database trigger on `auth.users`**, not by the app. `Register.js` passes
`full_name` and `username` in `options.data` of `signUp()` and never inserts into `profiles`.
That trigger is not in this repo. See [Known gaps](#known-gaps-in-the-migrations).

### `challenges`
The core table.

| Column | Notes |
|---|---|
| `id` | uuid |
| `match_id` | TheSportsDB event id, this is what settlement looks up |
| `match_home_team`, `match_away_team` | denormalised so the UI never needs a second API call |
| `match_date` | date the fixture starts, drives settlement eligibility |
| `sport` | `football`, `basketball` or `f1` |
| `challenger_id`, `opponent_id` | both foreign keys to `profiles` |
| `challenger_pick`, `opponent_pick` | team name, driver name, or `Draw` |
| `forfeit` | free text, whatever the two of them agreed |
| `status` | `pending`, `accepted`, `declined`, `completed` |
| `winner_id` | null until settled, and stays null if both picked the same outcome |
| `result` | the actual outcome as a string, added by the `add_result_to_challenges` migration |
| `created_at` | |

`status` is the whole state machine. The Challenges screen's `active` and `completed` tabs are a UI
grouping, not a database value. `active` means `pending` or `accepted`.

### `friendships`

| Column | Notes |
|---|---|
| `id` | uuid |
| `requester_id` | who sent the request |
| `addressee_id` | who received it |
| `status` | `pending` (the default) or `accepted` |

Declining a request or removing a friend deletes the row, there is no `declined` state. The
`friendships_pair_key` unique index allows one row per pair of people whichever direction it was
sent in, so A and B cannot both have a pending request to each other.

Friends are a shortcut, not a gate. They are listed first when picking an opponent, but any player
can be challenged by searching their username.

### RPC

`increment_points(user_id uuid, amount int)` is called from both `settle-challenges` and
`MarkResult.js`. Its definition is **not in this repo**, it was created in the Supabase SQL editor.

`username_available(check_username text)` returns a boolean and nothing else. It is
`SECURITY DEFINER` and callable by `anon`, because Register runs before the account exists and anon
cannot read `profiles`. Defined in `20260924000000_close_profiles_read_hole.sql`.

## Row level security

RLS is on for all three tables. What the live database actually has, verified 2026-09-28:

| Table | Command | Policy | Rule |
|---|---|---|---|
| `profiles` | SELECT | `profiles_select_authenticated` | any logged in user, never anon |
| `challenges` | SELECT | `Users can view own challenges` | participants only |
| `challenges` | INSERT | `challenges_insert_challenger` | you are the challenger, and not also the opponent |
| `challenges` | UPDATE | `Users can update challenges` | participants, any column. See [Known weaknesses](#known-weaknesses) |
| `challenges` | DELETE | `challenges_delete_challenger` | the challenger, while still `pending` |
| `friendships` | SELECT | `friendships_select_participant` | either side |
| `friendships` | INSERT | `friendships_insert_own` | you are the requester, not the addressee, status `pending` |
| `friendships` | UPDATE | `friendships_update_participant` | addressee only, `pending` to `accepted` only |
| `friendships` | DELETE | `friendships_delete_own` | either side |

On top of the UPDATE policy, `authenticated` has UPDATE privilege on `friendships.status` only, so
accepting a request cannot also rewrite who it is between.

Three things about Postgres RLS that have caused real bugs here:

- **Policies for the same command combine with OR.** A strict policy sitting next to a loose one
  does nothing. When tightening, drop every policy for that command, not just the one you know.
- **A policy with no `TO` clause applies to every role, including `anon`.** That is how `profiles`
  was readable without logging in until 2026-09-24.
- **No policy means zero rows, not an error.** Until 2026-09-28 `challenges` had no DELETE policy,
  so Cancel Challenge reported success and deleted nothing.

## Challenge lifecycle

```
  Challenger                                            Opponent
      |                                                     |
      |  Step1Match   pick a league, pick a fixture          |
      |  Step2Pick    pick a side                            |
      |  Step3Forfeit type the forfeit                       |
      |  Step4Opponent friends first, or any username        |
      |                                                     |
      +--> INSERT challenges  status = 'pending' -----------+
      |    notifyChallengeSent() to opponent push_token     |
      |                                                     |
      |                                    AcceptPick screen |
      |                                    must pick the     |
      |                                    opposite side     |
      |                                                     |
      |<---- UPDATE status = 'accepted' <-------------------+
      |      notifyChallengeAccepted()                       |
      |                                                     |
      |      or UPDATE status = 'declined'                   |
      |      notifyChallengeDeclined()                       |
      |                                                     |
      |  while pending the challenger can cancel,            |
      |  which DELETEs the row                               |
      |                                                     |
      =========== match is played ===========================
      |                                                     |
      |  pg_cron, every hour at :00                          |
      |    -> settle-challenges edge function                |
      |    -> TheSportsDB lookupevent                        |
      |    -> UPDATE status = 'completed', winner_id, result  |
      |    -> increment_points(winner, 10)                   |
      |                                                     |
      |  MarkResult screen is the manual fallback            |
```

The four wizard steps hold state in `challengeContext.js` (match, pick, forfeit, opponent) and only
write to the database on the final step. Backing out of the wizard loses the draft. That is
deliberate, there is no draft persistence.

## Settlement

`supabase/functions/settle-challenges/index.ts`, triggered hourly by `pg_cron` at `0 * * * *` using
`pg_net` to POST to the function URL with a service role bearer token pulled from
`current_setting('app.service_role_key', true)`.

The function:

1. Rejects any request whose `Authorization` header is not exactly `Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
2. Selects challenges where `status = 'accepted'` and `match_date <= today`.
3. For each one, calls `lookupevent.php?id=<match_id>`.
4. Works out the actual result:
   - **F1** is detected by `!event.strHomeTeam && event.strResult`. The winner is the first line of
     `strResult` with the leading `1. ` stripped.
   - **Everything else** compares `intHomeScore` and `intAwayScore` and resolves to the home team,
     the away team, or the literal string `Draw`.
5. Matches the result against both picks. If nobody picked it, or both picked the same thing,
   `winner_id` stays null and the challenge still completes.
6. Writes the update **conditionally**:

```ts
.update({ status: 'completed', winner_id, result: actualResult })
.eq('id', challenge.id).eq('status', 'accepted')   // <- this guard
```

Only awarding points when that update returns a row is what stops a double award if the cron and a
manual `MarkResult` race each other. Do not remove the `.eq('status', 'accepted')`.

7. Swallows per challenge errors with `catch (_) {}` so one unparseable fixture cannot stop the
   batch. It also means **failures are silent**. There is no alerting on this.

## The other edge function

`delete-account` exists because the App Store requires in app account deletion. It builds two
clients: a service role client to do the deletion, and a user client using the anon key plus the
caller's `Authorization` header, purely to verify who is asking via `auth.getUser()`. Then it
deletes the `profiles` row and calls `auth.admin.deleteUser()`.

## Fixtures and leagues

All of this lives in `src/constants/api.js` against `https://www.thesportsdb.com/api/v1/json/3`.

**Football:** World Cup 4429, Champions League 4480, Europa League 4481, Conference League 5071,
Premier League 4328, La Liga 4335, Serie A 4332, Bundesliga 4331, Ligue 1 4334, Bulgarian First
Professional League 4579.
**Basketball:** NBA 4387.
**Formula 1:** 4370, race winner only.

### The 7 day window

`WINDOW_DAYS = 7` is the single visibility rule. A fixture shows only if it has not started, is
still in the future, and kicks off inside the window. A league with nothing inside the window is
hidden, and a sport whose every league is hidden is hidden too, so out of season the Basketball tab
disappears on its own.

`ALWAYS_SHOW_LEAGUE_IDS` is the one exception and holds **Formula 1 only**, because races are up to
a fortnight apart. The next race always shows however far away it is, and the tab goes only once
there is no upcoming event at all.

`getAvailableSports()` answers which sports and leagues to render. It probes one request per league,
keeps the leagues inside the window, sorts them soonest first and drops the empty sports.
`getAvailableLeagues()` is the flat version for screens with one league strip.

`getUpcomingMatches(leagueId)` branches three ways:

- **F1 (4370)** goes to `getF1Races()`, which groups every session by Grand Prix name, prefers the
  Race session over practice and qualifying, and returns exactly one upcoming Grand Prix.
- **NBA (4387)** goes to `getNBAGames()`, which returns the in window games from the next events list.
- **Everything else** reads the next event to learn `intRound` and `strSeason`, then fetches
  **round, round+1 and round+2** and merges them with the next events list, deduped on `idEvent`.
  Knockout rounds (`intRound >= 100`) or missing round data use the next events list alone.

`intRound` and `strSeason` come back as **strings**, so the round is coerced with `Number()`. Without
that, `intRound + 1` concatenates and every domestic league silently returns nothing.

Fetching three rounds rather than one is necessary because the free tier returns a single fixture
from `eventsnextleague.php` and five per round from `eventsround.php`.

### Talking to the free tier

The free tier rate limits hard and the 429 body is an **HTML error page, not JSON**, so a careless
caller reads `events` as undefined and concludes a league has no fixtures. Measured: 12 sequential
requests 350ms apart all succeed, 150ms apart fails from the tenth, and a single `Promise.all` over
12 leagues returns 429 for all of them and keeps rejecting for about a minute.

Everything therefore goes through the serialised `fetchJson` queue in `api.js`. It spaces requests
350ms apart, retries once, and returns **`null` for a failed request as distinct from `[]` for no
fixtures**. Callers must keep those apart: a league that cannot be checked stays visible, and a
probe that fails everywhere keeps the previous answer instead of emptying the screen. Nothing may
call axios against TheSportsDB directly, which is why `Challenges/Detail.js` uses the exported
`lookupEvent()`.

Because probing every league costs a request each and about five seconds, the answer is cached in
AsyncStorage under `duelfit.availability.v1` with a 6 hour TTL, alongside a 60 second per URL
response cache. Pull to refresh forces a recheck.

**Tennis is deliberately absent.** The free tier has no Grand Slam fixtures. Adding it needs a
paid TheSportsDB tier or a move to API-Football.

`getTeamFlag()`, `F1_TEAM_LOGOS`, `F1_DRIVERS` (2026 lineup) and `getF1RaceFlag()` are hand
maintained lookup tables. `F1_DRIVERS` needs editing every season.

## Navigation

`src/navigation/index.js`. A native stack wrapping a four tab bottom navigator.

Friends is reached from the 👥 button in the Home header, which carries a badge with the number of
incoming requests and opens straight on the Requests tab when there are any, and from the Profile
quick links. The screen takes an optional `tab` param: `friends`, `requests` or `search`.

- **Tabs:** Home, Challenges, Leaderboard, Profile
- **Stacked on top:** Notifications, the four wizard steps, AcceptPick, MarkResult, Friends,
  Settings, ChallengeDetail
- **Unauthenticated stack:** Onboarding (first launch only), Login, Register, ForgotPassword,
  ConfirmEmail

The auth gate is a session check, so signing out re-renders straight back to the auth stack.

## Notifications

`src/constants/notifications.js`. `savePushToken()` registers with Expo, needs the hardcoded
`projectId`, and writes the token onto the user's profile row. `notifyChallengeSent`,
`notifyChallengeAccepted`, `notifyChallengeDeclined`, `notifyFriendRequest` and
`notifyFriendAccepted` read the target's `push_token` and POST straight to
`https://exp.host/--/api/v2/push/send`.

Because the client does the send, any logged in user can read every other user's `push_token`.
Moving the send server side is what would let that column be closed.

Android push does not work yet: there is no `google-services.json` and no FCM key on EAS, and
`savePushToken()` swallows the resulting error silently.

The Notifications screen is not a notifications table. It queries `challenges` with an
`or(challenger_id.eq..., opponent_id.eq...)` and renders the recent ones. There is no read state
and no notification history.

## Known gaps in the migrations

The files in `supabase/migrations/` are not a complete description of the live database. Things
were created in the Supabase SQL editor and never written back.

**Do not run `supabase db push` against this project.** The CLI's migration history does not match
what was actually applied, so it would try to rerun old files. Every migration since 2026-09-24 was
applied by pasting it into the SQL editor, and that is the way to apply new ones.

1. **No `CREATE TABLE` for anything.** `profiles`, `challenges` and `friendships` were all created
   in the dashboard. There is no way to stand up a fresh environment from this repo today.
2. **`increment_points` is not defined anywhere in the repo** but is called from two places.
3. **The `auth.users` trigger that creates a profile row is not in the repo.**
4. **`20260604000000_rls_policies.sql` never ran.** Its friendships block used `user_id` and
   `friend_id`, which do not exist, so the whole file rolled back. The live policies were made by
   hand instead. The file has since been corrected so it converges if rerun, and the policies it
   used to define loosely now live in the 2026-09 files, but the `challenges` SELECT and UPDATE
   policies on the live database are still the dashboard-made ones.

Applied by hand in the SQL editor, in order, and verified:

| File | What it does |
|---|---|
| `20260924000000_close_profiles_read_hole.sql` | `profiles` readable by logged in users only, adds `username_available()` and the forfeit counters |
| `20260924000001_policy_cleanup_and_backfill.sql` | drops duplicate friendships policies, case insensitive username index, backfills `forfeits_done` |
| `20260928000000_friendships_hardening.sql` | requests start pending, only the addressee accepts, one INSERT policy on `challenges` |
| `20260928000001_friendships_one_row_per_pair.sql` | one friendship row per pair |
| `20260928000002_challenges_delete_policy.sql` | lets the challenger cancel a pending challenge |

To see what is really there, in the SQL editor:

```sql
select tablename, cmd, policyname from pg_policies where schemaname = 'public' order by 1, 2;
select table_name, column_name from information_schema.columns
  where table_name in ('profiles','challenges','friendships') order by table_name, ordinal_position;
select routine_name from information_schema.routines where routine_name = 'increment_points';
select jobname, schedule from cron.job;
```

## Known weaknesses

Worth knowing before you touch anything, in rough order of how much they matter.

- **Push notifications are sent from the client.** If the challenger's phone loses connection after
  the insert, the opponent is never notified and the challenge sits in `pending` forever. The fix is
  a database trigger or an edge function doing the send.
- **No crash reporting.** Nothing is instrumented. A crash on a user's phone is invisible to us.
  Sentry via `@sentry/react-native` is the obvious first addition.
- **Settlement failures are silent** because of the `catch (_) {}` per challenge. A run that resolves
  nothing looks identical to a run with nothing to do.
- **The `challenges` UPDATE policy lets either side update any column.** Nothing in the database
  stops an opponent rewriting `challenger_pick` after the fact, or a loser setting `proof_approved`
  on their own lost challenge. App code is not a security boundary. This has to be narrowed before
  points are awarded at proof approval, or approval becomes a way to mint points.
- **`src/components/` holds only `MatchRow`.** The rest of the card and row markup is still
  duplicated across screens, which is why `Challenges/Detail.js` is 541 lines.
- **No tests of any kind.**
- **TheSportsDB free tier is rate limited and has no SLA.** It is a single point of failure for both
  the fixture feed and settlement, and the limit is low enough to shape the design: see the
  serialised queue above. A paid key or a move to API-Football would remove the constraint and let
  league probing run in parallel again.
