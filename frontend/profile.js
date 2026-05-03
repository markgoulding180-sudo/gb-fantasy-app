// GB Fantasy - User Profile Page

const API_BASE = '/api';

// Auth state
let currentUser = null;
let authToken = localStorage.getItem('gbf_token') || null;

// Cached predictions data for real-time calculations
let cachedPredictionsData = null;

// Live games refresh interval (5 minutes)
let liveGamesInterval = null;

document.addEventListener('DOMContentLoaded', function() {
  initProfile();
});

async function initProfile() {
  if (!authToken) {
    window.location.href = 'login.html';
    return;
  }

  // Validate session and get user data
  const userData = await loadUserData();
  if (!userData) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = userData;
  
  // Render profile header
  renderProfileHeader(userData);
  
  // Load live games immediately and start refresh interval
  await loadLiveGames();
  startLiveGamesRefresh();
  
  // Load cached predictions data FIRST (needed for real-time tournament points)
  await loadCachedPredictionsData();
  
  // Load stats and other data that depends on cached predictions
  await loadStats();
  await loadMyTournaments(); // Uses cached data - must run after loadCachedPredictionsData
  
  // Load remaining data in parallel
  await Promise.all([
    loadCurrentPredictions(),
    loadPredictionHistory(),
    loadPerformanceChart()
  ]);
}

// Start auto-refresh for live games (every 5 minutes)
function startLiveGamesRefresh() {
  // Clear any existing interval
  if (liveGamesInterval) {
    clearInterval(liveGamesInterval);
  }
  
  // Refresh every 5 minutes (300000 ms)
  liveGamesInterval = setInterval(async () => {
    console.log('Auto-refreshing live games...');
    await loadLiveGames();
    // Also refresh current predictions to show updated scores
    await loadCurrentPredictions();
  }, 300000);
  
  console.log('Live games auto-refresh started (5 min interval)');
}

// Stop auto-refresh (call on page unload)
function stopLiveGamesRefresh() {
  if (liveGamesInterval) {
    clearInterval(liveGamesInterval);
    liveGamesInterval = null;
  }
}

// Load live games from API
async function loadLiveGames() {
  try {
    const response = await fetch(`${API_BASE}/live-scores`);
    if (!response.ok) throw new Error('Failed to load live scores');
    
    const data = await response.json();
    console.log('Live games data:', data);
    
    const liveGamesBar = document.getElementById('live-games-bar');
    const liveGamesGrid = document.getElementById('live-games-grid');
    
    // Check if there are live matches
    const liveMatches = data.results?.live || [];
    
    if (liveMatches.length === 0) {
      liveGamesBar.classList.remove('active');
      return;
    }
    
    // Show the live games bar
    liveGamesBar.classList.add('active');
    
    // Render live games
    liveGamesGrid.innerHTML = liveMatches.map(match => {
      // Use team names from API response or fallback to cached data
      const homeTeam = match.home_team || cachedPredictionsData?.matches?.find(m => m.id === match.match_id)?.home_team || 'Home';
      const awayTeam = match.away_team || cachedPredictionsData?.matches?.find(m => m.id === match.match_id)?.away_team || 'Away';
      const minute = match.minute || 0;
      
      return `
        <div class="live-game-card">
          <div class="live-game-teams">${homeTeam} vs ${awayTeam}</div>
          <div class="live-game-score">${match.home} - ${match.away}</div>
          <div class="live-game-minute">${minute}'</div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading live games:', error);
  }
}

async function loadUserData() {
  try {
    const response = await fetch(`${API_BASE}/leaderboard?limit=1`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
      localStorage.removeItem('gbf_token');
      return null;
    }

    // Get user from localStorage or fetch fresh
    const storedUser = localStorage.getItem('gbf_user');
    if (storedUser) {
      return JSON.parse(storedUser);
    }
    
    return null;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Load all predictions data across all gameweeks for real-time calculations
async function loadCachedPredictionsData() {
  try {
    const allPredictions = [];
    const allMatches = [];
    
    // Fetch predictions for all gameweeks (1-38)
    for (let gw = 1; gw <= 38; gw++) {
      const response = await fetch(`${API_BASE}/predictions?gameweek=${gw}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.predictions) {
          allPredictions.push(...data.predictions);
        }
        if (data.matches) {
          // Add gameweek info to matches
          const matchesWithGameweek = data.matches.map(m => ({ ...m, gameweek: gw }));
          allMatches.push(...matchesWithGameweek);
        }
      }
    }
    
    cachedPredictionsData = {
      predictions: allPredictions,
      matches: allMatches
    };
    
    console.log('Cached predictions data loaded:', cachedPredictionsData);
  } catch (error) {
    console.error('Error loading cached predictions data:', error);
    cachedPredictionsData = { predictions: [], matches: [] };
  }
}

