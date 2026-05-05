// Vercel Function: Admin stats
// GET /api/admin-stats?action=stats|matches&gameweek=X
// POST /api/admin-stats (action: set-score)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // GET requests - handle different actions
    if (req.method === 'GET') {
      const { action, gameweek } = req.query;

      // Get matches for a gameweek
      if (action === 'matches' && gameweek) {
        const { data: matches, error } = await supabase
          .from('matches')
          .select('id, home_team, away_team, home_score, away_score, status, kickoff_time')
          .eq('gameweek', parseInt(gameweek))
          .order('kickoff_time');

        if (error) throw error;

        return res.status(200).json({ matches: matches || [] });
      }

      // Default stats action
      const [{ count: totalMatches }, { count: totalPredictions }, { count: totalUsers }, { count: totalTournaments }] = await Promise.all([
        supabase.from('matches').select('*', { count: 'exact', head: true }),
        supabase.from('predictions').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('tournaments').select('*', { count: 'exact', head: true })
      ]);

      const { data: matchesByGW } = await supabase
        .from('matches')
        .select('gameweek, status')
        .order('gameweek');

      const gwBreakdown = {};
      matchesByGW?.forEach(m => {
        if (!gwBreakdown[m.gameweek]) {
          gwBreakdown[m.gameweek] = { total: 0, finished: 0, live: 0, upcoming: 0 };
        }
        gwBreakdown[m.gameweek].total++;
        gwBreakdown[m.gameweek][m.status]++;
      });

      // Get last finalised gameweek
      const { data: lastFinalisedSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'last_finalised_gameweek')
        .single();
      
      const lastFinalised = lastFinalisedSetting?.value ? JSON.parse(lastFinalisedSetting.value) : { gameweek: 0 };

      return res.status(200).json({
        total_matches: totalMatches || 0,
        total_predictions: totalPredictions || 0,
        total_users: totalUsers || 0,
        total_tournaments: totalTournaments || 0,
        last_finalised_gameweek: lastFinalised.gameweek || 0,
        gameweek_breakdown: gwBreakdown
      });
    }

    // POST requests - handle set-score action
    if (req.method === 'POST') {
      const { action, match_id, home_score, away_score, result, status } = req.body;

      if (action === 'set-score') {
        if (!match_id || home_score === undefined || away_score === undefined) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Update match
        const { error: matchError } = await supabase
          .from('matches')
          .update({
            home_score,
            away_score,
            result,
            status
          })
          .eq('id', match_id);

        if (matchError) throw matchError;

        // If match is finished, calculate points
        let predictionsUpdated = 0;
        let usersUpdated = 0;

        if (status === 'finished') {
          // Get predictions for this match
          const { data: predictions } = await supabase
            .from('predictions')
            .select('*')
            .eq('match_id', match_id);

          const userIds = new Set();

          for (const pred of predictions || []) {
            let points = 0;

            // Correct result = 10 points
            if (pred.predicted_result === result) {
              points += 10;

              // Exact score = +10 points
              if (pred.home_score === home_score && pred.away_score === away_score) {
                points += 10;
              }
            }

            // Apply joker
            const finalPoints = pred.joker_used ? points * 2 : points;

            // Update prediction
            await supabase
              .from('predictions')
              .update({ points_earned: finalPoints })
              .eq('id', pred.id);

            predictionsUpdated++;
            userIds.add(pred.user_id);
          }

          // Update user totals
          for (const userId of userIds) {
            const { data: userPreds } = await supabase
              .from('predictions')
              .select('points_earned, gameweek')
              .eq('user_id', userId);

            const totalPoints = (userPreds || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);
            const correctScores = (userPreds || []).filter(p => p.points_earned === 20).length;

            // Update users table
            await supabase
              .from('users')
              .update({
                total_points: totalPoints,
                correct_scores: correctScores,
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            // Update tournament_entries - need to get gameweek for each tournament
            const { data: entries } = await supabase
              .from('tournament_entries')
              .select('id, tournament_id, entry_points')
              .eq('user_id', userId);

            for (const entry of entries || []) {
              // Get the tournament's gameweek
              const { data: tournament } = await supabase
                .from('tournaments')
                .select('gameweek')
                .eq('id', entry.tournament_id)
                .single();

              const tournamentGameweek = tournament?.gameweek;

              // Get predictions for this user in this tournament's gameweek only
              const { data: tournamentPreds } = await supabase
                .from('predictions')
                .select('points_earned')
                .eq('user_id', userId)
                .eq('gameweek', tournamentGameweek);

              const entryTotal = (tournamentPreds || []).reduce((sum, p) => sum + (p.points_earned || 0), 0);

              await supabase
                .from('tournament_entries')
                .update({
                  entry_points: entryTotal,
                  updated_at: new Date().toISOString()
                })
                .eq('id', entry.id);
            }

            usersUpdated++;
          }
        }

        return res.status(200).json({
          message: 'Score updated successfully',
          match_id,
          predictions_updated: predictionsUpdated,
          users_updated: usersUpdated
        });
      }

      // Set manual gameweek override
      if (action === 'set-manual-gw') {
        const { gameweek } = req.body;
        
        if (!gameweek || gameweek < 1 || gameweek > 38) {
          return res.status(400).json({ error: 'Invalid gameweek. Must be between 1 and 38.' });
        }
        
        const { error } = await supabase
          .from('settings')
          .upsert({
            key: 'manual_gameweek',
            value: JSON.stringify({ gameweek, set_at: new Date().toISOString() }),
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        
        if (error) throw error;
        
        return res.status(200).json({
          message: 'Manual gameweek set',
          gameweek
        });
      }
      
      // Clear manual gameweek override
      if (action === 'clear-manual-gw') {
        const { error } = await supabase
          .from('settings')
          .delete()
          .eq('key', 'manual_gameweek');
        
        if (error) throw error;
        
        return res.status(200).json({
          message: 'Manual gameweek override cleared'
        });
      }
      
      // Recalculate tournament points
      if (action === 'recalculate-tournament-points') {
        const results = {
          tournaments_processed: 0,
          entries_updated: 0,
          errors: []
        };
        
        // Get all tournaments
        const { data: tournaments, error: tournamentError } = await supabase
          .from('tournaments')
          .select('id, gameweek');
        
        if (tournamentError) {
          return res.status(500).json({ error: 'Failed to fetch tournaments', details: tournamentError.message });
        }
        
        for (const tournament of tournaments || []) {
          // Get all entries for this tournament
          const { data: entries, error: entryError } = await supabase
            .from('tournament_entries')
            .select('id, user_id, entry_points')
            .eq('tournament_id', tournament.id);
          
          if (entryError) {
            results.errors.push({ tournament: tournament.id, error: entryError.message });
            continue;
          }
          
          for (const entry of entries || []) {
            // Get all predictions for this user in this gameweek
            const { data: predictions, error: predError } = await supabase
              .from('predictions')
              .select('points_earned')
              .eq('user_id', entry.user_id)
              .eq('gameweek', tournament.gameweek);
            
            if (predError) {
              results.errors.push({ user: entry.user_id, error: predError.message });
              continue;
            }
            
            const totalPoints = predictions.reduce((sum, p) => sum + (p.points_earned || 0), 0);
            
            if (totalPoints !== entry.entry_points) {
              const { error: updateError } = await supabase
                .from('tournament_entries')
                .update({ entry_points: totalPoints })
                .eq('id', entry.id);
              
              if (updateError) {
                results.errors.push({ entry: entry.id, error: updateError.message });
              } else {
                results.entries_updated++;
              }
            }
          }
          
          // Recalculate ranks
          const { data: rankedEntries, error: rankError } = await supabase
            .from('tournament_entries')
            .select('id, entry_points')
            .eq('tournament_id', tournament.id)
            .order('entry_points', { ascending: false });
          
          if (!rankError && rankedEntries) {
            for (let i = 0; i < rankedEntries.length; i++) {
              await supabase
                .from('tournament_entries')
                .update({ rank: i + 1 })
                .eq('id', rankedEntries[i].id);
            }
          }
          
          results.tournaments_processed++;
        }
        
        return res.status(200).json({
          message: 'Tournament points recalculated',
          results
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
};
