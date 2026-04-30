-- Check current state of tournament entries and predictions
-- Run this to diagnose the issue

-- 1. Check tournament entries for GW35
SELECT 
    te.id as entry_id,
    te.user_id,
    u.username,
    te.tournament_id,
    t.name as tournament_name,
    t.gameweek,
    te.entry_points,
    te.rank
FROM tournament_entries te
JOIN users u ON te.user_id = u.id
JOIN tournaments t ON te.tournament_id = t.id
WHERE t.gameweek = 35;

-- 2. Check predictions for GW35 with points
SELECT 
    p.user_id,
    u.username,
    p.match_id,
    p.gameweek,
    p.points_earned,
    m.home_team,
    m.away_team,
    m.status
FROM predictions p
JOIN users u ON p.user_id = u.id
JOIN matches m ON p.match_id = m.id
WHERE p.gameweek = 35
ORDER BY u.username, p.match_id;

-- 3. Check if there are any predictions with points_earned > 0
SELECT 
    u.username,
    SUM(p.points_earned) as total_points
FROM predictions p
JOIN users u ON p.user_id = u.id
WHERE p.gameweek = 35
GROUP BY u.username;

-- 4. Force update entry_points from predictions (remove the WHERE clause)
UPDATE tournament_entries te
SET entry_points = COALESCE(
  (SELECT SUM(p.points_earned)
   FROM predictions p
   WHERE p.user_id = te.user_id
   AND p.gameweek = (SELECT gameweek FROM tournaments t WHERE t.id = te.tournament_id)
  ), 0
);

-- 5. Verify the update
SELECT 
    te.id as entry_id,
    u.username,
    t.name as tournament_name,
    te.entry_points
FROM tournament_entries te
JOIN users u ON te.user_id = u.id
JOIN tournaments t ON te.tournament_id = t.id
WHERE t.gameweek = 35;
