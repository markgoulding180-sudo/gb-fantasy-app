// Return live scores for display
// GET /api/live-scores

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    // Get current gameweek
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'current_gameweek')
      .single();

    const currentGW = setting ? JSON.parse(setting.value).current_gameweek : null;

    if (!currentGW) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          gameweek: null,
          live: [],
          finished: [],
          upcoming: []
        })
      };
    }

    // Get all matches for current gameweek
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('gameweek', currentGW)
      .order('kickoff_time', { ascending: true });

    if (!matches) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          gameweek: currentGW,
          live: [],
          finished: [],
          upcoming: []
        })
      };
    }

    // Categorize matches
    const live = [];
    const finished = [];
    const upcoming = [];

    for (const match of matches) {
      const matchData = {
        id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        home_score: match.home_score ?? 0,
        away_score: match.away_score ?? 0,
        status: match.status,
        kickoff_time: match.kickoff_time
      };

      if (match.status === 'live') {
        live.push(matchData);
      } else if (match.status === 'finished') {
        finished.push(matchData);
      } else {
        upcoming.push(matchData);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        gameweek: currentGW,
        live,
        finished,
        upcoming,
        lastUpdated: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Live scores error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
