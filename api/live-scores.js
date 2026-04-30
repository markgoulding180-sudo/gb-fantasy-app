// Netlify Function: Live scores update - call every 60 seconds during matches
// GET /.netlify/functions/live-scores

const { createClient } = require('@supabase/supabase-js');

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

    // Fetch live fixtures from FPL
    const response = await fetch(FPL_FIXTURES_URL);
    const fixtures = await response.json();

    const liveFixtures = fixtures.filter(f => 
      f.event === currentGW && 
      (f.started || f.finished_provisional || f.finished)
    );

    if (liveFixtures.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No live matches', gameweek: currentGW })
      };
    }

    const results = {
      updated: 0,
      finished: 0,
      live: []
    };

    for (const fixture of liveFixtures) {
      // Find match in database
      const { data: match } = await supabase
        .from('matches')
        .select('id')
        .eq('gameweek', currentGW)
        .eq('home_team_code', fixture.team_h_code || '')
        .eq('away_team_code', fixture.team_a_code || '')
        .single();

      if (!match) continue;

      const updateData = {
        status: fixture.finished ? 'finished' : (fixture.started ? 'live' : 'upcoming')
      };

      // Update scores if available
      if (fixture.team_h_score !== null && fixture.team_a_score !== null) {
        updateData.home_score = fixture.team_h_score;
        updateData.away_score = fixture.team_a_score;
      }

      // Calculate result if finished
      if (fixture.finished) {
        updateData.result = fixture.team_h_score > fixture.team_a_score ? 'H' :
                           fixture.team_a_score > fixture.team_h_score ? 'A' : 'D';
        results.finished++;
      } else if (fixture.started) {
        results.live.push({
          match_id: match.id,
          home: fixture.team_h_score || 0,
          away: fixture.team_a_score || 0,
          minute: fixture.minutes || 0
        });
      }

      const { error } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', match.id);

      if (!error) {
        results.updated++;
      }
    }

    // Calculate points for any newly finished matches
    if (results.finished > 0) {
      await calculatePointsForGameweek(supabase, currentGW);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Live scores updated',
        gameweek: currentGW,
        results
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to update live scores', details: error.message })
    };
  }
};

async function calculatePointsForGameweek(supabase, gameweek) {
  // Get all finished matches for this gameweek that haven't been scored yet
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished')
    .not('result', 'is', null);

  if (!matches || matches.length === 0) return;

  for (const match of matches) {
    // Get predictions for this match that haven't been scored
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

        // Additional 10 points for correct score
        if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
          points += 10;
        }
      }

      // Update prediction with points
      await supabase
        .from('predictions')
        .update({ points_earned: points })
        .eq('id', pred.id);
    }
  }

  // Update user totals
  const { data: users } = await supabase
    .from('users')
    .select('id');

  for (const user of users || []) {
    const { data: userPreds } = await supabase
      .from('predictions')
      .select('points_earned')
      .eq('user_id', user.id);

    const totalPoints = userPreds.reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correctScores = userPreds.filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({ 
        total_points: totalPoints,
        correct_scores: correctScores,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
  }

  // Update tournament entries for this gameweek
  await updateTournamentEntries(supabase, gameweek);
}

async function updateTournamentEntries(supabase, gameweek) {
  // Get all tournaments for this gameweek
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('gameweek', gameweek);

  for (const tournament of tournaments || []) {
    // Get all entries for this tournament
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select('*')
      .eq('tournament_id', tournament.id);

    for (const entry of entries || []) {
      // Calculate total points for this user in this gameweek
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
