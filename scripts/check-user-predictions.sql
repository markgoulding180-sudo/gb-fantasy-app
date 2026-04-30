-- Check predictions for Mark G and angela in GW35
SELECT 
    u.username,
    p.match_id,
    m.home_team,
    m.away_team,
    p.predicted_result,
    p.home_score,
    p.away_score,
    m.result as actual_result,
    m.home_score as actual_home,
    m.away_score as actual_away,
    p.points_earned
FROM predictions p
JOIN users u ON p.user_id = u.id
JOIN matches m ON p.match_id = m.id
WHERE p.gameweek = 35
AND u.username IN ('Mark G', 'angela')
ORDER BY u.username, p.match_id;
