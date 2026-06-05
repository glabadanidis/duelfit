import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SPORTS_DB = 'https://www.thesportsdb.com/api/v1/json/3';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
  );

  // Fetch all accepted challenges whose match date has passed
  const today = new Date().toISOString().split('T')[0];
  const { data: challenges, error } = await supabase
    .from('challenges')
    .select('id, match_id, match_home_team, match_away_team, challenger_id, opponent_id, challenger_pick, opponent_pick')
    .eq('status', 'accepted')
    .lte('match_date', today);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!challenges || challenges.length === 0) return new Response(JSON.stringify({ settled: 0 }));

  let settled = 0;

  for (const challenge of challenges) {
    try {
      const res = await fetch(`${SPORTS_DB}/lookupevent.php?id=${challenge.match_id}`);
      const data = await res.json();
      const event = data?.events?.[0];

      // Skip if result not yet available
      if (!event) continue;

      const isF1 = !event.strHomeTeam && event.strResult;

      let actualResult: string;

      if (isF1) {
        // F1: strResult contains finishing order, first driver listed is the winner
        // Format is typically "1. Verstappen, 2. Norris, ..." or just the winner name
        const resultText = event.strResult || '';
        const firstLine = resultText.split('\n')[0].replace(/^1\.\s*/, '').trim();
        if (!firstLine) continue;
        actualResult = firstLine;
      } else {
        if (event.intHomeScore === null || event.intAwayScore === null || event.intHomeScore === '') continue;
        const homeScore = parseInt(event.intHomeScore);
        const awayScore = parseInt(event.intAwayScore);
        if (homeScore > awayScore) actualResult = challenge.match_home_team;
        else if (awayScore > homeScore) actualResult = challenge.match_away_team;
        else actualResult = 'Draw';
      }

      const challengerWon = challenge.challenger_pick === actualResult;
      const opponentWon = challenge.opponent_pick === actualResult;

      let winner_id: string | null = null;
      if (challengerWon && !opponentWon) winner_id = challenge.challenger_id;
      else if (opponentWon && !challengerWon) winner_id = challenge.opponent_id;
      // both picked same result (both right or both wrong) → winner_id stays null (draw)

      const { data: updated } = await supabase
        .from('challenges')
        .update({ status: 'completed', winner_id, result: actualResult })
        .eq('id', challenge.id)
        .eq('status', 'accepted')
        .select('id')
        .single();

      // Only award points if we were the one to complete it (prevents double-award race)
      if (updated && winner_id) {
        await supabase.rpc('increment_points', { user_id: winner_id, amount: 10 });
      }

      settled++;
    } catch (_) {
      // Skip this challenge and continue with the rest
    }
  }

  return new Response(JSON.stringify({ settled }), { headers: { 'Content-Type': 'application/json' } });
});
