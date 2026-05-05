// Vercel Function: Get current gameweek and deadline info from FPL
// GET /api/current-gameweek

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET
  );

  try {
    // FIRST: Try to get gameweek from our database (set by admin finalisation)
    const { data: setting, error: settingError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'current_gameweek')
      .single();

    if (!settingError && setting?.value) {
      const storedGW = JSON.parse(setting.value);
      // If we have a stored gameweek, use it (allows manual override of FPL)
      if (storedGW.next_gameweek) {
        console.log('Using stored gameweek from database:', storedGW);
        return res.status(200).json(storedGW);
      }
    }

    // FALLBACK: Fetch from FPL API if no stored gameweek
    const response = await fetch(FPL_BOOTSTRAP_URL);
    
    if (!response.ok) {
      throw new Error(`FPL API returned ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    if (!text || text.trim() === '') {
      throw new Error('FPL API returned empty response');
    }
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse FPL response:', text.substring(0, 200));
      throw new Error('Invalid JSON from FPL API');
    }

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

    // Store in Supabase for caching
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
    
    // LAST RESORT: Try to return cached gameweek even if FPL failed
    try {
      const { data: cached } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'current_gameweek')
        .single();
      
      if (cached?.value) {
        console.log('Returning cached gameweek after FPL error');
        return res.status(200).json(JSON.parse(cached.value));
      }
    } catch (e) {
      // No cache available
    }
    
    return res.status(500).json({ error: 'Failed to fetch gameweek', details: error.message });
  }
};
