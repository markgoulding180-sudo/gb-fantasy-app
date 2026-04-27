// Netlify Function: Get current gameweek and deadline info from FPL
// GET /.netlify/functions/current-gameweek

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

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
    // Fetch from FPL API
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();

    const currentEvent = data.events.find(e => e.is_current);
    const nextEvent = data.events.find(e => e.is_next);

    const result = {
      current_gameweek: currentEvent ? currentEvent.id : null,
      next_gameweek: nextEvent ? nextEvent.id : null,
      deadline: nextEvent ? nextEvent.deadline_time : null,
      deadline_epoch: nextEvent ? nextEvent.deadline_time_epoch : null,
      finished: currentEvent ? currentEvent.finished : false,
      data_checked: currentEvent ? currentEvent.data_checked : false
    };

    // Store in Supabase for other functions to use
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    await supabase
      .from('settings')
      .upsert({ 
        key: 'current_gameweek', 
        value: JSON.stringify(result),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch gameweek', details: error.message })
    };
  }
};
