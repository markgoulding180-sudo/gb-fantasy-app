// Netlify Function: Sync fixtures from FPL API
// GET /.netlify/functions/sync-fixtures?gameweek=34
// This should be called by a scheduled job (Netlify scheduled functions or external cron)

const { createClient } = require('@supabase/supabase-js');

// FPL API endpoint
const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';
const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = new URLSearchParams(event.queryStringParameters);
    const gameweek = params.get('gameweek');

    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Fetch team data from FPL
    const teamsResponse = await fetch(FPL_BOOTSTRAP_URL);
    const bootstrapData = await teamsResponse.json();
    
    const teams = {};
    bootstrapData.teams.forEach(team => {
      teams[team.id] = {
        name: team.name,
        short_name: team.short_name
      };
    });

    // Fetch fixtures from FPL API
    const fixturesResponse = await fetch(FPL_FIXTURES_URL);
    const fixtures = await fixturesResponse.json();

    // Filter by gameweek if specified
    const gameweekFixtures = gameweek 
      ? fixtures.filter(f => f.event === parseInt(gameweek))
      : fixtures;

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const fixture of gameweekFixtures) {
      // Skip if teams not found
      if (!teams[fixture.team_h] || !teams[fixture.team_a]) continue;

      const matchData = {
        gameweek: fixture.event,
        home_team: teams[fixture.team_h].name,
        away_team: teams[fixture.team_a].name,
        home_team_code: teams[fixture.team_h].short_name,
        away_team_code: teams[fixture.team_a].short_name,
        kickoff_time: fixture.kickoff_time,
        status: mapFPLStatus(fixture.finished, fixture.started)
      };

      // Add scores if match is finished
      if (fixture.finished_provisional || fixture.finished) {
        matchData.home_score = fixture.team_h_score;
        matchData.away_score = fixture.team_a_score;
        matchData.result = calculateResult(fixture.team_h_score, fixture.team_a_score);
      }

      // Check if match already exists
      const { data: existingMatch } = await supabase
        .from('matches')
        .select('id')
        .eq('gameweek', fixture.event)
        .eq('home_team', teams[fixture.team_h].name)
        .eq('away_team', teams[fixture.team_a].name)
        .single();

      if (existingMatch) {
        // Update existing match
        const { error } = await supabase
          .from('matches')
          .update(matchData)
          .eq('id', existingMatch.id);

        if (error) {
          results.errors.push({ match: `${matchData.home_team} vs ${matchData.away_team}`, error: error.message });
        } else {
          results.updated++;
        }
      } else {
        // Create new match
        const { error } = await supabase
          .from('matches')
          .insert(matchData);

        if (error) {
          results.errors.push({ match: `${matchData.home_team} vs ${matchData.away_team}`, error: error.message });
        } else {
          results.created++;
        }
      }
    }

    // If any matches were updated with results, trigger scoring
    if (results.updated > 0) {
      await calculatePointsForGameweek(supabase, gameweek);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Fixtures synced successfully',
        gameweek: gameweek || 'all',
        results
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to sync fixtures', details: error.message })
    };
  }
};

function mapFPLStatus(finished, started) {
  if (finished) return 'finished';
  if (started) return 'live';
  return 'upcoming';
}

function calculateResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 'H';
  if (awayScore > homeScore) return 'A';
  return 'D';
}

async function calculatePointsForGameweek(supabase, gameweek) {
  // Get all finished matches for this gameweek
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished')
    .not('result', 'is', null);

  if (!matches || matches.length === 0) return;

  for (const match of matches) {
    // Get all predictions for this match
    const { data: predictions } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_id', match.id);

    if (!predictions) continue;

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

  for (const user of users) {
    const { data: userPreds } = await supabase
      .from('predictions')
      .select('points_earned, home_score, away_score')
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
