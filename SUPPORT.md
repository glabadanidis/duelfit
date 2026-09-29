# Running and supporting DuelFit

For whoever is on support. Assumes access to the Supabase dashboard.

## Where users reach us

Both the support URL and the privacy URL on the store listing point at
https://glabadanidis.github.io/duelfit-privacy/. There is no in app support form, no ticketing, and
no shared support inbox yet. **Setting up a real support address is a launch task, not a nice to
have.** Apple requires a working support URL and will check it.

## First thing to know

**There is no crash reporting.** If a user says "it crashed", there is no crash log to look at. All
you have is what they tell you and what you can reproduce. Adding Sentry is the single highest value
support improvement available and should happen before launch.

## The most likely complaint: "my challenge did not resolve"

Settlement is hourly, so up to an hour of delay is normal. Beyond that, work down this list.

**1. Find the challenge.**

```sql
select id, status, sport, match_id, match_date, match_home_team, match_away_team,
       challenger_pick, opponent_pick, winner_id, result, created_at
from challenges
where match_home_team ilike '%<team>%' or match_away_team ilike '%<team>%'
order by created_at desc;
```

**2. Read the status.**

- `pending` means the opponent never accepted. Nothing is broken. Either they ignored it or the push
  never arrived, which is a real possibility because pushes are sent from the challenger's phone.
- `accepted` with `match_date` in the past is the actual failure case. Go to step 3.
- `completed` with `winner_id` null is correct and expected when both players picked the same
  outcome, or when neither picked what actually happened. Explain it, do not "fix" it.

**3. Check the fixture is settleable.** Open the event TheSportsDB is being asked about:

```
https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=<match_id>
```

- No `intHomeScore` or `intAwayScore` means the free tier has not published the result. Nothing we
  can do but wait. This is common for smaller leagues.
- Postponed or abandoned fixtures never get scores, so they never settle. There is no handling for
  this. The challenge will sit in `accepted` forever until someone resolves it manually.
- For F1, check `strResult` is populated and its first line starts with `1. <driver>`. A different
  format means the parser will not find a winner.

**4. Check the cron is alive.**

```sql
select jobname, schedule, active from cron.job;
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 20;
```

`settle-challenges-hourly` should be there, `active`, on `0 * * * *`. A 401 in `return_message` means
the service role key setting broke, which is exactly what `20260604000001_fix_cron_auth.sql` was
written to fix. The cron reads it from `current_setting('app.service_role_key', true)`.

**5. Read the function logs.** Supabase dashboard, Edge Functions, `settle-challenges`, Logs. Bear in
mind per challenge errors are swallowed by `catch (_) {}`, so a challenge that failed to parse leaves
no trace. An empty log is not proof that nothing went wrong.

**6. Run it by hand** to confirm whether the function or the schedule is at fault. Do this from a
terminal, with the service role key from the Supabase dashboard, and **never paste that key into a
chat, a ticket or a commit**:

```bash
curl -X POST https://nofawxywnhqrqnwokkge.supabase.co/functions/v1/settle-challenges \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

If that settles the challenge, the function is fine and the schedule is the problem.

## Resolving a challenge manually

Last resort, when the fixture genuinely will never settle itself. Set the status and the winner in
one statement. Do not award any points by hand: they move later, when the forfeit is resolved, and
the database does it.

```sql
update challenges
set status = 'completed', result = '<actual outcome>', winner_id = '<uuid or null>'
where id = '<challenge id>' and status = 'accepted';
```

Calling `increment_points` on top of that pays the winner twice, once now and once when the
forfeit is resolved.

**"My opponent never approves my proof."** Nothing to do. Seven days after the proof was sent it
counts as approved and both players get their points.

**"My opponent keeps rejecting my proof."** The winner can reject at most twice, and each
rejection gives at least 2 more days to send new proof. After the second one they can only approve,
or it approves itself 7 days after the last proof. If they reject proof that is plainly fine, that
is a conduct issue between two people who know each other, not something to override in the
database.

**"I was marked as not doing my forfeit."** No proof arrived within 7 days, so it counts as ducked
and the winner got +5. Check `settled_at`, `proof_url` and `proof_photo_url` on the
challenge. If proof really was sent in time, set `forfeit_ducked = false` and
`proof_approved = true` together, then take 1 off the user's `forfeits_ducked` by hand.

## Other recurring cases

**"I cannot log in."** Supabase dashboard, Authentication, Users. Check the account exists and
whether the email was confirmed. Unconfirmed is the usual answer, the app has a ConfirmEmail screen
for it. You can resend or manually confirm from the dashboard.

**"I want my account deleted."** Point them at Settings in the app, it calls the `delete-account`
edge function. Do not delete rows by hand, the function deletes the profile row and the auth user
together and doing only one leaves an orphan.

**"My username is taken."** Usernames are unique ignoring case, enforced by the
`profiles_username_lower_key` index, so `Simeon` and `simeon` cannot both exist. Register checks
through the `username_available()` function before signing up. To see who has it:

```sql
select id, username, created_at from profiles where lower(username) = lower('<name>');
```

**"I cannot cancel my challenge."** Only the person who sent it can cancel, and only while it is
still `pending`. Once the opponent has accepted it cannot be cancelled, by design.

**"My friend request disappeared."** Declining deletes the request, there is no declined state, so
the sender just sees it vanish. They can send a new one.

**"I never got a notification."** Check the profile has a token:

```sql
select id, username, push_token is not null as has_token from profiles where username = '<name>';
```

No token means they declined the permission prompt, or the build has the push registration problem
described in [CLAUDE.md](CLAUDE.md). A token that exists but no notification arriving is most likely
the client side send failing, which is a known design weakness rather than a user error.

## App Store and Play review

- The rejection risk to prepare for is **gambling**. The answer, consistently: there is no money, no
  wagering, no odds and no prizes. Users agree a physical activity as the stake. It sits in the same
  category as a bet between friends over who does the washing up.
- Account deletion in app is required and is implemented. If a reviewer says it is missing, walk them
  to Settings.
- Keep `ITSAppUsesNonExemptEncryption: false` in `app.json`. Without it every submission stops for an
  export compliance question.
- Reply inside the Resolution Center within 24 hours. Answer the specific point, do not resubmit and
  hope.

## Health check worth doing weekly before launch

```sql
-- challenges that should have settled and did not
select count(*) from challenges where status = 'accepted' and match_date < current_date - 1;

-- did the cron run in the last two hours
select max(start_time) from cron.job_run_details;

-- challenges created in the last 7 days
select count(*) from challenges where created_at > now() - interval '7 days';

-- signups in the last 7 days, auth.users is the reliable source here
-- (profiles has no confirmed created_at column, check before relying on one)
select count(*) from auth.users where created_at > now() - interval '7 days';
```

The first query should be zero or close to it. Anything else is a settlement problem, and until
Sentry and alerting exist, this query is the only monitoring there is.
