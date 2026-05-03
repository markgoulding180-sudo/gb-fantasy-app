// Calculate points for finished matches
// GET /api/calculate-points

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Get current gameweek
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'current_gameweek')
      .single();

    const currentGW = setting ? JSON.parse(setting.value).current_gameweek : null;

    if (!currentGW) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No current gameweek set' })
      };
    }

    // Get finished matches that have results but predictions haven't been scored
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('gameweek', currentGW)
      .eq('status', 'finished')
      .not('result', 'is', null);

    if (!matches || matches.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No finished matches to score', gameweek: currentGW })
      };
    }

    let predictionsScored = 0;
    let pointsAwarded = 0;

    // Score each match
    for (const match of matches) {
      // Get predictions for this match with 0 points (not yet scored)
      const { data: predictions } = await supabase
        .from('predictions')
        .select('*')
        .eq('match_id', match.id)
        .eq('points_earned', 0);

      if (!predictions || predictions.length === 0) continue;

      for (const pred of predictions) {
        let points = 0;

        // 10 points for correct result
        if (pred.predicted_result === match.result) {
          points += 10;

          // +10 for exact score
          if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
            points += 10;
          }
        }

        // Update prediction with points
        await supabase
          .from('predictions')
          .update({ points_earned: points })
          .eq('id', pred.id);

        predictionsScored++;
        pointsAwarded += points;
      }
    }

    // Update user totals if any predictions were scored
    if (predictionsScored > 0) {
      await updateUserTotals(supabase);
      await updateTournamentEntries(supabase, currentGW);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Points calculated',
        gameweek: currentGW,
        matchesProcessed: matches.length,
        predictionsScored,
        pointsAwarded
      })
    };

  } catch (error) {
    console.error('Calculate points error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function updateUserTotals(supabase) {
  // Get all users
  const { data: users } = await supabase.from('users').select('id');

  for (const user of users || []) {
    // Sum all points for this user
    const { data: preds } = await supabase
      .from('predictions')
      .select('points_earned')
      .eq('user_id', user.id);

    const totalPoints = preds.reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correctScores = preds.filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({ 
        total_points: totalPoints,
        correct_scores: correctScores,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
  }
}

async function updateTournamentEntries(supabase, gameweek) {
  // Get tournaments for this gameweek
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('gameweek', gameweek);

  for (const tournament of tournaments || []) {
    // Get entries
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select('*')
      .eq('tournament_id', tournament.id);

    for (const entry of entries || []) {
      // Sum points for this user in this gameweek
      const { data: userPreds } = await supabase
        .from('predictions')
        .select('points_earned')
        .eq('user_id', entry.user_id)
        .eq('gameweek', gameweek);

      const entryPoints = userPreds.reduce((sum, p) => sum + (p.points_earned || 0), 0);

      await supabase
        .from('tournament_entries')
        .update({ entry_points: entryPoints })
        .eq('id', entry.id);
    }
  }
}
