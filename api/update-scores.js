// Simple FPL API fetcher - just gets data and stores it
// GET /api/update-scores

const { createClient } = require('@supabase/supabase-js');

const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Get current gameweek from settings
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
        body: JSON.stringify({ message: 'No current gameweek set' })
      };
    }

    // Fetch ALL fixtures from FPL API
    const response = await fetch(FPL_FIXTURES_URL);
    const fixtures = await response.json();

    // Filter to current gameweek only
    const gwFixtures = fixtures.filter(f => f.event === currentGW);

    if (gwFixtures.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No fixtures for GW ' + currentGW })
      };
    }

    let updated = 0;
    let live = 0;
    let finished = 0;

    // Process each fixture
    for (const fixture of gwFixtures) {
      // Determine status - use multiple signals
      let status = 'upcoming';
      const now = new Date();
      const kickoff = new Date(fixture.kickoff_time);
      const minutesSinceKickoff = (now - kickoff) / (1000 * 60);
      
      // FPL API flags
      const isFinished = fixture.finished === true;
      const isProvisional = fixture.finished_provisional === true;
      const isStarted = fixture.started === true;
      
      // Time-based fallback: only if FPL says started AND > 150 mins passed (2.5 hrs allows for delays)
      const timeBasedFinished = isStarted && !isFinished && !isProvisional && minutesSinceKickoff > 150;
      
      if (isFinished || isProvisional || timeBasedFinished) {
        status = 'finished';
        finished++;
      } else if (isStarted) {
        status = 'live';
        live++;
      }

      // Build update object
      const updateData = {
        status: status,
        home_score: fixture.team_h_score ?? null,
        away_score: fixture.team_a_score ?? null,
        updated_at: new Date().toISOString()
      };

      // Calculate result if finished
      if (status === 'finished' && fixture.team_h_score !== null && fixture.team_a_score !== null) {
        updateData.result = fixture.team_h_score > fixture.team_a_score ? 'H' :
                           fixture.team_a_score > fixture.team_h_score ? 'A' : 'D';
      }

      // Update match in database
      const { error } = await supabase
        .from('matches')
        .update(updateData)
        .eq('gameweek', currentGW)
        .eq('home_team_code', fixture.team_h_code || '')
        .eq('away_team_code', fixture.team_a_code || '');

      if (!error) {
        updated++;
      }
    }

    // Debug: log what we found
    const debugInfo = gwFixtures.slice(0, 3).map(f => ({
      home: f.team_h_code,
      away: f.team_a_code,
      started: f.started,
      finished: f.finished,
      finished_provisional: f.finished_provisional,
      h_score: f.team_h_score,
      a_score: f.team_a_score,
      kickoff: f.kickoff_time
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Scores updated',
        gameweek: currentGW,
        updated,
        live,
        finished,
        totalFixtures: gwFixtures.length,
        debug: debugInfo
      })
    };

  } catch (error) {
    console.error('Update scores error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
