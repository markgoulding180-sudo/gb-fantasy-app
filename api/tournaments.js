// Vercel Function: Tournaments (List & Join)
// GET /api/tournaments - List all tournaments
// POST /api/tournaments - Join a tournament

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // GET - List tournaments
  if (req.method === 'GET') {
    try {
      const params = new URLSearchParams(req.query);
      const status = params.get('status'); // live, upcoming, closed, finished
      const gameweek = params.get('gameweek');

      let query = supabase
        .from('tournaments')
        .select('*')
        .order('closes_at', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      }

      if (gameweek) {
        query = query.eq('gameweek', gameweek);
      }

      const { data, error } = await query;

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch tournaments', details: error.message });
      }

      // Calculate time remaining for each tournament
      const now = new Date();
      const formattedData = (data || []).map(t => {
        const closesAt = new Date(t.closes_at);
        const diff = closesAt - now;
        let timeRemaining = null;

        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          if (days > 0) {
            timeRemaining = `${days} day${days > 1 ? 's' : ''}`;
          } else {
            timeRemaining = `${hours} hour${hours > 1 ? 's' : ''}`;
          }
        }

        return {
          ...t,
          time_remaining: timeRemaining,
          is_full: t.max_entries && t.current_entries >= t.max_entries
        };
      });

      return res.status(200).json({
        tournaments: formattedData
      });

    } catch (error) {
      console.error('Tournaments GET error:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // POST - Create or Join a tournament
  if (req.method === 'POST') {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const { action, tournament_id, name, entry_fee, prize_pool, gameweek, max_entries, closes_at } = req.body;

      // CREATE tournament (admin action)
      if (action === 'create') {
        if (!name || !gameweek) {
          return res.status(400).json({ error: 'name and gameweek are required' });
        }

        const { data, error } = await supabase
          .from('tournaments')
          .insert({
            name,
            entry_fee: entry_fee || 0,
            prize_pool: prize_pool || 0,
            top_prize: prize_pool || 0,
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
          return res.status(500).json({ 
            error: 'Failed to create tournament', 
            details: error.message,
            code: error.code,
            hint: error.hint
          });
        }

        return res.status(201).json({
          message: 'Tournament created successfully',
          tournament: data
        });
      }

      // JOIN tournament (user action)
      if (!tournament_id) {
        return res.status(400).json({ error: 'tournament_id is required' });
      }

      // Check if tournament exists and is open
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournament_id)
        .single();

      if (tournamentError || !tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (tournament.status !== 'live') {
        return res.status(400).json({ error: 'Tournament is not open for entries' });
      }

      if (tournament.max_entries && tournament.current_entries >= tournament.max_entries) {
        return res.status(400).json({ error: 'Tournament is full' });
      }

      // Check if user already entered
      const { data: existingEntry } = await supabase
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournament_id)
        .eq('user_id', user.id)
        .single();

      if (existingEntry) {
        return res.status(409).json({ error: 'You have already entered this tournament' });
      }

      // Create entry
      const { data: entry, error: entryError } = await supabase
        .from('tournament_entries')
        .insert({
          tournament_id,
          user_id: user.id,
          entry_points: 0
        })
        .select()
        .single();

      if (entryError) {
        return res.status(500).json({ error: 'Failed to enter tournament', details: entryError.message });
      }

      // Update tournament entry count
      await supabase
        .from('tournaments')
        .update({ current_entries: tournament.current_entries + 1 })
        .eq('id', tournament_id);

      return res.status(201).json({
        message: 'Successfully entered tournament',
        entry
      });

    } catch (error) {
      console.error('Tournaments POST error:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
