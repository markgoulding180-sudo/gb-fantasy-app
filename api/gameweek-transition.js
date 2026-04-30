// Vercel Function: Check and trigger gameweek transition
// GET /api/gameweek-transition
// Should be called every hour to check if current GW is finished

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
      return res.status(200).json({ message: 'No current gameweek' });
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

    return res.status(200).json(result);

  } catch (error) {
    console.error('Gameweek transition error:', error);
    return res.status(500).json({ error: 'Transition check failed', details: error.message });
  }
};

async function finaliseGameweek(supabase, gameweek) {
  // Get all finished matches for this gameweek
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished');

  if (!matches || matches.length === 0) return;

  // Get all users who made predictions this gameweek
  const { data: userPredictions } = await supabase
    .from('predictions')
    .select('user_id')
    .eq('gameweek', gameweek);

  // Get unique user IDs
  const userIds = [...new Set(userPredictions?.map(p => p.user_id) || [])];

  for (const userId of userIds) {
    let gwTotalPoints = 0;
    let gwCorrectResults = 0;
    let gwCorrectScores = 0;
    let gwTotalPredictions = 0;

    for (const match of matches) {
      // Get user's prediction for this match
      const { data: pred, error: predError } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .eq('match_id', match.id)
        .maybeSingle();

      if (pred) {
        // Calculate points
        let points = 0;
        if (pred.predicted_result === match.result) {
          points += 10;
          gwCorrectResults++;
          if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
            points += 10;
            gwCorrectScores++;
          }
        }
        gwTotalPoints += points;
        gwTotalPredictions++;

        // Save to permanent prediction_history
        await supabase
          .from('prediction_history')
          .upsert({
            user_id: userId,
            gameweek: gameweek,
            match_id: match.id,
            home_team: match.home_team,
            away_team: match.away_team,
            predicted_home_score: pred.home_score,
            predicted_away_score: pred.away_score,
            predicted_result: pred.predicted_result,
            actual_home_score: match.home_score,
            actual_away_score: match.away_score,
            actual_result: match.result,
            points_earned: points,
            finalised_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,gameweek,match_id'
          });

        // Update the prediction record
        await supabase
          .from('predictions')
          .update({ points_earned: points })
          .eq('id', pred.id);
      }
    }

    // Save gameweek summary for this user
    await supabase
      .from('gameweek_summary')
      .upsert({
        user_id: userId,
        gameweek: gameweek,
        total_predictions: gwTotalPredictions,
        correct_results: gwCorrectResults,
        correct_scores: gwCorrectScores,
        total_points: gwTotalPoints,
        finalised_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,gameweek'
      });
    
    // Update tournament entries for this user
    const { data: userTournaments } = await supabase
      .from('tournament_entries')
      .select('tournament_id, entry_points')
      .eq('user_id', userId);
    
    for (const entry of userTournaments || []) {
      // Check if this tournament is for the current gameweek
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('gameweek')
        .eq('id', entry.tournament_id)
        .single();
      
      if (tournament && tournament.gameweek === gameweek) {
        // Update entry_points with this gameweek's points
        await supabase
          .from('tournament_entries')
          .update({ entry_points: gwTotalPoints })
          .eq('tournament_id', entry.tournament_id)
          .eq('user_id', userId);
      }
    }
  }

  // Update all user totals (cumulative) from all finished gameweeks
  for (const userId of userIds) {
    const { data: allPredictions } = await supabase
      .from('predictions')
      .select('points_earned')
      .eq('user_id', userId)
      .not('points_earned', 'is', null);

    const total = (allPredictions || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correct = (allPredictions || []).filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({
        total_points: total,
        correct_scores: correct,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
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
