# Working in this repo

DuelFit. React Native (Expo) plus Supabase. Read [ARCHITECTURE.md](ARCHITECTURE.md) before making
non trivial changes. This file is the conventions and the traps.

## Non negotiable

- **Never commit a secret.** `.env` is gitignored and has never been committed, keep it that way.
  The Supabase **service role key** must not appear anywhere in this repo, not in `.env`, not in a
  comment, not in a migration. It belongs only in the Supabase edge function environment.
- **Never remove the `.eq('status', 'accepted')` guard** on the settlement update in
  `supabase/functions/settle-challenges/index.ts`. It is the only thing preventing a double points
  award when two settlement runs overlap.
- **Results come only from the match feed.** Players cannot mark a winner, there is no screen for
  it and the `challenges_guard_client_update` trigger rejects it. Do not bring back a manual result
  screen, the owner explicitly removed it.
- **This is not a gambling app and must never read like one.** No odds, no stakes in money, no
  "bet". The word used in the product is challenge or duel. Apple will reject it otherwise and the
  whole positioning depends on it.
- **Do not hand edit `buildNumber` or `versionCode`.** `eas.json` sets
  `appVersionSource: "remote"`, EAS owns both. `versionCode` has been removed from `app.json`
  entirely for this reason. Do not put it back.

## Conventions

- **Plain JavaScript, not TypeScript.** `typescript` is in devDependencies and there is a
  `tsconfig.json`, but every source file is `.js`. Do not introduce `.tsx` files in passing.
- **Function components with hooks only.** No class components anywhere.
- **StyleSheet at the bottom of each file.** No styled-components, no Tailwind, no shared style
  module beyond `src/constants/colors.js`. Always use the palette, never a raw hex in a screen.
- **One directory per screen area** under `src/screens/`, with `index.js` as the main screen and
  siblings for related screens (`Challenges/index.js` and `Challenges/Detail.js`).
- **One Supabase client**, exported from `src/constants/supabase.js`. Never call `createClient`
  again anywhere else.
- **Dark theme only.** `userInterfaceStyle` is `dark` and the background is `#121212`. There is no
  light mode and adding one is not on the roadmap.
- **Portrait only, phone only.** `supportsTablet` is false.
- Emoji in UI strings is intentional and part of the visual language. Keep it.

## Traps that have bitten before

- **`EXPO_PUBLIC_` variables are inlined at bundle time.** Changing `.env` needs a full Metro
  restart, a hot reload silently keeps the old value.
- **Push notifications and `expo-device` do not work in a simulator.** Test on a real device or
  `registerForPushNotifications()` returns null and you will chase a bug that is not there.
- **`getExpoPushTokenAsync` needs the explicit `projectId`.** It is hardcoded in
  `notifications.js`. Removing it breaks push in production builds only, never in Expo Go, which is
  the worst possible failure mode. There is a whole commit about this.
- **`match_id` is TheSportsDB's event id and settlement depends on it.** Anything that creates a
  challenge must store the real event id, never a locally generated one, or that challenge can
  never settle.
- **F1 is a different shape from team sports** at every layer. TheSportsDB returns no
  `strHomeTeam`, the winner comes out of the `strResult` text, and the driver list is a hardcoded
  table. Any change to matches, picks or settlement needs the F1 path checked separately.
- **`WINDOW_DAYS` in `src/constants/api.js` is the visibility rule.** Nothing kicking off outside
  the next 7 days is shown, and a league with nothing inside the window is hidden entirely, as is a
  sport whose every league is hidden. Out of season that means the Basketball tab disappears on its
  own. The single exception is `ALWAYS_SHOW_LEAGUE_IDS`, which holds Formula 1 only: races are a
  fortnight apart so the next one always shows, and the tab goes only when the season ends. Do not
  add a league to that set without a reason as concrete as that one.
- **TheSportsDB returns `intRound` and `strSeason` as strings.** `intRound + 1` concatenates, so
  rounds 4, 5, 6 became `'4'`, `'41'`, `'42'` and every domestic league silently showed no fixtures
  at all. `getUpcomingMatches` coerces with `Number()`. There is a whole commit about this.
- **The free tier caps results per endpoint.** `eventsnextleague.php` returns a single fixture and
  `eventsround.php` returns five per round, which is why `getUpcomingMatches` merges the current
  and next two rounds and dedupes on `idEvent` rather than trusting one call.
- **Never call TheSportsDB concurrently, and never call axios against it directly.** Measured: 12
  sequential requests 350ms apart all succeed, 150ms apart fails from the tenth, and a single
  `Promise.all` over 12 leagues returns 429 for every one of them and keeps rejecting for about a
  minute. Worse, a 429 body is an HTML error page, so `res.data.events` reads as undefined and every
  league looks like it has no fixtures, which empties the whole home screen. All requests go through
  the serialised `fetchJson` queue in `src/constants/api.js`, which spaces them, retries once, and
  returns **`null` for a failed request as distinct from `[]` for no fixtures**. Keep that
  distinction alive in callers, otherwise the silent-empty-screen bug comes straight back.
- **League availability is cached in AsyncStorage** under `duelfit.availability.v1` with a 6 hour
  TTL, because probing every league costs one request each and about five seconds. A probe that
  fails everywhere keeps the previous answer instead of caching an empty one. Pull to refresh
  forces a recheck.
- **`increment_points` and the profile creation trigger are not in this repo.** Do not assume the
  database is only what `supabase/migrations/` describes. It is not.
- **`supabase.channel(name)` returns the existing channel if the name is taken.** Adding `.on()` to
  one that is already subscribed throws. Realtime channels get a unique name per mount and a
  `cancelled` flag for when the screen unmounts before `getUser()` resolves, as in Home and
  Challenges. Copy that pattern for any new subscription.
- **Do not run `supabase db push`.** The CLI's migration history does not match the live database.
  Apply a migration by pasting it into the Supabase SQL editor.
- **RLS policies for the same command combine with OR**, and a missing policy returns zero rows
  rather than an error. Tightening means dropping every policy for that command, not adding a
  stricter one next to it. A delete or update that "succeeds" but changes nothing is usually a
  missing policy. The live policy table is in ARCHITECTURE.md.
- **Challenges are open to anyone, friends are only listed first.** Do not add a friendship check to
  the challenges INSERT policy, that was tried and explicitly rejected.
- **`src/components/` holds only `MatchRow`**, the date and kick off block plus the two team rows,
  shared by Home and Step1Match. If you are about to copy a card into a third screen, extract it
  instead. That is how the two largest files got that big.

## Before you commit

There are no tests and no linter configured, so the checks are manual:

- Ran on a **physical device**, not just a simulator.
- Touched matches, picks or settlement? Checked **football and F1** separately.
- Touched anything auth related? Signed out and back in, and registered a fresh account.
- Added a Supabase object by hand in the dashboard? **Write the SQL into
  `supabase/migrations/` in the same commit.** This is how the repo drifted from the database in the
  first place.
- Changed an edge function? Deployed it. A merged function that is not deployed does nothing.

## Season maintenance

`F1_DRIVERS` in `src/constants/api.js` is the 2026 lineup and needs editing every season. League ids
occasionally change between seasons on TheSportsDB, and a wrong id fails silently as an empty
fixture list rather than an error.
