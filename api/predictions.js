// Vercel Function: Predictions (Get Fixtures & Submit Predictions)
// GET /api/predictions?gameweek=34
// POST /api/predictions

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

async function getCurrentGameweekInfo() {
  try {
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();
    const nextEvent = data.events.find(e => e.is_next);
    return {
      current: data.events.find(e => e.is_current)?.id,
      next: nextEvent?.id,
      deadline: nextEvent?.deadline_time,
      deadline_epoch: nextEvent?.deadline_time_epoch
    };
  } catch (error) {
    return null;
  }
}

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

  // GET - Fetch fixtures for a gameweek
  if (req.method === 'GET') {
    try {
      const params = new URLSearchParams(req.query);
      const gameweek = params.get('gameweek') || '34';

      // Get matches for the gameweek
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('*')
        .eq('gameweek', gameweek)
        .order('kickoff_time', { ascending: true });

      if (matchesError) {
        return res.status(500).json({ error: 'Failed to fetch matches' });
      }

      // If user is authenticated, get their predictions too
      const authHeader = req.headers.authorization;
      let userPredictions = [];

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);

        if (user) {
          const { data: predictions } = await supabase
            .from('predictions')
            .select('*')
            .eq('user_id', user.id)
            .eq('gameweek', gameweek);

          userPredictions = predictions || [];
        }
      }

      return res.status(200).json({
        gameweek: parseInt(gameweek),
        matches: matches || [],
        predictions: userPredictions
      });

    } catch (error) {
      console.error('Predictions GET error:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // POST - Submit predictions
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

      const { gameweek, predictions } = req.body;

      if (!gameweek || !predictions || !Array.isArray(predictions)) {
        return res.status(400).json({ error: 'Gameweek and predictions array are required' });
      }

      // Check deadline
      const gwInfo = await getCurrentGameweekInfo();
      if (gwInfo && gwInfo.deadline_epoch) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= gwInfo.deadline_epoch) {
          return res.status(403).json({ 
            error: 'Deadline passed', 
            message: 'The gameweek deadline has passed. Predictions are now locked.',
            deadline: gwInfo.deadline
          });
        }
      }

      // Validate and format predictions
      const predictionsToInsert = [];
      const matchIdsToCheck = [];
      
      for (const pred of predictions) {
        if (!pred.match_id || !pred.predicted_result || pred.home_score === undefined || pred.away_score === undefined) {
          return res.status(400).json({ error: 'Each prediction must include match_id, predicted_result, home_score, and away_score' });
        }

        // Validate result is H, D, or A
        if (!['H', 'D', 'A'].includes(pred.predicted_result)) {
          return res.status(400).json({ error: 'predicted_result must be H, D, or A' });
        }

        // Handle temporary match IDs (format: temp-gameweek-matchnum)
        let matchId = pred.match_id;
        if (typeof matchId === 'string' && matchId.startsWith('temp-')) {
          // Extract match number from temp ID
          const parts = matchId.split('-');
          const matchNum = parseInt(parts[2]) || 1;
          
          // Check if match exists, if not create it
          const { data: existingMatch } = await supabase
            .from('matches')
            .select('id')
            .eq('gameweek', gameweek)
            .order('kickoff_time', { ascending: true })
            .range(matchNum - 1, matchNum - 1)
            .single();
          
          if (existingMatch) {
            matchId = existingMatch.id;
          } else {
            // Create a placeholder match
            const { data: newMatch, error: createError } = await supabase
              .from('matches')
              .insert({
                gameweek: parseInt(gameweek),
                home_team: `Home Team ${matchNum}`,
                away_team: `Away Team ${matchNum}`,
                home_team_code: 'HOM',
                away_team_code: 'AWY',
                venue: 'TBD',
                kickoff_time: new Date(Date.now() + matchNum * 86400000).toISOString(),
                status: 'upcoming'
              })
              .select()
              .single();
            
            if (createError || !newMatch) {
              return res.status(500).json({ error: 'Failed to create match', details: createError?.message });
            }
            matchId = newMatch.id;
          }
        }

        predictionsToInsert.push({
          user_id: user.id,
          match_id: matchId,
          gameweek: parseInt(gameweek),
          predicted_result: pred.predicted_result,
          home_score: parseInt(pred.home_score),
          away_score: parseInt(pred.away_score)
        });
      }

      // Upsert predictions (insert or update if exists)
      const { data, error } = await supabase
        .from('predictions')
        .upsert(predictionsToInsert, {
          onConflict: 'user_id,match_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        return res.status(500).json({ error: 'Failed to save predictions', details: error.message });
      }

      return res.status(200).json({
        message: 'Predictions saved successfully',
        predictions: data
      });

    } catch (error) {
      console.error('Predictions POST error:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
