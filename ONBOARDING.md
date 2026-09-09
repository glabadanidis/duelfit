# Onboarding: your first week on DuelFit

Written for a co-founder joining with full access. The aim is that by the end of day two you can run
the app, understand why it works the way it does, and ship something.

## What DuelFit is, in one paragraph

Two friends pick opposite sides on a real upcoming match. Before it starts they agree a physical
forfeit. The loser does it. There is no money, no odds and no wagering anywhere in the product, and
that is a deliberate positioning decision, not an unfinished feature. The "Fit" is the forfeit.

Where it stands today: the full feature set is built and working, roughly 4,650 lines across the app.
It has never been submitted to either store. The store copy, icons, privacy policy and screenshot
plan are done. What is missing is not features, it is release engineering and operational visibility.

## Day one: access

Ask for all of these. Each one blocks something specific.

| System | What to ask for | Blocks |
|---|---|---|
| GitHub | Admin on `glabadanidis/duelfit` | Everything |
| Supabase | Member on project `nofawxywnhqrqnwokkge` | The database, edge functions, auth, logs |
| Expo / EAS | Member of the `glabadanidis` account | Builds and over the air updates |
| App Store Connect | App Manager or Admin on the DuelFit app | iOS submission, TestFlight, review replies |
| Google Play Console | Admin on `com.duelfit.app` | Android submission |
| Domain | Access to the `duelfit.io` registrar | Landing page, email addresses |

**One constraint to expect on Apple.** The Apple Developer account is an **Individual** account. An
Individual account can add users in App Store Connect, which covers submissions, TestFlight and
review correspondence, but it **cannot grant Developer portal access** for signing certificates and
provisioning profiles. In practice that means credentials for iOS builds stay with Simeon, and EAS
handles the signing. Moving to an Organization account would fix it properly but requires a legal
entity and a D-U-N-S number, which is a separate decision with tax and liability consequences.

## Day one: get it running

Follow [README.md](README.md#run-it-locally). Two things worth knowing before you start:

- Use a **physical phone with Expo Go**. Push notifications and `expo-device` do not work in a
  simulator, and you will otherwise spend an hour debugging a bug that is not there.
- The `.env` file is not in the repo and never has been. Ask Simeon for the two values. The anon key
  is safe on a client, RLS is what protects the data. The service role key must never end up in the
  repo or in a local `.env` here.

Then do this end to end on your own device, because it is the fastest way to understand the product:
register an account, add Simeon as a friend, create a challenge on a fixture happening in the next
day or two, have him accept it, and watch it settle after the match.

## Day two: read, in this order

1. [ARCHITECTURE.md](ARCHITECTURE.md) top to bottom. It is the map.
2. `src/constants/api.js`. All the awkwardness lives here: three league branches, the World Cup
   special cases, and F1 being a different shape at every layer.
3. `supabase/functions/settle-challenges/index.ts`. It is short and it is the only real business
   logic in the system.
4. [CLAUDE.md](CLAUDE.md). The traps. Every item on that list cost someone time already.
5. [SUPPORT.md](SUPPORT.md). Skim it now, come back when a user complains.

Then read the git log. Eleven commits, and two of them are called `Fix all 8 launch blockers` and
`Fix remaining 3 launch blockers`. Reading those diffs tells you what has already been found and
fixed, so you do not "fix" it again.

## The one thing to internalise

**The repo is not a complete description of the live system.** Tables, the `increment_points`
function and the trigger that creates a profile row on signup were all created in the Supabase
dashboard and never written back into a migration. You cannot stand up a fresh environment from this
repo today. Before running `supabase db push` against production, read
[Known gaps in the migrations](ARCHITECTURE.md#known-gaps-in-the-migrations).

There is also a live inconsistency to check on day one, in that section: the friendships RLS policies
reference `user_id` and `friend_id` while the app uses `requester_id` and `addressee_id`. If the
migration failed when it hit those statements, it rolled back, and **none** of the RLS policies exist
on any table. That is a data exposure question. Confirm it before anything else.

## What to pick up first

Roughly in the order they unblock the launch. First three are yours to own if you want them.

1. **Reconcile the database with the migrations.** Run the four verification queries in ARCHITECTURE
   and write what is actually there into a migration. Everything else is guesswork until this is done.
2. **Add Sentry.** `@sentry/react-native`. Right now a crash on a user's phone is invisible to us and
   support has nothing to work from.
3. **Move push notification sending server side**, into a database trigger or an edge function.
   Today the challenger's phone sends the notification, so a dropped connection after the insert
   means the opponent is never told and the challenge sits in `pending` forever.
4. **Alerting on settlement.** The function swallows per challenge errors, so a broken run looks
   exactly like a quiet one.
5. **A real support address** on the store listing. Apple checks the support URL.

Also on the backlog, not blocking launch: **Private Groups / Company Leagues**, roughly 750 lines and
three to four days. An admin creates a group with an invite code, members join by code or link,
challenges and the leaderboard scope to the group. There is one open decision inside it, whether
points are global or group only. It is the feature that makes DuelFit pitchable to companies for
World Cup engagement, so it has commercial weight rather than being a nice to have.

## How we work

- Feature branches, no direct pushes to `main`.
- If you create something in the Supabase dashboard, put the SQL in `supabase/migrations/` in the
  same commit. This is exactly how the drift above happened.
- Anything with a bearer token, key or password goes in `.env` or the Supabase environment. Never in
  the repo, never in chat, never in a ticket.
- No tests and no linter yet, so the pre commit checks are the manual list at the bottom of
  [CLAUDE.md](CLAUDE.md).

## Expo account

The Expo account `glabadanidis` is an **organisation**, converted from a personal account on
2026-09-09 so it could have members. `app.json` has `"owner": "glabadanidis"` and the EAS project id
is unchanged, so nothing in the code depends on that conversion. Simeon's personal Expo login is now
`@glabadanidis-2`, which matters only if he is signing in to Expo Go.

The Android upload keystore was generated on 2026-09-09 and is stored on EAS, not in the repo. EAS
manages it. Nobody needs a local copy and nobody should generate a second one.
