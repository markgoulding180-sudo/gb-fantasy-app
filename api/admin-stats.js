// Vercel Function: Admin stats
// GET /api/admin-stats

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

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

    return res.status(200).json({
      total_matches: totalMatches || 0,
      total_predictions: totalPredictions || 0,
      total_users: totalUsers || 0,
      total_tournaments: totalTournaments || 0,
      gameweek_breakdown: gwBreakdown
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
};