// Refresh cached predictions for specific gameweeks (used when real-time updates are needed)
async function refreshCachedPredictionsForGameweeks(gameweeks) {
  try {
    if (!cachedPredictionsData) {
      await loadCachedPredictionsData();
      return;
    }
    
    // Refresh data for specified gameweeks
    for (const gw of gameweeks) {
      const response = await fetch(`${API_BASE}/predictions?gameweek=${gw}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Remove old data for this gameweek
        cachedPredictionsData.predictions = cachedPredictionsData.predictions.filter(
          p => !cachedPredictionsData.matches.find(m => m.id === p.match_id && m.gameweek === gw)
        );
        cachedPredictionsData.matches = cachedPredictionsData.matches.filter(m => m.gameweek !== gw);
        
        // Add fresh data
        if (data.predictions) {
          cachedPredictionsData.predictions.push(...data.predictions);
        }
        if (data.matches) {
          const matchesWithGameweek = data.matches.map(m => ({ ...m, gameweek: gw }));
          cachedPredictionsData.matches.push(...matchesWithGameweek);
        }
      }
    }
    
    console.log('Cached predictions refreshed for gameweeks:', gameweeks);
  } catch (error) {
    console.error('Error refreshing cached predictions:', error);
  }
}

function renderProfileHeader(user) {
  const initials = user.display_name 
    ? user.display_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : user.username.substring(0, 2).toUpperCase();
  
  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent = user.display_name || user.username;
  document.getElementById('profile-username').textContent = '@' + user.username;
  document.getElementById('join-date').textContent = new Date(user.created_at).toLocaleDateString();
}

async function loadStats() {
  try {
    // Get user stats
    const user = JSON.parse(localStorage.getItem('gbf_user') || '{}');
    
    document.getElementById('stat-points').textContent = user.total_points?.toLocaleString() || '0';
    document.getElementById('stat-correct').textContent = user.correct_scores || '0';
    
    // Get global rank
    const response = await fetch(`${API_BASE}/leaderboard?limit=1000`);
    if (response.ok) {
      const data = await response.json();
      const userEntry = data.leaderboard?.find(e => e.user.username === user.username);
      if (userEntry) {
        document.getElementById('stat-rank').textContent = '#' + userEntry.rank;
      } else {
        document.getElementById('stat-rank').textContent = '--';
      }
    }
    
    // Calculate accuracy from cached predictions data (finished matches only)
    // Use cached data for consistency with other calculations
    if (cachedPredictionsData) {
      const predictions = cachedPredictionsData.predictions || [];
      const matches = cachedPredictionsData.matches || [];
      
      let totalFinished = 0;
      let correctPredictions = 0;
      
      // Use a Set to track unique match IDs to avoid duplicates
      const processedMatchIds = new Set();
      
      predictions.forEach(pred => {
        const match = matches.find(m => m.id === pred.match_id);
        if (match && match.status === 'finished' && !processedMatchIds.has(pred.match_id)) {
          processedMatchIds.add(pred.match_id);
          totalFinished++;
          if (pred.points_earned > 0) {
            correctPredictions++;
          }
        }
      });
      
      const accuracy = totalFinished > 0 
        ? Math.round((correctPredictions / totalFinished) * 100)
        : 0;
      
      console.log(`Accuracy calculation: ${correctPredictions} correct / ${totalFinished} finished = ${accuracy}%`);
      document.getElementById('stat-accuracy').textContent = accuracy + '%';
    }
    
  } catch (error) {
    console.error('Stats error:', error);
  }
}

async function loadCurrentPredictions() {
  try {
    // Get current gameweek
    const gwResponse = await fetch(`${API_BASE}/current-gameweek`);
    const gwData = await gwResponse.json();
    const currentGW = gwData.next_gameweek || gwData.current_gameweek || 34;
    
    // Get predictions for current GW
    const response = await fetch(`${API_BASE}/predictions?gameweek=${currentGW}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) throw new Error('Failed to load predictions');
    
    const data = await response.json();
    console.log('Predictions API response:', data); // DEBUG
    const container = document.getElementById('current-predictions');
    
    if (!data.predictions || data.predictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-futbol"></i>
          <p>No predictions for GW ${currentGW} yet</p>
          <a href="predictions.html" class="btn btn-primary btn-sm" style="margin-top: 1rem;">
            <i class="fas fa-plus"></i> Add Predictions
          </a>
        </div>
      `;
      return;
    }
    
    // Get match details
    const matches = data.matches || [];
    
    // Also fetch live scores to check for in-play matches
    let liveScoresData = null;
    try {
      const liveResponse = await fetch(`${API_BASE}/live-scores`);
      if (liveResponse.ok) {
        liveScoresData = await liveResponse.json();
      }
    } catch (e) {
      console.log('Could not fetch live scores for predictions');
    }
    
    const liveMatches = liveScoresData?.results?.live || [];
    
    container.innerHTML = data.predictions.map(pred => {
      const match = matches.find(m => m.id === pred.match_id) || {};
      const resultText = pred.predicted_result === 'H' ? 'Home Win' : 
                        pred.predicted_result === 'A' ? 'Away Win' : 'Draw';
      
      // Check match status
      const isFinished = match.status === 'finished';
      const isLive = match.status === 'live' || liveMatches.some(lm => lm.match_id === pred.match_id);
      const liveMatch = liveMatches.find(lm => lm.match_id === pred.match_id);
      
      const actualResult = match.result === 'H' ? 'Home Win' : 
                          match.result === 'A' ? 'Away Win' : 
                          match.result === 'D' ? 'Draw' : null;
      
      // Build status display
      let statusHtml = '';
      if (isFinished) {
        statusHtml = pred.points_earned > 0 
          ? `<span class="points-positive">+${pred.points_earned} pts</span>`
          : `<span style="color: var(--text-secondary);">0 pts</span>`;
      } else if (isLive && liveMatch) {
        statusHtml = `
          <div style="text-align: right;">
            <span class="live-indicator">LIVE</span>
            <div class="live-score" style="font-size: 1.1rem; margin-top: 0.25rem;">
              ${liveMatch.home} - ${liveMatch.away}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${liveMatch.minute || 0}'</div>
          </div>
        `;
      } else {
        statusHtml = '<span class="text-muted">Pending</span>';
      }
      
      // Build result text for finished or live matches
      let resultHtml = '';
      if (isFinished) {
        resultHtml = `<br><span style="color: var(--text-secondary);">Result: ${actualResult} ${match.home_score}-${match.away_score} (FT)</span>`;
      } else if (isLive && liveMatch) {
        resultHtml = `<br><span style="color: #22c55e;">In Play: ${liveMatch.home} - ${liveMatch.away}</span>`;
      }
      
      return `
        <div class="current-prediction ${isLive ? 'live' : ''}">
          <div>
            <div class="current-prediction-teams">${match.home_team || 'TBD'} vs ${match.away_team || 'TBD'}</div>
            <div class="current-prediction-guess">
              Your prediction: ${resultText} ${pred.home_score}-${pred.away_score}
              ${resultHtml}
            </div>
          </div>
          <div>
            ${statusHtml}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Current predictions error:', error);
    document.getElementById('current-predictions').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error loading predictions</p>
      </div>
    `;
  }
}

async function loadPredictionHistory() {
  try {
    // Get all predictions across all gameweeks
    const allPredictions = [];
    
    for (let gw = 1; gw <= 38; gw++) {
      const response = await fetch(`${API_BASE}/predictions?gameweek=${gw}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.predictions && data.predictions.length > 0) {
          data.predictions.forEach(pred => {
            const match = data.matches?.find(m => m.id === pred.match_id);
            if (match && pred.points_earned > 0) {
              allPredictions.push({
                ...pred,
                match,
                gameweek: gw
              });
            }
          });
        }
      }
    }
    
    // Sort by most recent (highest GW first)
    allPredictions.sort((a, b) => b.gameweek - a.gameweek);
    
    const container = document.getElementById('prediction-history');
    
    if (allPredictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-futbol"></i>
          <p>No completed predictions yet</p>
        </div>
      `;
      return;
    }
    
    // Show last 10 predictions
    container.innerHTML = allPredictions.slice(0, 10).map(pred => {
      const resultText = pred.predicted_result === 'H' ? '1' : 
                        pred.predicted_result === 'A' ? '2' : 'X';
      const isCorrectScore = pred.points_earned === 20;
      
      return `
        <div class="prediction-history-item">
          <div class="prediction-history-match">
            <span class="text-muted" style="font-size: 0.75rem;">GW${pred.gameweek}</span>
            <div>
              <div class="prediction-history-teams">${pred.match.home_team} vs ${pred.match.away_team}</div>
              <div class="prediction-history-result">
                Predicted: ${resultText} ${pred.home_score}-${pred.away_score}
                ${isCorrectScore ? '<i class="fas fa-bullseye" style="color: var(--accent-amber);"></i>' : ''}
              </div>
            </div>
          </div>
          <div class="prediction-history-points">
            <div class="points-positive">+${pred.points_earned}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">points</div>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('History error:', error);
  }
}

