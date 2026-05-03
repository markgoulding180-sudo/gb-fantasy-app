// GB Fantasy - User Profile Page (Simplified)

const API_BASE = '/api';

let authToken = localStorage.getItem('gbf_token') || null;
let liveRefreshInterval = null;

document.addEventListener('DOMContentLoaded', function() {
  initProfile();
});

async function initProfile() {
  if (!authToken) {
    window.location.href = 'login.html';
    return;
  }

  const user = JSON.parse(localStorage.getItem('gbf_user') || '{}');
  if (!user.id) {
    window.location.href = 'login.html';
    return;
  }

  // Test token validity with a simple request
  try {
    const testResponse = await fetch(`${API_BASE}/predictions?gameweek=1&limit=1`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (testResponse.status === 401) {
      // Token expired, clear and redirect
      console.log('Token expired, redirecting to login');
      localStorage.removeItem('gbf_token');
      localStorage.removeItem('gbf_user');
      window.location.href = 'login.html';
      return;
    }
  } catch (e) {
    console.error('Auth check error:', e);
  }

  // Render header
  renderProfileHeader(user);
  
  // Load initial data
  await Promise.all([
    loadLiveGames(),
    loadStats(),
    loadCurrentPredictions(),
    loadMyTournaments()
  ]);

  // Start live refresh (every 2 minutes)
  startLiveRefresh();
}

function renderProfileHeader(user) {
  const initials = user.display_name 
    ? user.display_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : user.username?.substring(0, 2).toUpperCase() || '??';
  
  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent = user.display_name || user.username || 'User';
  document.getElementById('profile-username').textContent = '@' + (user.username || 'user');
  document.getElementById('join-date').textContent = user.created_at 
    ? new Date(user.created_at).toLocaleDateString() 
    : '--';
}

// Live Games - simplified to just display what the API returns
async function loadLiveGames() {
  try {
    const response = await fetch(`${API_BASE}/live-scores`);
    if (!response.ok) throw new Error('Failed to load');
    
    const data = await response.json();
    console.log('Live games:', data);
    
    const liveBar = document.getElementById('live-games-bar');
    const liveGrid = document.getElementById('live-games-grid');
    
    if (!liveBar || !liveGrid) return;

    // Only show if there are live matches
    if (data.live && data.live.length > 0) {
      liveBar.classList.add('active');
      
      liveGrid.innerHTML = data.live.map(match => `
        <div class="live-game-card">
          <div class="live-game-teams">${match.home_team} vs ${match.away_team}</div>
          <div class="live-game-score">${match.home_score} - ${match.away_score}</div>
          <div class="live-game-minute">LIVE</div>
        </div>
      `).join('');
    } else {
      liveBar.classList.remove('active');
    }
    
  } catch (error) {
    console.error('Live games error:', error);
  }
}

// Auto-refresh live games
function startLiveRefresh() {
  if (liveRefreshInterval) clearInterval(liveRefreshInterval);
  
  // Refresh every 2 minutes
  liveRefreshInterval = setInterval(() => {
    console.log('Refreshing live data...');
    loadLiveGames();
    loadCurrentPredictions(); // Also refresh predictions to show updated scores
  }, 120000);
}

// Stats from localStorage (updated by calculate-points API)
async function loadStats() {
  const user = JSON.parse(localStorage.getItem('gbf_user') || '{}');
  
  document.getElementById('stat-points').textContent = user.total_points?.toLocaleString() || '0';
  document.getElementById('stat-correct').textContent = user.correct_scores || '0';
  document.getElementById('stat-rank').textContent = '--'; // Would need leaderboard fetch
  document.getElementById('stat-accuracy').textContent = '--%'; // Would need calculation
}

// Current predictions with live scores
async function loadCurrentPredictions() {
  try {
    // Get current gameweek
    const gwResponse = await fetch(`${API_BASE}/current-gameweek`);
    const gwData = await gwResponse.json();
    const currentGW = gwData.next_gameweek || gwData.current_gameweek || 34;
    
    // Get predictions and matches in parallel
    const [predResponse, liveResponse] = await Promise.all([
      fetch(`${API_BASE}/predictions?gameweek=${currentGW}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }),
      fetch(`${API_BASE}/live-scores`)
    ]);
    
    const predData = await predResponse.json();
    const liveData = await liveResponse.json();
    
    const container = document.getElementById('current-predictions');
    if (!container) return;

    if (!predData.predictions || predData.predictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-futbol"></i>
          <p>No predictions for GW ${currentGW}</p>
          <a href="predictions.html" class="btn btn-primary btn-sm">Add Predictions</a>
        </div>`;
      return;
    }

    // Build a map of match data for quick lookup
    const matchMap = {};
    [...(liveData.live || []), ...(liveData.finished || []), ...(liveData.upcoming || [])].forEach(m => {
      matchMap[m.id] = m;
    });

    container.innerHTML = predData.predictions.map(pred => {
      const match = predData.matches?.find(m => m.id === pred.match_id);
      const liveMatch = matchMap[pred.match_id];
      
      const homeTeam = match?.home_team || 'TBD';
      const awayTeam = match?.away_team || 'TBD';
      
      const isFinished = match?.status === 'finished';
      const isLive = match?.status === 'live';
      
      let statusHtml = '<span class="text-muted">Pending</span>';
      let scoreHtml = '';
      
      if (isFinished) {
        const points = pred.points_earned || 0;
        statusHtml = points > 0 
          ? `<span class="points-positive">+${points} pts</span>`
          : `<span style="color: var(--text-secondary);">0 pts</span>`;
        scoreHtml = `<br><span style="color: var(--text-secondary);">FT: ${match.home_score}-${match.away_score}</span>`;
      } else if (isLive && liveMatch) {
        statusHtml = '<span class="live-indicator">LIVE</span>';
        scoreHtml = `<br><span style="color: #22c55e;">${liveMatch.home_score} - ${liveMatch.away_score}</span>`;
      }
      
      const resultText = pred.predicted_result === 'H' ? 'Home' : 
                        pred.predicted_result === 'A' ? 'Away' : 'Draw';
      
      return `
        <div class="current-prediction ${isLive ? 'live' : ''}">
          <div>
            <div class="current-prediction-teams">${homeTeam} vs ${awayTeam}</div>
            <div class="current-prediction-guess">
              Your prediction: ${resultText} ${pred.home_score}-${pred.away_score}
              ${scoreHtml}
            </div>
          </div>
          <div>${statusHtml}</div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Predictions error:', error);
  }
}

// Tournament entries
async function loadMyTournaments() {
  try {
    const response = await fetch(`${API_BASE}/tournaments?my_entries=true`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) throw new Error('Failed to load');
    
    const data = await response.json();
    const container = document.getElementById('my-tournaments');
    if (!container) return;

    const entries = data.entries || [];
    
    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-trophy"></i>
          <p>No tournament entries yet</p>
        </div>`;
      return;
    }

    container.innerHTML = entries.map(e => {
      const statusClass = e.tournament?.status === 'live' ? 'live' : 
                         e.tournament?.status === 'finished' ? 'finished' : '';
      return `
        <div class="tournament-entry ${statusClass}">
          <div class="tournament-entry-info">
            <div class="tournament-entry-name">${e.tournament?.name || 'Tournament'}</div>
            <div class="tournament-entry-meta">
              GW${e.tournament?.gameweek || '--'} • ${e.tournament?.entry_fee ? '£' + e.tournament.entry_fee : 'Free Entry'}
            </div>
          </div>
          <div class="tournament-entry-points">
            <div class="tournament-entry-points-value">${e.entry_points || 0} pts</div>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Tournaments error:', error);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (liveRefreshInterval) clearInterval(liveRefreshInterval);
});
