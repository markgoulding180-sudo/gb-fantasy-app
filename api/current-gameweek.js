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

  try {
    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Fetch from FPL API
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();

    const currentEvent = data.events.find(e => e.is_current);
    const nextEvent = data.events.find(e => e.is_next);

    // Check for manual override
    const { data: manualGWSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'manual_gameweek')
      .single();
    
    const manualGW = manualGWSetting?.value ? JSON.parse(manualGWSetting.value) : null;
    
    // Check for last finalised gameweek
    const { data: lastFinalisedSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'last_finalised_gameweek')
      .single();
    
    const lastFinalised = lastFinalisedSetting?.value ? JSON.parse(lastFinalisedSetting.value) : { gameweek: 0 };

    // Determine system gameweek
    // Priority: 1. Manual override, 2. Next gameweek after last finalised, 3. FPL API current
    const fplCurrentGW = currentEvent ? currentEvent.id : null;
    
    // If admin has set manual GW, use that
    // Otherwise, if we've finalised gameweeks, use next after last finalised
    // Otherwise fall back to FPL API
    let effectiveCurrentGW;
    if (manualGW?.gameweek) {
      effectiveCurrentGW = manualGW.gameweek;
    } else if (lastFinalised.gameweek > 0) {
      effectiveCurrentGW = lastFinalised.gameweek + 1;
    } else {
      effectiveCurrentGW = fplCurrentGW || 1;
    }
    
    const effectiveNextGW = effectiveCurrentGW + 1;

    const result = {
      // FPL API values (for reference)
      fpl_current_gameweek: fplCurrentGW,
      fpl_next_gameweek: nextEvent ? nextEvent.id : null,
      
      // System values (what the app actually uses)
      current_gameweek: effectiveCurrentGW,
      next_gameweek: effectiveNextGW,
      last_finalised_gameweek: lastFinalised.gameweek || 0,
      
      // Deadline from FPL (for the next gameweek)
      deadline: nextEvent ? nextEvent.deadline_time : null,
      deadline_epoch: nextEvent ? nextEvent.deadline_time_epoch : null,
      
      // FPL status
      finished: currentEvent ? currentEvent.finished : false,
      data_checked: currentEvent ? currentEvent.data_checked : false,
      
      // Override info
      manual_override: !!manualGW?.gameweek,
      manual_gameweek: manualGW?.gameweek || null
    };

    // Store in Supabase for other functions to use
    const { error: cacheError } = await supabase
      .from('settings')
      .upsert({ 
        key: 'current_gameweek', 
        value: JSON.stringify(result)
      }, { onConflict: 'key' });
    
    if (cacheError) {
      console.error('Error caching current_gameweek:', cacheError);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Current gameweek error:', error);
    return res.status(500).json({ error: 'Failed to fetch gameweek', details: error.message });
  }
};
