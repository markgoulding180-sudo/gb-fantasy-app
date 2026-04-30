// Netlify Function: Admin stats and actions
// GET /.netlify/functions/admin-stats - Get stats
// POST /.netlify/functions/admin-stats - Admin actions (set-score, recalculate-tournament-points, etc.)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // GET - Return stats
  if (event.httpMethod === 'GET') {
    try {
      const params = new URLSearchParams(event.queryStringParameters);
      const action = params.get('action');
      const gameweek = params.get('gameweek');

      // Get matches for score entry
      if (action === 'matches' && gameweek) {
        const { data: matches, error } = await supabase
          .from('matches')
          .select('*')
          .eq('gameweek', parseInt(gameweek))
          .order('kickoff_time', { ascending: true });

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ matches: matches || [] })
        };
      }

      // Get counts
      const [{ count: totalMatches }, { count: totalPredictions }, { count: totalUsers }, { count: totalTournaments }] = await Promise.all([
        supabase.from('matches').select('*', { count: 'exact', head: true }),
        supabase.from('predictions').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('tournaments').select('*', { count: 'exact', head: true })
      ]);

      // Get gameweek breakdown
      const { data: matchesByGW } = await supabase
        .from('matches')
        .select('gameweek, status')
        .order('gameweek');

      const gwBreakdown = {};
      matchesByGW?.forEach(m => {
        if (!gwBreakdown[m.gameweek]) {
          gwBreakdown[m.gameweek] = { total: 0, finished: 0, live: 0, upcoming: 0 };
        }
        gwBreakdown[m.gameweek].total++;
        gwBreakdown[m.gameweek][m.status]++;
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          matches: totalMatches || 0,
          predictions: totalPredictions || 0,
          users: totalUsers || 0,
          tournaments: totalTournaments || 0,
          gameweek_breakdown: gwBreakdown
        })
      };

    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to get stats', details: error.message })
      };
    }
  }

  // POST - Handle admin actions
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { action } = body;

      // Set match score and calculate points
      if (action === 'set-score') {
        const { match_id, home_score, away_score, result, status } = body;

        if (!match_id || home_score === undefined || away_score === undefined) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing required fields' })
          };
        }

        // Update match
        const { data: match, error: matchError } = await supabase
          .from('matches')
          .update({
            home_score: parseInt(home_score),
            away_score: parseInt(away_score),
            result: result,
            status: status || 'finished'
          })
          .eq('id', match_id)
          .select()
          .single();

        if (matchError) throw matchError;

        // Calculate points for all predictions on this match
        const { data: predictions } = await supabase
          .from('predictions')
          .select('*')
          .eq('match_id', match_id);

        let predictionsUpdated = 0;

        for (const pred of predictions || []) {
          let points = 0;

          // 10 points for correct result
          if (pred.predicted_result === result) {
            points += 10;

            // Additional 10 points for correct score
            if (pred.home_score === parseInt(home_score) && pred.away_score === parseInt(away_score)) {
              points += 10;
            }
          }

          // Update prediction
          await supabase
            .from('predictions')
            .update({ points_earned: points })
            .eq('id', pred.id);

          predictionsUpdated++;
        }

        // Update user totals
        const { data: users } = await supabase.from('users').select('id');
        let usersUpdated = 0;

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

          usersUpdated++;
        }

        // Update tournament entries for this gameweek
        await updateTournamentEntries(supabase, match.gameweek);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Score saved and points calculated',
            match: match,
            predictions_updated: predictionsUpdated,
            users_updated: usersUpdated
          })
        };
      }

      // Recalculate all tournament points
      if (action === 'recalculate-tournament-points') {
        const { data: tournaments } = await supabase
          .from('tournaments')
          .select('*');

        let tournamentsProcessed = 0;
        let entriesUpdated = 0;

        for (const tournament of tournaments || []) {
          const { data: entries } = await supabase
            .from('tournament_entries')
            .select('*')
            .eq('tournament_id', tournament.id);

          for (const entry of entries || []) {
            // Calculate points from predictions for this gameweek
            const { data: userPreds } = await supabase
              .from('predictions')
              .select('points_earned')
              .eq('user_id', entry.user_id)
              .eq('gameweek', tournament.gameweek);

            const entryPoints = userPreds.reduce((sum, p) => sum + (p.points_earned || 0), 0);

            await supabase
              .from('tournament_entries')
              .update({ entry_points: entryPoints })
              .eq('id', entry.id);

            entriesUpdated++;
          }

          tournamentsProcessed++;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            results: {
              tournaments_processed: tournamentsProcessed,
              entries_updated: entriesUpdated
            }
          })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unknown action' })
      };

    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Action failed', details: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};

// Helper function to update tournament entries
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
}
