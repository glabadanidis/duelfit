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
| `username` | unique in practice, checked in the app not by a constraint we can see |
| `full_name` | set from signup metadata |
| `email` | |
| `points` | +10 per challenge won, incremented via the `increment_points` RPC |
| `push_token` | Expo push token, written by `savePushToken()` on every app open |
| `avatar_url` | set by the Profile screen via expo-image-picker |

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
| `status` | `pending` or `accepted` |

**The app uses `requester_id` and `addressee_id`. The RLS migration uses `user_id` and `friend_id`.**
Those cannot both be right. See [Known gaps](#known-gaps-in-the-migrations).

### RPC

`increment_points(user_id uuid, amount int)` is called from both `settle-challenges` and
`MarkResult.js`. Its definition is **not in this repo**, it was created in the Supabase SQL editor.

## Challenge lifecycle

```
  Challenger                                            Opponent
      |                                                     |
      |  Step1Match   pick a league, pick a fixture          |
      |  Step2Pick    pick a side                            |
      |  Step3Forfeit type the forfeit                       |
      |  Step4Opponent pick a friend                         |
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

`getUpcomingMatches(leagueId)` branches three ways:

- **F1 (4370)** goes to `getF1Races()`, which groups every session by Grand Prix name, prefers the
  Race session over practice and qualifying, and returns exactly one upcoming Grand Prix no matter
  how far away it is.
- **NBA (4387)** goes to `getNBAGames()`, which returns every game on the earliest available date.
- **Everything else** reads the next event to learn `intRound` and `strSeason`, then fetches
  **round, round+1 and round+2** in parallel with a per round `.catch(() => [])`. Knockout rounds
  (`intRound >= 100`) or missing round data skip that and use the next events list directly.

Then two rules on top:

- The window is **30 days for the World Cup, 14 days for everything else**.
- The World Cup shows **every** upcoming fixture in the window. Every other league shows **only the
  earliest match day**, so the feed is one round at a time.

Fetching three rounds rather than one is why the feed no longer empties out between match days.

**Tennis is deliberately absent.** The free tier has no Grand Slam fixtures. Adding it needs a
paid TheSportsDB tier or a move to API-Football.

`getTeamFlag()`, `F1_TEAM_LOGOS`, `F1_DRIVERS` (2026 lineup) and `getF1RaceFlag()` are hand
maintained lookup tables. `F1_DRIVERS` needs editing every season.

## Navigation

`src/navigation/index.js`. A native stack wrapping a four tab bottom navigator.

- **Tabs:** Home, Challenges, Leaderboard, Profile
- **Stacked on top:** Notifications, the four wizard steps, AcceptPick, MarkResult, Friends,
  Settings, ChallengeDetail
- **Unauthenticated stack:** Onboarding (first launch only), Login, Register, ForgotPassword,
  ConfirmEmail

The auth gate is a session check, so signing out re-renders straight back to the auth stack.

## Notifications

`src/constants/notifications.js`. `savePushToken()` registers with Expo, needs the hardcoded
`projectId`, and writes the token onto the user's profile row. `notifyChallengeSent`,
`notifyChallengeAccepted` and `notifyChallengeDeclined` read the target's `push_token` and POST
straight to `https://exp.host/--/api/v2/push/send`.

The Notifications screen is not a notifications table. It queries `challenges` with an
`or(challenger_id.eq..., opponent_id.eq...)` and renders the recent ones. There is no read state
and no notification history.

## Known gaps in the migrations

The four files in `supabase/migrations/` are not a complete description of the live database. Things
were created in the Supabase SQL editor and never written back. **Before running `supabase db push`
against production, confirm what is actually there.**

1. **No `CREATE TABLE` for anything.** `profiles`, `challenges` and `friendships` were all created
   in the dashboard. There is no way to stand up a fresh environment from this repo today.
2. **`increment_points` is not defined anywhere in the repo** but is called from two places.
3. **The `auth.users` trigger that creates a profile row is not in the repo.**
4. **The friendships RLS policies reference `user_id` and `friend_id`, but the app reads and writes
   `requester_id` and `addressee_id`.** If the table really has `requester_id`, then
   `20260604000000_rls_policies.sql` failed when it reached those statements, which in Postgres means
   the whole file rolled back and **none of the RLS policies in it exist, on any of the three
   tables**. Check this first, it is a data exposure question, not a tidiness question.

Verify with, in the Supabase SQL editor:

```sql
select tablename, policyname from pg_policies where schemaname = 'public';
select table_name, column_name from information_schema.columns
  where table_name in ('profiles','challenges','friendships') order by table_name, ordinal_position;
select routine_name from information_schema.routines where routine_name = 'increment_points';
select jobname, schedule from cron.job;
```

Then write what is actually there back into a migration so the two match.

## Known weaknesses

Worth knowing before you touch anything, in rough order of how much they matter.

- **Push notifications are sent from the client.** If the challenger's phone loses connection after
  the insert, the opponent is never notified and the challenge sits in `pending` forever. The fix is
  a database trigger or an edge function doing the send.
- **No crash reporting.** Nothing is instrumented. A crash on a user's phone is invisible to us.
  Sentry via `@sentry/react-native` is the obvious first addition.
- **Settlement failures are silent** because of the `catch (_) {}` per challenge. A run that resolves
  nothing looks identical to a run with nothing to do.
- **`challenges_update_participant` lets either side update any column.** The comment in the
  migration says "key operations are scoped further in app code", which means the database is not
  actually stopping an opponent from rewriting `challenger_pick` after the fact. App code is not a
  security boundary.
- **`src/components/` is empty.** Card and row markup is duplicated across screens, which is why
  `Challenges/Detail.js` is 541 lines and `Home/index.js` is 449.
- **No tests of any kind.**
- **TheSportsDB free tier is rate limited and has no SLA.** It is a single point of failure for both
  the fixture feed and settlement.
