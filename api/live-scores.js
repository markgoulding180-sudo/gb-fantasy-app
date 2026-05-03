// Vercel Function: Live scores update
// GET/POST /api/live-scores

const { createClient } = require('@supabase/supabase-js');

const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';
const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_GW_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Get current gameweek from FPL API directly (no settings table needed)
    const bootstrapResponse = await fetch(FPL_BOOTSTRAP_URL);
    const bootstrapData = await bootstrapResponse.json();
    
    const currentGWObj = bootstrapData.events?.find(e => e.is_current);
    const nextGWObj = bootstrapData.events?.find(e => e.is_next);
    const currentGW = currentGWObj?.id || nextGWObj?.id;

    if (!currentGW) {
      return res.status(200).json({ message: 'Could not determine current gameweek' });
    }

    console.log('Live scores - current gameweek:', currentGW);

    // Build FPL numeric team ID -> team name mapping
    const teams = bootstrapData.teams || [];
    const fplCodeToName = {};
    teams.forEach(t => {
      fplCodeToName[t.id] = t.name; // e.g. 3 -> "Arsenal"
    });

    // Fetch all fixtures for current GW
    const fixturesResponse = await fetch(`${FPL_FIXTURES_URL}?event=${currentGW}`);
    const fixtures = await fixturesResponse.json();

    const activeFixtures = fixtures.filter(f =>
      f.started || f.finished_provisional || f.finished
    );

    if (activeFixtures.length === 0) {
      return res.status(200).json({ 
        message: 'No active matches', 
        gameweek: currentGW 
      });
    }

    // Get all GW matches from our database
    const { data: dbMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('gameweek', currentGW);

    if (!dbMatches || dbMatches.length === 0) {
      return res.status(200).json({ 
        message: 'No matches found in database for GW' + currentGW,
        gameweek: currentGW
      });
    }

    const results = { updated: 0, finished: 0, live: [], errors: [], debug: {
      totalDbMatches: dbMatches.length,
      dbMatchTeams: dbMatches.map(m => `${m.home_team} vs ${m.away_team}`),
      activeFixtures: activeFixtures.length
    }};

    console.log(`Processing ${activeFixtures.length} active fixtures for GW${currentGW}`);
    console.log('DB matches:', dbMatches.map(m => `${m.home_team} vs ${m.away_team} (status: ${m.status})`));

    for (const fixture of activeFixtures) {
      const fplHomeName = fplCodeToName[fixture.team_h];
      const fplAwayName = fplCodeToName[fixture.team_a];

      if (!fplHomeName || !fplAwayName) {
        results.errors.push(`Could not find team names for fixture ${fixture.id}`);
        continue;
      }

      // Match by team name (case-insensitive, partial match for names like "Nott'm Forest")
      // Try exact match first, then partial
      let dbMatch = dbMatches.find(m => {
        const dbHome = m.home_team.toLowerCase().trim();
        const dbAway = m.away_team.toLowerCase().trim();
        const fplHome = fplHomeName.toLowerCase().trim();
        const fplAway = fplAwayName.toLowerCase().trim();
        
        // Exact match
        if (dbHome === fplHome && dbAway === fplAway) return true;
        
        // Contains match (for shortened names)
        const homeMatch = dbHome.includes(fplHome) || fplHome.includes(dbHome) ||
                         dbHome.replace(/[^a-z]/g, '').includes(fplHome.replace(/[^a-z]/g, '')) ||
                         fplHome.replace(/[^a-z]/g, '').includes(dbHome.replace(/[^a-z]/g, ''));
        const awayMatch = dbAway.includes(fplAway) || fplAway.includes(dbAway) ||
                         dbAway.replace(/[^a-z]/g, '').includes(fplAway.replace(/[^a-z]/g, '')) ||
                         fplAway.replace(/[^a-z]/g, '').includes(dbAway.replace(/[^a-z]/g, ''));
        return homeMatch && awayMatch;
      });

      if (!dbMatch) {
        results.errors.push(`No DB match found for ${fplHomeName} vs ${fplAwayName}`);
        continue;
      }

      const updateData = {
        status: fixture.finished ? 'finished' : (fixture.started ? 'live' : 'upcoming')
      };

      if (fixture.team_h_score !== null && fixture.team_a_score !== null) {
        updateData.home_score = fixture.team_h_score;
        updateData.away_score = fixture.team_a_score;
      }

      if (fixture.finished) {
        updateData.result = fixture.team_h_score > fixture.team_a_score ? 'H' :
                           fixture.team_a_score > fixture.team_h_score ? 'A' : 'D';
        results.finished++;
        console.log(`Match finished: ${fplHomeName} ${fixture.team_h_score}-${fixture.team_a_score} ${fplAwayName}`);
      } else if (fixture.started) {
        results.live.push({
          match_id: dbMatch.id,
          home_team: fplHomeName,
          away_team: fplAwayName,
          home: fixture.team_h_score ?? 0,
          away: fixture.team_a_score ?? 0,
          minute: fixture.minutes ?? 0
        });
        console.log(`Match live: ${fplHomeName} ${fixture.team_h_score}-${fixture.team_a_score} ${fplAwayName} (${fixture.minutes}')`);
      }

      const { error } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', dbMatch.id);

      if (!error) {
        results.updated++;
      } else {
        results.errors.push(`DB update error for ${fplHomeName} vs ${fplAwayName}: ${error.message}`);
      }
    }

    // Calculate points for finished matches
    if (results.finished > 0) {
      console.log(`Calculating points for ${results.finished} finished matches`);
      await calculatePointsForGameweek(supabase, currentGW);
    }

    return res.status(200).json({
      message: 'Live scores updated',
      gameweek: currentGW,
      results
    });

  } catch (error) {
    console.error('Live scores error:', error);
    return res.status(500).json({ 
      error: 'Failed to update live scores', 
      details: error.message 
    });
  }
};

