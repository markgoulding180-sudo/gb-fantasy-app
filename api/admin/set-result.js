// Vercel Function: Admin - Manually set match result (for testing)
// POST /api/admin/set-result
// Body: { match_id, home_score, away_score }

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    const { match_id, home_score, away_score } = req.body;

    if (!match_id || home_score === undefined || away_score === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['match_id', 'home_score', 'away_score']
      });
    }

    // Get match details first
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return res.status(404).json({ error: 'Match not found', details: matchError });
    }

    // Calculate result
    const result = home_score > away_score ? 'H' : 
                   away_score > home_score ? 'A' : 'D';

    // Update match
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score,
        away_score,
        result,
        status: 'finished'
      })
      .eq('id', match_id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update match', details: updateError });
    }

    // Calculate points for predictions
    const { data: predictions } = await supabase
      .from('predictions')
      .select('*, users(username, display_name)')
      .eq('match_id', match_id);

    const results = [];

    for (const pred of predictions || []) {
      let points = 0;

      // Correct result = 10 points
      if (pred.predicted_result === result) {
        points += 10;

        // Exact score = additional 10 points
        if (pred.home_score === home_score && pred.away_score === away_score) {
          points += 10;
        }
      }

      // Apply joker
      const finalPoints = pred.joker_used ? points * 2 : points;

      // Update prediction
      await supabase
        .from('predictions')
        .update({ points_earned: finalPoints })
        .eq('id', pred.id);

      results.push({
        user: pred.users?.display_name || pred.users?.username || pred.user_id,
        prediction: `${pred.home_score}-${pred.away_score} (${pred.predicted_result})`,
        joker: pred.joker_used,
        base_points: points,
        final_points: finalPoints
      });

      // Update user totals
      const { data: userPreds } = await supabase
        .from('predictions')
        .select('points_earned')
        .eq('user_id', pred.user_id);

      const totalPoints = (userPreds || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
      const correctScores = (userPreds || []).filter(p => p.points_earned === 20).length;

      await supabase
        .from('users')
        .update({ 
          total_points: totalPoints,
          correct_scores: correctScores
        })
        .eq('id', pred.user_id);
    }

    return res.status(200).json({
      message: 'Match result set and points calculated',
      match: {
        home_team: match.home_team,
        away_team: match.away_team,
        score: `${home_score}-${away_score}`,
        result
      },
      predictions_processed: results.length,
      results
    });

  } catch (error) {
    console.error('Set result error:', error);
    return res.status(500).json({ error: 'Failed to set result', details: error.message });
  }
};
