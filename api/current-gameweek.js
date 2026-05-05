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

    // Determine system gameweek (respecting manual override and finalisation state)
    const fplCurrentGW = currentEvent ? currentEvent.id : null;
    const systemCurrentGW = manualGW?.gameweek || fplCurrentGW;
    
    // If we've finalised past the FPL current, use the next gameweek after last finalised
    const effectiveCurrentGW = Math.max(systemCurrentGW || 0, lastFinalised.gameweek + 1);
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
};
