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
  
  // Cache control - prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Missing environment variables: SUPABASE_URL or SUPABASE_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Create clients - admin for auth verification and POST operations
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET
  );
  
  // Use admin client for POST operations
  const dbClient = req.method === 'POST' ? supabaseAdmin : supabase;

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
        console.error('Database error fetching matches:', matchesError);
        return res.status(500).json({ error: 'Failed to fetch matches', details: matchesError.message });
      }

      // If user is authenticated, get their predictions too
      const authHeader = req.headers.authorization;
      let userPredictions = [];

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
          const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
          
          if (userError) {
            console.error('Auth error getting user:', userError);
          } else if (user) {
            const { data: predictions, error: predError } = await supabase
              .from('predictions')
              .select('*')
              .eq('user_id', user.id)
              .eq('gameweek', gameweek);
            
            if (predError) {
              console.error('Database error fetching predictions:', predError);
            } else {
              userPredictions = predictions || [];
            }
          }
        } catch (authErr) {
          console.error('Exception getting user from token:', authErr);
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
      console.log('POST /api/predictions - Starting request processing');
      
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.error('No authorization header provided');
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.replace('Bearer ', '');
      console.log('Token received, length:', token.length);
      
      // Verify the JWT token and get user
      let user;
      try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        
        if (userError) {
          console.error('Auth error - getUser failed:', userError);
          return res.status(401).json({ error: 'Invalid or expired token', details: userError.message });
        }
        
        if (!userData.user) {
          console.error('No user returned from auth');
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        
        user = userData.user;
        console.log('User authenticated:', user.id);
      } catch (authErr) {
        console.error('Exception during auth verification:', authErr);
        return res.status(401).json({ error: 'Authentication failed', details: authErr.message });
      }

      const { gameweek, predictions } = req.body;
      console.log('Request body:', { gameweek, predictionsCount: predictions?.length });

      if (!gameweek || !predictions || !Array.isArray(predictions)) {
        console.error('Invalid request body:', { gameweek, predictions });
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
      
      for (let i = 0; i < predictions.length; i++) {
        const pred = predictions[i];
        console.log(`Processing prediction ${i}:`, pred);
        
        if (!pred.match_id) {
          console.error(`Prediction ${i} missing match_id`);
          return res.status(400).json({ error: `Prediction ${i} missing match_id` });
        }
        
        // Only require predicted_result - scores are optional for validation
        if (!pred.predicted_result) {
          console.error(`Prediction ${i} missing predicted_result`);
          return res.status(400).json({ error: `Prediction ${i} missing result (1, X, or 2)` });
        }

        // Validate result is H, D, or A
        if (!['H', 'D', 'A'].includes(pred.predicted_result)) {
          console.error(`Prediction ${i} invalid result:`, pred.predicted_result);
          return res.status(400).json({ error: `Prediction ${i}: result must be H, D, or A` });
        }
        
        // Scores can be any value - no validation against result
        // User can predict home win (H) with score 0-1 if they want
        const homeScore = pred.home_score !== undefined ? parseInt(pred.home_score) : 0;
        const awayScore = pred.away_score !== undefined ? parseInt(pred.away_score) : 0;

        // Handle temporary match IDs (format: temp-gameweek-matchnum)
        let matchId = pred.match_id;
        if (typeof matchId === 'string' && matchId.startsWith('temp-')) {
          // Extract match number from temp ID
          const parts = matchId.split('-');
          const matchNum = parseInt(parts[2]) || 1;
          
          // Check if match exists, if not create it
          const { data: existingMatch, error: findError } = await supabase
            .from('matches')
            .select('id')
            .eq('gameweek', gameweek)
            .order('kickoff_time', { ascending: true })
            .range(matchNum - 1, matchNum - 1)
            .single();
          
          if (findError) {
            console.error(`Error finding match for temp ID ${matchId}:`, findError);
          }
          
          if (existingMatch) {
            matchId = existingMatch.id;
            console.log(`Resolved temp ID to match:`, matchId);
          } else {
            // Create a placeholder match
            console.log(`Creating placeholder match for temp ID:`, matchId);
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
              console.error('Failed to create match:', createError);
              return res.status(500).json({ error: 'Failed to create match', details: createError?.message });
            }
            matchId = newMatch.id;
            console.log(`Created match with ID:`, matchId);
          }
        }

        predictionsToInsert.push({
          user_id: user.id,
          match_id: matchId,
          gameweek: parseInt(gameweek),
          predicted_result: pred.predicted_result,
          home_score: homeScore,
          away_score: awayScore
        });
      }

      console.log('Inserting predictions:', predictionsToInsert);

      // Upsert predictions (insert or update if exists)
      const { data, error } = await supabase
        .from('predictions')
        .upsert(predictionsToInsert, {
          onConflict: 'user_id,match_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error('Database error inserting predictions:', error);
        return res.status(500).json({ error: 'Failed to save predictions', details: error.message });
      }

      console.log('Predictions saved successfully:', data);

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