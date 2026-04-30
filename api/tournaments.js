// Netlify Function: Tournaments (List & Join)
// GET /.netlify/functions/tournaments - List all tournaments
// POST /.netlify/functions/tournaments - Join a tournament

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS headers
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

  // GET - List tournaments
  if (event.httpMethod === 'GET') {
    try {
      const params = new URLSearchParams(event.queryStringParameters);
      const status = params.get('status'); // live, upcoming, closed, finished
      const gameweek = params.get('gameweek');
      const myEntries = params.get('my_entries'); // 'true' to get current user's entries

      // If requesting user's tournament entries, require auth
      if (myEntries === 'true') {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Authentication required' })
          };
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Invalid or expired token' })
          };
        }

        // Get user's tournament entries with tournament details
        const { data: entries, error: entriesError } = await supabase
          .from('tournament_entries')
          .select(`
            id,
            entry_points,
            rank,
            joined_at,
            tournaments:tournament_id (*)
          `)
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false });

        if (entriesError) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch tournament entries', details: entriesError.message })
          };
        }

        // Format the response
        const formattedEntries = (entries || []).map(entry => {
          const t = entry.tournaments;
          const closesAt = new Date(t.closes_at);
          const now = new Date();
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
            entry_id: entry.id,
            entry_points: entry.entry_points || 0,
            rank: entry.rank,
            joined_at: entry.joined_at,
            tournament: {
              id: t.id,
              name: t.name,
              gameweek: t.gameweek,
              status: t.status,
              entry_fee: t.entry_fee,
              prize_pool: t.prize_pool,
              current_entries: t.current_entries,
              max_entries: t.max_entries,
              closes_at: t.closes_at,
              time_remaining: timeRemaining,
              is_full: t.max_entries && t.current_entries >= t.max_entries
            }
          };
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            entries: formattedEntries
          })
        };
      }

      // Regular tournament listing (no auth required)
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
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch tournaments', details: error.message })
        };
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          tournaments: formattedData
        })
      };

    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Internal server error', details: error.message })
      };
    }
  }

  // POST - Join a tournament
  if (event.httpMethod === 'POST') {
    try {
      const authHeader = event.headers.authorization;
      if (!authHeader) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
        };
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired token' })
        };
      }

      const { tournament_id } = JSON.parse(event.body);

      if (!tournament_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'tournament_id is required' })
        };
      }

      // Check if tournament exists and is open
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournament_id)
        .single();

      if (tournamentError || !tournament) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Tournament not found' })
        };
      }

      if (tournament.status !== 'live') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Tournament is not open for entries' })
        };
      }

      if (tournament.max_entries && tournament.current_entries >= tournament.max_entries) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Tournament is full' })
        };
      }

      // Check if user already entered
      const { data: existingEntry } = await supabase
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournament_id)
        .eq('user_id', user.id)
        .single();

      if (existingEntry) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: 'You have already entered this tournament' })
        };
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
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to enter tournament', details: entryError.message })
        };
      }

      // Update tournament entry count
      await supabase
        .from('tournaments')
        .update({ current_entries: tournament.current_entries + 1 })
        .eq('id', tournament_id);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: 'Successfully entered tournament',
          entry
        })
      };

    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Internal server error', details: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
