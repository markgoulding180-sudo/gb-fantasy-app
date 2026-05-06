// Vercel Function: Check and trigger gameweek transition
// GET /api/gameweek-transition
// Should be called every hour to check if current GW is finished

const { createClient } = require('@supabase/supabase-js');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

    // Get current gameweek info from FPL
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();

    const currentEvent = data.events.find(e => e.is_current);
    const nextEvent = data.events.find(e => e.is_next);

    if (!currentEvent) {
      return res.status(200).json({ message: 'No current gameweek' });
    }

    // Check for manual override in settings
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

    // Determine which gameweek to use as "current" for the system
    // Priority: manual override > FPL API current
    const systemCurrentGW = manualGW?.gameweek || currentEvent.id;
    const isManual = !!manualGW?.gameweek;

    // Check if all matches in current GW are finished (from FPL API)
    const fixturesResponse = await fetch(FPL_FIXTURES_URL);
    const fixtures = await fixturesResponse.json();

    const currentGWFixtures = fixtures.filter(f => f.event === currentEvent.id);
    const allFinished = currentGWFixtures.length > 0 && currentGWFixtures.every(f => f.finished);

    // Check if manual finalisation is requested
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isManualFinalise = url.searchParams.get('manual') === 'true';

    const result = {
      fpl_current_gameweek: currentEvent.id,
      fpl_next_gameweek: nextEvent?.id,
      system_current_gameweek: systemCurrentGW,
      last_finalised_gameweek: lastFinalised.gameweek,
      all_matches_finished: allFinished,
      data_checked: currentEvent.data_checked,
      is_manual_override: isManual,
      is_manual_finalise: isManualFinalise,
      actions: []
    };

    // Determine which gameweek to finalise
    let gameweekToFinalise = null;
    
    if (isManualFinalise) {
      // Manual finalisation: finalise the system current gameweek
      gameweekToFinalise = systemCurrentGW;
      result.actions.push('manual_finalise_requested');
    } else if (allFinished && currentEvent.data_checked) {
      // Auto finalisation based on FPL API
      gameweekToFinalise = currentEvent.id;
      result.actions.push('auto_finalise_triggered');
    }

    // Only finalise if we have a target and it hasn't been finalised yet
    if (gameweekToFinalise && gameweekToFinalise > lastFinalised.gameweek) {
      // Finalise points
      await finaliseGameweek(supabase, gameweekToFinalise);
      result.actions.push('finalised_points');

      // Update tournament entries with final rankings
      await updateTournamentRankings(supabase, gameweekToFinalise);
      result.actions.push('updated_tournament_rankings');

      // Mark gameweek as processed - try update first, then insert
      const { error: updateError } = await supabase
        .from('settings')
        .update({
          value: JSON.stringify({ gameweek: gameweekToFinalise, finalised_at: new Date().toISOString() })
        })
        .eq('key', 'last_finalised_gameweek');
      
      if (updateError || updateError?.message?.includes('0 rows')) {
        // Insert if update didn't find the row
        const { error: insertError } = await supabase
          .from('settings')
          .insert({
            key: 'last_finalised_gameweek',
            value: JSON.stringify({ gameweek: gameweekToFinalise, finalised_at: new Date().toISOString() })
          });
        
        if (insertError) {
          console.error('Error inserting last_finalised_gameweek:', insertError);
          result.actions.push('finalise_save_error: ' + insertError.message);
        } else {
          result.actions.push('marked_as_finalised');
        }
      } else if (updateError) {
        console.error('Error updating last_finalised_gameweek:', updateError);
        result.actions.push('finalise_save_error: ' + updateError.message);
      } else {
        result.actions.push('marked_as_finalised');
      }
      result.finalised_gameweek = gameweekToFinalise;
      
      // Calculate new current gameweek (next one after finalising)
      const newCurrentGW = gameweekToFinalise + 1;
      result.new_current_gameweek = newCurrentGW;
      
      // Update manual override to the new gameweek if we were in manual mode
      if (isManual || isManualFinalise) {
        const { error: manualError } = await supabase
          .from('settings')
          .upsert({
            key: 'manual_gameweek',
            value: JSON.stringify({ gameweek: newCurrentGW, set_at: new Date().toISOString() })
          }, { onConflict: 'key' });
        
        if (manualError) {
          console.error('Error saving manual_gameweek:', manualError);
          result.actions.push('manual_gw_save_error: ' + manualError.message);
        } else {
          result.actions.push('updated_manual_gw');
        }
      }
    } else if (gameweekToFinalise) {
      result.actions.push('already_finalised');
      result.message = `GW${gameweekToFinalise} already finalised`;
    }

    // Update current gameweek in settings
    const nextGW = Math.max(systemCurrentGW, (result.new_current_gameweek || systemCurrentGW));
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({
        key: 'current_gameweek',
        value: JSON.stringify({
          current_gameweek: nextGW,
          next_gameweek: nextGW + 1,
          fpl_current_gameweek: currentEvent.id,
          fpl_next_gameweek: nextEvent?.id,
          deadline: nextEvent?.deadline_time,
          deadline_epoch: nextEvent?.deadline_time_epoch,
          finished: currentEvent.finished,
          data_checked: currentEvent.data_checked,
          manual_override: isManual
        })
      }, { onConflict: 'key' });
    
    if (settingsError) {
      console.error('Error updating current_gameweek setting:', settingsError);
      result.actions.push('settings_save_error: ' + settingsError.message);
    }

    result.actions.push('updated_settings');

    return res.status(200).json(result);

  } catch (error) {
    console.error('Gameweek transition error:', error);
    return res.status(500).json({ error: 'Transition check failed', details: error.message });
  }
};

