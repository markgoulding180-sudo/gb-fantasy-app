# Project Notes

## 2026-05-03 - Live Games Feature Added
- Added live games bar to profile page showing all matches in play
- Added green "LIVE" indicator with pulsing animation to predictions section
- Live matches show current score and minute in real-time
- Auto-refresh every 5 minutes for both live games bar and predictions
- Added GitHub Actions cron job (.github/workflows/live-scores-cron.yml)
- Added OpenClaw cron job for additional live score triggers
- Updated live-scores.js API to include team names in response
- Changes pushed to GitHub: https://github.com/markgoulding180-sudo/gb-fantasy

### Files Modified:
- frontend/profile.html - Added live games bar styles and HTML
- frontend/profile.js - Added live games loading, auto-refresh, and live indicators
- api/live-scores.js - Added team names to live match response
- .github/workflows/live-scores-cron.yml - New GitHub Actions workflow

## 2026-05-03 - Fixed Live Scores API & Time-Based Finish Detection
- **Problem**: Bournemouth match still showing as live 40 mins after finish
- **Root cause**: FPL API `finished` flag is delayed; API was 404 due to Netlify format
- **Solution**: 
  - Converted live-scores.js from Netlify to Vercel format (ES modules)
  - Added package.json with ESM type and Supabase dependency
  - Added time-based finish detection: matches marked finished after 105 minutes from kickoff
  - This bypasses FPL API delays which can take 30-60 mins to mark finished
- **Deploy**: https://gb-fantasy.vercel.app/api/live-scores now working

### Files Modified:
- api/live-scores.js - Vercel format + time-based finish detection (105 min threshold)
- package.json - Added ESM support and Supabase dependency
- vercel.json - Cleaned up configuration