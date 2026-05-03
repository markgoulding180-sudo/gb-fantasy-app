# GB Fantasy - FPL API Data Workflow

## Core Principle
**The website is self-sustaining. No external dependencies (OpenClaw, manual triggers).**

## Data Flow

### 1. User Makes Predictions
- User selects scores on predictions page
- Clicks "Save Predictions"
- Predictions saved to Supabase `predictions` table
- **No FPL API call needed**

### 2. Match Data Source of Truth
**FPL API = Single source of truth for:**
- Match scores (home/away)
- Match status (upcoming/live/finished)
- Kickoff times

### 3. Automatic Updates (Vercel Cron)
**Endpoint:** `GET /api/live-scores`
**Schedule:** Every 1 minute (Vercel Cron)
**FPL API:** `https://fantasy.premierleague.com/api/fixtures/`

**What it does:**
1. Fetches ALL fixtures from FPL API
2. For current gameweek matches:
   - Updates scores in Supabase
   - Updates status: `upcoming` → `live` → `finished`
   - **Time-based finish:** Marks finished after 105 mins from kickoff
3. When match finishes:
   - Calculates prediction points (10 for result, +10 for exact score)
   - Updates user totals
   - Updates tournament entries

### 4. User Sees Updates
- Profile page shows live scores bar (auto-refreshes every 5 mins)
- Predictions show points as matches finish
- Leaderboard updates automatically

## Setup Requirements

### Initial Setup (One-time)
1. **Set current gameweek:**
   ```
   GET /api/current-gameweek
   ```
   - Fetches from FPL bootstrap-static
   - Stores in Supabase settings

2. **Sync fixtures:**
   ```
   GET /api/sync-fixtures?gameweek=XX
   ```
   - Fetches fixtures for gameweek
   - Creates match records in Supabase

### Environment Variables (Vercel)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SECRET=your-service-role-key
```

## API Endpoints

| Endpoint | Purpose | Called By |
|----------|---------|-----------|
| `/api/live-scores` | Update scores, calculate points | Vercel Cron (every 1 min) |
| `/api/current-gameweek` | Set active gameweek | Manual (once per GW) |
| `/api/sync-fixtures` | Import fixtures for GW | Manual (once per GW) |
| `/api/predictions` | Save user predictions | Frontend (user action) |
| `/api/leaderboard` | Get rankings | Frontend (page load) |

## Cron Configuration

**Vercel Cron (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/live-scores",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

## FPL API Rate Limits
- **Bootstrap-static:** Call once per gameweek (cached)
- **Fixtures:** Call every 1 minute during matches (well within limits)
- FPL API allows much higher rates than we're using

## Match Status Logic

```
IF fixture.finished = true → status = finished
ELSE IF fixture.finished_provisional = true → status = finished
ELSE IF minutes_since_kickoff >= 105 → status = finished (time-based)
ELSE IF fixture.started = true → status = live
ELSE → status = upcoming
```

## Point Calculation

When match status = finished:
```
IF predicted_result = actual_result → 10 points
IF predicted_score = actual_score → +10 points (total 20)
```

## No External Dependencies

❌ OpenClaw cron jobs  
❌ GitHub Actions  
❌ Manual API calls during matches  

✅ Vercel Cron handles everything automatically  
✅ Frontend polls for display updates only  