async function loadMyTournaments() {
  try {
    // Fetch user's actual tournament entries with points
    const response = await fetch(`${API_BASE}/tournaments?my_entries=true`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) throw new Error('Failed to load tournaments');
    
    const data = await response.json();
    console.log('Tournament entries API response:', data); // DEBUG
    
    const container = document.getElementById('my-tournaments');
    
    const entries = data.entries || [];
    
    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-trophy"></i>
          <p>No tournament entries yet</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = entries.map(e => {
      const t = e.tournament;
      const statusClass = t.status === 'live' ? 'live' : t.status === 'finished' ? 'finished' : '';
      const rankDisplay = e.rank ? `#${e.rank}` : 'Not ranked';
      
      // Use entry_points from API - this is updated by admin when scores are entered
      const tournamentPoints = e.entry_points || 0;
      
      console.log(`Tournament ${t.name}: entry_points=${tournamentPoints}, rank=${e.rank}`); // DEBUG
      
      return `
        <div class="tournament-entry ${statusClass}">
          <div>
            <div style="font-weight: 600;">${t.name}</div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
              GW${t.gameweek} • ${rankDisplay}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--accent-green);">
              ${tournamentPoints} pts
            </div>
            <span class="tournament-status ${t.status}">${t.status}</span>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Tournaments error:', error);
    document.getElementById('my-tournaments').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error loading tournaments</p>
      </div>
    `;
  }
}

async function loadPerformanceChart() {
  try {
    // Get points per gameweek
    const gwPoints = [];
    
    for (let gw = 1; gw <= 38; gw++) {
      const response = await fetch(`${API_BASE}/predictions?gameweek=${gw}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const points = data.predictions?.reduce((sum, p) => sum + (p.points_earned || 0), 0) || 0;
        if (points > 0 || gw <= 34) { // Include future GWs up to current
          gwPoints.push({ gw, points });
        }
      }
    }
    
    const container = document.getElementById('performance-chart');
    
    if (gwPoints.length === 0 || gwPoints.every(g => g.points === 0)) {
      container.innerHTML = `
        <div class="empty-state" style="width: 100%;">
          <i class="fas fa-chart-bar"></i>
          <p>No performance data yet</p>
        </div>
      `;
      return;
    }
    
    const maxPoints = Math.max(...gwPoints.map(g => g.points), 1);
    
    container.innerHTML = gwPoints.slice(-10).map(g => {
      const height = (g.points / maxPoints) * 100;
      return `
        <div class="chart-bar" style="height: ${Math.max(height, 5)}%;">
          <div class="chart-bar-value">${g.points}</div>
          <div class="chart-bar-label">GW${g.gw}</div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Chart error:', error);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', stopLiveGamesRefresh);
