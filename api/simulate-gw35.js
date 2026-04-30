// Vercel Function: Simulate GW35 match results for testing
// GET /api/simulate-gw35
// This sets fake results for all GW35 matches and calculates points

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow in development/testing
  const isDev = process.env.NODE_ENV !== 'production' || req.query.force === 'true';
  if (!isDev) {
    return res.status(403).json({ error: 'Simulation only allowed in development' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Fake results for GW35 matches
    const fakeResults = [
      { home: 'Arsenal', away: 'Bournemouth', home_score: 2, away_score: 0, result: 'H' },
      { home: 'Aston Villa', away: 'Chelsea', home_score: 1, away_score: 1, result: 'D' },
      { home: 'Brentford', away: 'Crystal Palace', home_score: 0, away_score: 2, result: 'A' },
      { home: 'Brighton', away: 'Everton', home_score: 3, away_score: 1, result: 'H' },
      { home: 'Burnley', away: 'Fulham', home_score: 1, away_score: 2, result: 'A' },
      { home: 'Liverpool', away: 'Leeds', home_score: 4, away_score: 0, result: 'H' },
      { home: 'Man City', away: 'West Ham', home_score: 2, away_score: 1, result: 'H' },
      { home: 'Man United', away: 'Newcastle', home_score: 0, away_score: 1, result: 'A' },
      { home: 'Spurs', away: 'Nottingham Forest', home_score: 2, away_score: 2, result: 'D' },
      { home: 'Wolves', away: 'Sunderland', home_score: 1, away_score: 0, result: 'H' }
    ];

    const results = {
      matches_updated: 0,
      predictions_scored: 0,
      users_updated: 0,
      errors: []
    };

    // Update each match with fake results
    for (const fake of fakeResults) {
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('id')
        .eq('gameweek', 35)
        .ilike('home_team', fake.home)
        .single();

      if (matchError || !match) {
        results.errors.push(`Match not found: ${fake.home} vs ${fake.away}`);
        continue;
      }

      // Update match with result
      const { error: updateError } = await supabase
        .from('matches')
        .update({
          home_score: fake.home_score,
          away_score: fake.away_score,
          result: fake.result,
          status: 'finished'
        })
        .eq('id', match.id);

      if (updateError) {
        results.errors.push(`Failed to update ${fake.home} vs ${fake.away}: ${updateError.message}`);
        continue;
      }

      results.matches_updated++;

      // Get all predictions for this match
      const { data: predictions } = await supabase
        .from('predictions')
        .select('*')
        .eq('match_id', match.id);

      // Score each prediction
      for (const pred of predictions || []) {
        let points = 0;

        if (pred.predicted_result === fake.result) {
          points += 10;
          if (pred.home_score === fake.home_score && pred.away_score === fake.away_score) {
            points += 10;
          }
        }

        // Update prediction with points
        await supabase
          .from('predictions')
          .update({ points_earned: points })
          .eq('id', pred.id);

        results.predictions_scored++;
      }
    }

    // Update user totals
    const { data: users } = await supabase.from('users').select('id');

    for (const user of users || []) {
      const { data: userPreds } = await supabase
        .from('predictions')
        .select('points_earned')
        .eq('user_id', user.id);

      const totalPoints = (userPreds || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
      const correctScores = (userPreds || []).filter(p => p.points_earned === 20).length;

      await supabase
        .from('users')
        .update({ total_points: totalPoints, correct_scores: correctScores })
        .eq('id', user.id);

      results.users_updated++;
    }

    // Update tournament entries
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('*')
      .eq('gameweek', 35);

    for (const tournament of tournaments || []) {
      // Get all entries sorted by points
      const { data: entries } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('entry_points', { ascending: false });

      // Update rankings
      for (let i = 0; i < (entries || []).length; i++) {
        await supabase
          .from('tournament_entries')
          .update({ rank: i + 1 })
          .eq('id', entries[i].id);
      }
    }

    return res.status(200).json({
      message: 'GW35 simulation complete',
      results
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return res.status(500).json({ error: 'Simulation failed', details: error.message });
  }
};