async function finaliseGameweek(supabase, gameweek) {
  // Get all finished matches for this gameweek
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'finished');

  if (!matches || matches.length === 0) return;

  // Get all users who made predictions this gameweek
  const { data: userPredictions } = await supabase
    .from('predictions')
    .select('user_id')
    .eq('gameweek', gameweek);

  // Get unique user IDs
  const userIds = [...new Set(userPredictions?.map(p => p.user_id) || [])];

  for (const userId of userIds) {
    let gwTotalPoints = 0;
    let gwCorrectResults = 0;
    let gwCorrectScores = 0;
    let gwTotalPredictions = 0;

    for (const match of matches) {
      // Get user's prediction for this match
      const { data: pred, error: predError } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .eq('match_id', match.id)
        .maybeSingle();

      if (pred) {
        // Calculate points
        let points = 0;
        if (pred.predicted_result === match.result) {
          points += 10;
          gwCorrectResults++;
          if (pred.home_score === match.home_score && pred.away_score === match.away_score) {
            points += 10;
            gwCorrectScores++;
          }
        }
        gwTotalPoints += points;
        gwTotalPredictions++;

        // Save to permanent prediction_history
        await supabase
          .from('prediction_history')
          .upsert({
            user_id: userId,
            gameweek: gameweek,
            match_id: match.id,
            home_team: match.home_team,
            away_team: match.away_team,
            predicted_home_score: pred.home_score,
            predicted_away_score: pred.away_score,
            predicted_result: pred.predicted_result,
            actual_home_score: match.home_score,
            actual_away_score: match.away_score,
            actual_result: match.result,
            points_earned: points,
            finalised_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,gameweek,match_id'
          });

        // Update the prediction record
        await supabase
          .from('predictions')
          .update({ points_earned: points })
          .eq('id', pred.id);
      }
    }

    // Save gameweek summary for this user
    await supabase
      .from('gameweek_summary')
      .upsert({
        user_id: userId,
        gameweek: gameweek,
        total_predictions: gwTotalPredictions,
        correct_results: gwCorrectResults,
        correct_scores: gwCorrectScores,
        total_points: gwTotalPoints,
        finalised_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,gameweek'
      });
    
    // Update tournament entries for this user
    const { data: userTournaments } = await supabase
      .from('tournament_entries')
      .select('tournament_id, entry_points')
      .eq('user_id', userId);
    
    for (const entry of userTournaments || []) {
      // Check if this tournament includes the current gameweek
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('gameweek, end_gameweek')
        .eq('id', entry.tournament_id)
        .single();
      
      if (tournament) {
        const startGW = tournament.gameweek;
        const endGW = tournament.end_gameweek || startGW;
        
        // Check if current gameweek is within tournament range
        if (gameweek >= startGW && gameweek <= endGW) {
          // For multi-week tournaments, accumulate points
          // Get all gameweek summaries for this user within tournament range
          const { data: gwSummaries } = await supabase
            .from('gameweek_summary')
            .select('total_points')
            .eq('user_id', userId)
            .gte('gameweek', startGW)
            .lte('gameweek', endGW);
          
          const totalTournamentPoints = (gwSummaries || [])
            .reduce((sum, s) => sum + (s.total_points || 0), 0);
          
          // Update entry_points with accumulated total
          await supabase
            .from('tournament_entries')
            .update({ entry_points: totalTournamentPoints })
            .eq('tournament_id', entry.tournament_id)
            .eq('user_id', userId);
        }
      }
    }
  }

  // Update all user totals (cumulative) from prediction_history
  for (const userId of userIds) {
    const { data: historyPredictions } = await supabase
      .from('prediction_history')
      .select('points_earned')
      .eq('user_id', userId);

    const total = (historyPredictions || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
    const correct = (historyPredictions || []).filter(p => p.points_earned === 20).length;

    await supabase
      .from('users')
      .update({
        total_points: total,
        correct_scores: correct,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
  }

  // Clear predictions for this gameweek (they're now in prediction_history)
  // This prevents users from modifying past predictions and prepares for next GW
  const { error: deleteError } = await supabase
    .from('predictions')
    .delete()
    .eq('gameweek', gameweek);
  
  if (deleteError) {
    console.error(`Error clearing predictions for GW${gameweek}:`, deleteError);
  } else {
    console.log(`Cleared predictions for GW${gameweek}`);
  }
}

async function updateTournamentRankings(supabase, gameweek) {
  // Get tournaments that include this gameweek in their range
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .lte('gameweek', gameweek)
    .gte('end_gameweek', gameweek);

  for (const tournament of tournaments || []) {
    // Get all entries sorted by points
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select('*, users:user_id(*)')
      .eq('tournament_id', tournament.id)
      .order('entry_points', { ascending: false });

    // Update rankings
    for (let i = 0; i < (entries || []).length; i++) {
      const rank = i + 1;
      let prize = 0;

      // Simple prize distribution (customise as needed)
      if (rank === 1) prize = tournament.top_prize;
      else if (rank === 2) prize = Math.floor(tournament.top_prize * 0.5);
      else if (rank === 3) prize = Math.floor(tournament.top_prize * 0.25);

      await supabase
        .from('tournament_entries')
        .update({ rank, prize_won: prize })
        .eq('id', entries[i].id);
    }

    // Only mark tournament as finished when the current gameweek matches end_gameweek
    const tournamentEndGW = tournament.end_gameweek || tournament.gameweek;
    
    if (gameweek >= tournamentEndGW) {
      // All gameweeks complete — mark tournament as finished
      await supabase
        .from('tournaments')
        .update({ status: 'finished' })
        .eq('id', tournament.id);
    }
    // If gameweek < end_gameweek, tournament stays live and keeps accumulating points
  }
}
