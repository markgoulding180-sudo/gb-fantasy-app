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