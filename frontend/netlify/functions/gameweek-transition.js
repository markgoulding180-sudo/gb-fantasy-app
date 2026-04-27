// Netlify Function: Check and trigger gameweek transition
// GET /.netlify/functions/gameweek-transition
// Should be called every hour to check if current GW is finished

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Get current gameweek info from FPL
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();

    const currentEvent = data.events.find(e => e.is_current);
    const nextEvent = data.events.find(e => e.is_next);

    if (!currentEvent) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No current gameweek' })
      };
    }

    // Check if all matches in current GW are finished
    const fixturesResponse = await fetch(FPL_FIXTURES_URL);
    const fixtures = await fixturesResponse.json();

    const currentGWFixtures = fixtures.filter(f => f.event === currentEvent.id);
    const allFinished = currentGWFixtures.length > 0 && currentGWFixtures.every(f => f.finished);

    const result = {
      current_gameweek: currentEvent.id,
      next_gameweek: nextEvent?.id,
      all_matches_finished: allFinished,
      data_checked: currentEvent.data_checked,
      actions: []
    };

    // If all finished and data is checked, finalise the gameweek
    if (allFinished && currentEvent.data_checked) {
      // Finalise points
      await finaliseGameweek(supabase, currentEvent.id);
      result.actions.push('finalised_points');

      // Update tournament entries with final rankings
      await updateTournamentRankings(supabase, currentEvent.id);
      result.actions.push('updated_tournament_rankings');

      // Mark gameweek as processed
      await supabase
        .from('settings')
        .upsert({
          key: 'last_finalised_gameweek',
          value: JSON.stringify({ gameweek: currentEvent.id, finalised_at: new Date().toISOString() }),
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      result.actions.push('marked_as_finalised');
    }

    // Update current gameweek in settings
    await supabase
      .from('settings')
      .upsert({
        key: 'current_gameweek',
        value: JSON.stringify({
          current_gameweek: currentEvent.id,
          next_gameweek: nextEvent?.id,
          deadline: nextEvent?.deadline_time,
          deadline_epoch: nextEvent?.deadline_time_epoch,
          finished: currentEvent.finished,
          data_checked: currentEvent.data_checked,
          updated_at: new Date().toISOString()
        }),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    result.actions.push('updated_settings');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Transition check failed', details: error.message })
    };
  }
};

async function finaliseGameweek(supabase, gameweek) {
  // Ensure all predictions are scored
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished');

  for (const match of matches || []) {
    const { data: predictions } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_id', match.id);

    for (const pred of predictions || []) {
      let points = 0;

      if (pred.predicted_result === match.result) {
        points += 10;
        if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
          points += 10;
        }
      }

      await supabase
        .from('predictions')
        .update({ points_earned: points })
        .eq('id', pred.id);
    }
  }

  // Update all user totals
  const { data: users } = await supabase
    .from('users')
    .select('id');

  for (const user of users || []) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('points_earned')
      .eq('user_id', user.id);

    const total = preds.reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correct = preds.filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({
        total_points: total,
        correct_scores: correct,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
  }
}

async function updateTournamentRankings(supabase, gameweek) {
  // Get tournaments for this gameweek
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('gameweek', gameweek);

  for (const tournament of tournaments || []) {
    // Get all entries sorted by points
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select('*, users:user_id(*)')
      .eq('tournament_id', tournament.id)
      .order('entry_points', { ascending: false });

    // Update rankings
    for (let i = 0; i < (entries || []).length; i++) {
      const rank = i + 1;
      let prize = 0;

      // Simple prize distribution (customise as needed)
      if (rank === 1) prize = tournament.top_prize;
      else if (rank === 2) prize = Math.floor(tournament.top_prize * 0.5);
      else if (rank === 3) prize = Math.floor(tournament.top_prize * 0.25);

      await supabase
        .from('tournament_entries')
        .update({ rank, prize_won: prize })
        .eq('id', entries[i].id);
    }

    // Mark tournament as finished
    await supabase
      .from('tournaments')
      .update({ status: 'finished' })
      .eq('id', tournament.id);
  }
}
