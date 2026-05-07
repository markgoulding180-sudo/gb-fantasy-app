// Vercel Function: Get current gameweek (reads from Master Clock)
// GET /api/current-gameweek
// This is a convenience endpoint that reads from master_clock

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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Get master clock - this is the source of truth
    const { data: masterClock, error: clockError } = await supabase
      .from('master_clock')
      .select('*')
      .eq('id', 'current')
      .single();

    // Get FPL data for deadline info only
    let fplDeadline = null;
    let fplDeadlineEpoch = null;
    let fplCurrentGW = null;
    try {
      const response = await fetch(FPL_BOOTSTRAP_URL);
      const data = await response.json();
      const nextEvent = data.events.find(e => e.is_next);
      const currentEvent = data.events.find(e => e.is_current);
      if (nextEvent) {
        fplDeadline = nextEvent.deadline_time;
        fplDeadlineEpoch = nextEvent.deadline_time_epoch;
      }
      if (currentEvent) {
        fplCurrentGW = currentEvent.id;
      }
    } catch (e) {
      console.log('FPL API fetch failed');
    }

    // If master clock not set, return error with instructions
    if (!masterClock) {
      return res.status(200).json({
        error: 'Master clock not initialized',
        message: 'Admin must set current gameweek in Master Clock first',
        current_gameweek: null,
        next_gameweek: null,
        fpl_current_gameweek: fplCurrentGW,
        status: 'not_initialized'
      });
    }

    const result = {
      // Master Clock values (source of truth)
      current_gameweek: masterClock.current_gameweek,
      next_gameweek: masterClock.current_gameweek + 1,
      last_finalised_gameweek: masterClock.last_finalised_gameweek || 0,
      status: masterClock.status || 'active',
      
      // Deadline (from Master Clock, fallback to FPL)
      deadline: masterClock.deadline || fplDeadline,
      deadline_epoch: masterClock.deadline_epoch || fplDeadlineEpoch,
      
      // FPL reference (for info only)
      fpl_current_gameweek: fplCurrentGW,
      
      // Metadata
      master_clock_updated_at: masterClock.updated_at
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Current gameweek error:', error);
    return res.status(500).json({ error: 'Failed to fetch gameweek', details: error.message });
  }
};
