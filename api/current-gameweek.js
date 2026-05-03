// Vercel Function: Get current gameweek from FPL API
// GET /api/current-gameweek

import { createClient } from '@supabase/supabase-js';

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    return res.status(200).json(result);

  } catch (error) {
    console.error('Current gameweek error:', error);
    return res.status(500).json({ error: 'Failed to fetch gameweek', details: error.message });
  }
}
