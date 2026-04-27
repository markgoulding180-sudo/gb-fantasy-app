// Netlify Function: Predictions (Get Fixtures & Submit Predictions)
// GET /.netlify/functions/predictions?gameweek=34
// POST /.netlify/functions/predictions

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

  // GET - Fetch fixtures for a gameweek
  if (event.httpMethod === 'GET') {
    try {
      const params = new URLSearchParams(event.queryStringParameters);
      const gameweek = params.get('gameweek') || '34';

      // Get matches for the gameweek
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('*')
        .eq('gameweek', gameweek)
        .order('kickoff_time', { ascending: true });

      if (matchesError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch matches' })
        };
      }

      // If user is authenticated, get their predictions too
      const authHeader = event.headers.authorization;
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          gameweek: parseInt(gameweek),
          matches: matches || [],
          predictions: userPredictions
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

  // POST - Submit predictions
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

      const { gameweek, predictions } = JSON.parse(event.body);

      if (!gameweek || !predictions || !Array.isArray(predictions)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Gameweek and predictions array are required' })
        };
      }

      // Validate and format predictions
      const predictionsToInsert = [];
      const matchIdsToCheck = [];
      
      for (const pred of predictions) {
        if (!pred.match_id || !pred.predicted_result || pred.home_score === undefined || pred.away_score === undefined) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Each prediction must include match_id, predicted_result, home_score, and away_score' })
          };
        }

        // Validate result is H, D, or A
        if (!['H', 'D', 'A'].includes(pred.predicted_result)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'predicted_result must be H, D, or A' })
          };
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
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to create match', details: createError?.message })
              };
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
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save predictions', details: error.message })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Predictions saved successfully',
          predictions: data
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
