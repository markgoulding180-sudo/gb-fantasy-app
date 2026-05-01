// Vercel Function: Live scores update - call every 60 seconds during matches
// GET /api/live-scores

const { createClient } = require('@supabase/supabase-js');

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

    return res.status(200).json({
      message: 'Live scores updated',
      gameweek: currentGW,
      results
    });

  } catch (error) {
    console.error('Live scores error:', error);
    return res.status(500).json({ error: 'Failed to update live scores', details: error.message });
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

  // Track which users need their tournament entries updated
  const usersToUpdate = new Set();

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
      
      // Track user for tournament entry update
      usersToUpdate.add(pred.user_id);
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
  
  // Update tournament entries for affected users
  // Get all tournaments for this gameweek
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('gameweek', gameweek);
  
  if (tournaments && tournaments.length > 0) {
    for (const userId of usersToUpdate) {
      for (const tournament of tournaments) {
        // Calculate points for this user in this tournament
        const { data: entries } = await supabase
          .from('tournament_entries')
          .select('id')
          .eq('tournament_id', tournament.id)
          .eq('user_id', userId);
        
        if (!entries || entries.length === 0) continue;
        
        // Get ALL predictions for this user in this tournament's gameweek
        // Must join through matches to get the gameweek
        const { data: tournamentData } = await supabase
          .from('tournaments')
          .select('gameweek')
          .eq('id', tournament.id)
          .single();
        
        const tournamentGameweek = tournamentData?.gameweek || gameweek;
        
        // Get predictions for matches in this tournament's gameweek
        const { data: predPoints } = await supabase
          .from('predictions')
          .select('points_earned, match_id')
          .eq('user_id', userId);
        
        // Filter to only include predictions for matches in this tournament's gameweek
        const { data: gameweekMatches } = await supabase
          .from('matches')
          .select('id')
          .eq('gameweek', tournamentGameweek);
        
        const gameweekMatchIds = new Set((gameweekMatches || []).map(m => m.id));
        
        const totalPoints = (predPoints || [])
          .filter(p => gameweekMatchIds.has(p.match_id))
          .reduce((sum, p) => sum + (p.points_earned || 0), 0);
        
        // Update the tournament entry with the FULL recalculated total
        await supabase
          .from('tournament_entries')
          .update({ entry_points: totalPoints })
          .eq('tournament_id', tournament.id)
          .eq('user_id', userId);
      }
    }
    
    // Recalculate ranks for all tournaments
    for (const tournament of tournaments) {
      const { data: entries } = await supabase
        .from('tournament_entries')
        .select('id, entry_points')
        .eq('tournament_id', tournament.id)
        .order('entry_points', { ascending: false });
      
      if (entries) {
        for (let i = 0; i < entries.length; i++) {
          await supabase
            .from('tournament_entries')
            .update({ rank: i + 1 })
            .eq('id', entries[i].id);
        }
      }
    }
  }
}
