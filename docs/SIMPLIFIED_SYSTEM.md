# GB Fantasy - Simplified Live Scores System

## Overview
This is a simplified, self-sufficient system that doesn't rely on OpenClaw cron jobs.

## How It Works

### 1. GitHub Actions (Free Cron)
- Runs every 5 minutes during Premier League match hours
- Calls `/api/update-scores` to fetch live data from FPL API
- Stores match scores and status in Supabase

### 2. API Endpoints

| Endpoint | Purpose | Called By |
|----------|---------|-----------|
| `GET /api/update-scores` | Fetch FPL data, update match scores | GitHub Actions cron |
| `GET /api/calculate-points` | Calculate points for finished matches | GitHub Actions cron (after matches end) |
| `GET /api/live-scores` | Return current live scores for display | Frontend (profile page) |
| `GET /api/predictions` | Get fixtures + user predictions | Frontend (predictions page) |

### 3. Data Flow

```
GitHub Cron → /api/update-scores → FPL API → Supabase (matches table)
                                                    ↓
Frontend ← /api/live-scores ← Supabase (matches table)
```

### 4. Frontend Display
- Profile page shows live games bar (auto-refreshes every 5 mins)
- Predictions page shows live scores next to each prediction
- No complex calculations on frontend — just displays data from Supabase

## Setup

### Environment Variables (Vercel)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SECRET=your-service-role-key
```

### GitHub Actions Secret
Add to your GitHub repo settings:
- `API_SECRET` = any random string (for basic auth)

## Match Status Logic

```javascript
// From FPL API:
- started = true → match is live
- finished_provisional = true → match just ended
- finished = true → match fully confirmed

// Our status mapping:
started && !finished_provisional → "live"
finished_provisional || finished → "finished"
!started → "upcoming"
```

## Point Calculation

When a match is marked as `finished`:
```
IF predicted_result === actual_result → 10 points
IF predicted_score === actual_score → +10 points (total 20)
```

## Files Changed

1. `.github/workflows/live-scores.yml` - Simplified cron
2. `api/update-scores.js` - New: Just fetches and stores FPL data
3. `api/calculate-points.js` - New: Calculates points for finished matches
4. `api/live-scores.js` - Simplified: Just returns current match data
5. `frontend/profile.js` - Fixed: Properly displays live scores

## Testing

1. Manually trigger the GitHub Action
2. Check Vercel logs for `/api/update-scores`
3. Check Supabase matches table for updated scores
4. Visit profile page to see live games bar