async function calculatePointsForGameweek(supabase, gameweek) {
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished')
    .not('result', 'is', null);

  if (!matches || matches.length === 0) return;

  const usersToUpdate = new Set();

  for (const match of matches) {
    const { data: predictions } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_id', match.id);

    if (!predictions || predictions.length === 0) continue;

    for (const pred of predictions) {
      let points = 0;

      if (pred.predicted_result === match.result) {
        points += 10;
        if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
          points += 10;
        }
      }

      await supabase
        .from('predictions')
        .update({ points_earned: points })
        .eq('id', pred.id);

      usersToUpdate.add(pred.user_id);
    }
  }

  // Update user total points
  const { data: users } = await supabase.from('users').select('id');

  for (const user of users || []) {
    const { data: userPreds } = await supabase
      .from('predictions')
      .select('points_earned')
      .eq('user_id', user.id);

    const totalPoints = (userPreds || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correctScores = (userPreds || []).filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({
        total_points: totalPoints,
        correct_scores: correctScores,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
  }

  // Update tournament entry points
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, gameweek')
    .eq('gameweek', gameweek);

  if (tournaments && tournaments.length > 0) {
    for (const userId of usersToUpdate) {
      for (const tournament of tournaments) {
        const { data: entries } = await supabase
          .from('tournament_entries')
          .select('id')
          .eq('tournament_id', tournament.id)
          .eq('user_id', userId);

        if (!entries || entries.length === 0) continue;

        const { data: gameweekMatches } = await supabase
          .from('matches')
          .select('id')
          .eq('gameweek', tournament.gameweek);

        const gameweekMatchIds = new Set((gameweekMatches || []).map(m => m.id));

        const { data: predPoints } = await supabase
          .from('predictions')
          .select('points_earned, match_id')
          .eq('user_id', userId);

        const totalPoints = (predPoints || [])
          .filter(p => gameweekMatchIds.has(p.match_id))
          .reduce((sum, p) => sum + (p.points_earned || 0), 0);

        await supabase
          .from('tournament_entries')
          .update({ entry_points: totalPoints })
          .eq('tournament_id', tournament.id)
          .eq('user_id', userId);
      }
    }

    // Recalculate ranks
    for (const tournament of tournaments) {
      const { data: entries } = await supabase
        .from('tournament_entries')
        .select('id, entry_points')
        .eq('tournament_id', tournament.id)
        .order('entry_points', { ascending: false });

      if (entries) {
        for (let i = 0; i < entries.length; i++) {
          await supabase
            .from('tournament_entries')
            .update({ rank: i + 1 })
            .eq('id', entries[i].id);
        }
      }
    }
  }
}