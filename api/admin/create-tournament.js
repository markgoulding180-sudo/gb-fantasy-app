// Vercel Function: Admin - Create Tournament
// POST /api/admin/create-tournament

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

    const { name, entry_fee, prize_pool, gameweek, max_entries, closes_at } = req.body;

    if (!name || !gameweek) {
      return res.status(400).json({ error: 'name and gameweek are required' });
    }

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name,
        entry_fee: entry_fee || 0,
        prize_pool: prize_pool || 0,
        gameweek,
        max_entries: max_entries || 100,
        current_entries: 0,
        status: 'live',
        closes_at: closes_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Create tournament error:', error);
      return res.status(500).json({ error: 'Failed to create tournament', details: error.message });
    }

    return res.status(201).json({
      message: 'Tournament created successfully',
      tournament: data
    });

  } catch (error) {
    console.error('Create tournament error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};