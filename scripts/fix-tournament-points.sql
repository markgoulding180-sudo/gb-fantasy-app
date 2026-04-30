-- Manual fix: Recalculate tournament entry points for GW35
-- Run this in Supabase SQL Editor to update entry_points immediately

-- First, let's see current state
SELECT 
    te.id as entry_id,
    u.username,
    t.name as tournament_name,
    t.gameweek,
    te.entry_points,
    te.rank
FROM tournament_entries te
JOIN users u ON te.user_id = u.id
JOIN tournaments t ON te.tournament_id = t.id
WHERE t.gameweek = 35;

-- Now update entry_points based on gameweek_summary
UPDATE tournament_entries te
SET entry_points = COALESCE(
    (SELECT gs.total_points 
     FROM gameweek_summary gs 
     WHERE gs.user_id = te.user_id 
     AND gs.gameweek = (SELECT gameweek FROM tournaments WHERE id = te.tournament_id)
    ), 0
)
WHERE te.tournament_id IN (SELECT id FROM tournaments WHERE gameweek = 35);

-- Verify the update
SELECT 
    te.id as entry_id,
    u.username,
    t.name as tournament_name,
    t.gameweek,
    te.entry_points,
    te.rank
FROM tournament_entries te
JOIN users u ON te.user_id = u.id
JOIN tournaments t ON te.tournament_id = t.id
WHERE t.gameweek = 35;

-- Alternative: Update based on predictions directly (if gameweek_summary is empty)
-- Uncomment and run this if the above doesn't work:
/*
UPDATE tournament_entries te
SET entry_points = COALESCE(
    (SELECT SUM(p.points_earned) 
     FROM predictions p 
     WHERE p.user_id = te.user_id 
     AND p.gameweek = (SELECT gameweek FROM tournaments WHERE id = te.tournament_id)
    ), 0
)
WHERE te.tournament_id IN (SELECT id FROM tournaments WHERE gameweek = 35);
*/
