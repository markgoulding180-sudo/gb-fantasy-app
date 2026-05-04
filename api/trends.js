// Vercel Function: User Trends (Aggregate prediction data)
// GET /api/trends?gameweek=35

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    const params = new URLSearchParams(req.query);
    const gameweek = params.get('gameweek');

    if (!gameweek) {
      return res.status(400).json({ error: 'gameweek parameter required' });
    }

    // Get all matches for this gameweek
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .eq('gameweek', gameweek)
      .order('kickoff_time', { ascending: true });

    if (matchesError) {
      return res.status(500).json({ error: 'Failed to fetch matches', details: matchesError.message });
    }

    // Get all predictions for this gameweek
    const { data: predictions, error: predError } = await supabase
      .from('predictions')
      .select('*')
      .eq('gameweek', gameweek);

    if (predError) {
      return res.status(500).json({ error: 'Failed to fetch predictions', details: predError.message });
    }

    // Aggregate trends per match
    const trends = matches.map(match => {
      const matchPredictions = predictions.filter(p => p.match_id === match.id);
      const totalPredictions = matchPredictions.length;

      if (totalPredictions === 0) {
        return {
          match_id: match.id,
          home_team: match.home_team,
          away_team: match.away_team,
          total_predictions: 0,
          result_distribution: { H: 0, D: 0, A: 0 },
          most_common_result: null,
          score_distribution: [],
          most_common_score: null
        };
      }

      // Count result distribution (1X2)
      const resultCounts = { H: 0, D: 0, A: 0 };
      matchPredictions.forEach(p => {
        if (resultCounts[p.predicted_result] !== undefined) {
          resultCounts[p.predicted_result]++;
        }
      });

      // Calculate percentages
      const resultDistribution = {
        H: Math.round((resultCounts.H / totalPredictions) * 100),
        D: Math.round((resultCounts.D / totalPredictions) * 100),
        A: Math.round((resultCounts.A / totalPredictions) * 100)
      };

      // Find most common result
      const mostCommonResult = Object.entries(resultCounts)
        .sort((a, b) => b[1] - a[1])[0];

      // Count score distribution
      const scoreCounts = {};
      matchPredictions.forEach(p => {
        const scoreKey = `${p.home_score}-${p.away_score}`;
        scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;
      });

      // Convert to array and sort by frequency
      const scoreDistribution = Object.entries(scoreCounts)
        .map(([score, count]) => ({
          score,
          count,
          percentage: Math.round((count / totalPredictions) * 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 most common scores

      const mostCommonScore = scoreDistribution[0] || null;

      return {
        match_id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        kickoff_time: match.kickoff_time,
        total_predictions: totalPredictions,
        result_distribution: resultDistribution,
        most_common_result: mostCommonResult ? {
          result: mostCommonResult[0],
          count: mostCommonResult[1],
          percentage: resultDistribution[mostCommonResult[0]]
        } : null,
        score_distribution: scoreDistribution,
        most_common_score: mostCommonScore
      };
    });

    return res.status(200).json({
      gameweek: parseInt(gameweek),
      total_users: [...new Set(predictions.map(p => p.user_id))].length,
      trends
    });

  } catch (error) {
    console.error('Trends API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
