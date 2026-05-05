# Project Notes

## GitHub
Repo: https://github.com/markgoulding180-sudo/gb-fantasy-app

## Commits
- 2026-05-04 12:08 - Wire up homepage with live data - tournaments, leaderboard, prize pool, active players, current GW
- 2026-05-04 12:13 - Calculate live prize pool from entry fees × entries for all tournaments
- 2026-05-04 12:14 - Add current gameweek points to leaderboard API - sums points_earned from predictions
- 2026-05-04 12:22 - Add tournament entry status to homepage - show View Predictions for registered users, lock button for started tournaments
- 2026-05-04 12:25 - Update tournaments page with proper entry status checking - same logic as homepage
- 2026-05-04 12:33 - Add prediction status bar for logged-in users - shows if they've predicted for current GW
- 2026-05-04 12:45 - Fix gameweek logic - use current GW until finished, then switch to next GW
- 2026-05-04 12:52 - Update predictions page card colors to match dark stadium theme
- 2026-05-04 13:38 - Add status icons to profile predictions - green circle with tick for played, yellow circle for not played
- 2026-05-04 13:48 - Change points text color to green to match status circle for played games
- 2026-05-04 13:53 - Update Performance History chart - start from 0, light blue line with filled area
- 2026-05-04 13:56 - Add rank chart mode with inverted Y-axis showing rank swings over gameweeks
- 2026-05-04 14:01 - Add User Trends section - shows prediction distribution and most common scores across all users
- 2026-05-05 04:17 - Add manual gameweek override functions (set/clear) to admin-stats API
- 2026-05-05 04:17 - Update admin panel labels: Last Finalised / Current Gameweek (Predictions)
- 2026-05-05 04:17 - Improve finalisePoints() to call gameweek-transition with manual flag
- 2026-05-05 04:17 - Update profile prediction history to group by gameweek with summaries