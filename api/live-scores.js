// Vercel Function: Live scores update - call every 60 seconds during matches
// GET /api/live-scores

const { createClient } = require('@supabase/supabase-js');

const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

export default async function handler(req, res) {
  // Set CORS headers
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

    // Get current gameweek
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'current_gameweek')
      .single();

    const currentGW = setting ? JSON.parse(setting.value).current_gameweek : null;

    if (!currentGW) {
      return res.status(200).json({ message: 'No current gameweek set' });
    }

    // Fetch live fixtures from FPL
    const response = await fetch(FPL_FIXTURES_URL);
    const fixtures = await response.json();

    const liveFixtures = fixtures.filter(f => 
      f.event === currentGW && 
      (f.started || f.finished_provisional || f.finished)
    );

    if (liveFixtures.length === 0) {
      return res.status(200).json({ message: 'No live matches', gameweek: currentGW });
    }

    const results = {
      updated: 0,
      finished: 0,
      live: []
    };

    const now = new Date();

    for (const fixture of liveFixtures) {
      // Find match in database
      const { data: match } = await supabase
        .from('matches')
        .select('id, kickoff_time')
        .eq('gameweek', currentGW)
        .eq('home_team_code', fixture.team_h_code || '')
        .eq('away_team_code', fixture.team_a_code || '')
        .single();

      if (!match) continue;

      // Determine if match is finished using multiple signals
      // 1. FPL API says finished (can be delayed)
      // 2. FPL API says finished_provisional
      // 3. Time-based: if match started > 105 minutes ago, it's finished
      let isFinished = fixture.finished || fixture.finished_provisional;
      
      if (!isFinished && fixture.started && match.kickoff_time) {
        const kickoff = new Date(match.kickoff_time);
        const minutesSinceKickoff = (now - kickoff) / (1000 * 60);
        // Match is 90 mins + halftime (~15) + stoppage (~5) = ~110 mins max
        // Use 105 minutes as threshold
        if (minutesSinceKickoff >= 105) {
          isFinished = true;
          console.log(`Time-based finish detected for match ${match.id} (${minutesSinceKickoff.toFixed(0)} mins since kickoff)`);
        }
      }

      const updateData = {
        status: isFinished ? 'finished' : (fixture.started ? 'live' : 'upcoming')
      };

      // Update scores if available
      if (fixture.team_h_score !== null && fixture.team_a_score !== null) {
        updateData.home_score = fixture.team_h_score;
        updateData.away_score = fixture.team_a_score;
      }

      // Calculate result if finished
      if (isFinished) {
        updateData.result = fixture.team_h_score > fixture.team_a_score ? 'H' :
                           fixture.team_a_score > fixture.team_h_score ? 'A' : 'D';
        results.finished++;
      } else if (fixture.started) {
        results.live.push({
          match_id: match.id,
          home: fixture.team_h_score || 0,
          away: fixture.team_a_score || 0,
          minute: fixture.minutes || 0,
          home_team: match.home_team,
          away_team: match.away_team
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

    return res.status(200).json({
      message: 'Live scores updated',
      gameweek: currentGW,
      results
    });

  } catch (error) {
    console.error('Live scores error:', error);
    return res.status(500).json({ error: 'Failed to update live scores', details: error.message });
  }
}

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
}
