// Profile page JavaScript
document.addEventListener('DOMContentLoaded', async function() {
  await loadProfile();
  await loadUserTournaments();
  await loadUserPredictions();
});

async function loadProfile() {
  const token = localStorage.getItem('gbf_token');
  const userJson = localStorage.getItem('gbf_user');
  
  if (!token || !userJson) {
    window.location.href = '/login.html';
    return;
  }
  
  try {
    const user = JSON.parse(userJson);
    
    // Update profile header
    document.getElementById('profile-name').textContent = user.display_name || user.username;
    document.getElementById('profile-username').textContent = '@' + user.username;
    document.getElementById('profile-avatar').textContent = (user.display_name || user.username).substring(0, 2).toUpperCase();
    
    // Handle join date - check localStorage first, then fetch from Supabase
    let joinDate = user.created_at;
    if (!joinDate && typeof supabase !== 'undefined') {
      // Fetch from Supabase if not in localStorage
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser?.created_at) {
          joinDate = freshUser.created_at;
          // Update localStorage with the created_at
          user.created_at = joinDate;
          localStorage.setItem('gbf_user', JSON.stringify(user));
        }
      } catch (e) {
        console.log('Could not fetch user data from Supabase');
      }
    }
    
    if (joinDate) {
      const date = new Date(joinDate);
      const formatted = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      document.getElementById('join-date').textContent = formatted;
    }
    
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function loadUserTournaments() {
  const token = localStorage.getItem('gbf_token');
  const user = JSON.parse(localStorage.getItem('gbf_user') || '{}');
  const container = document.getElementById('tournament-sections');
  
  if (!container) return;
  
  try {
    // Get all tournaments user is entered in
    const response = await fetch('/api/tournaments?status=live', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load tournaments');
    
    const data = await response.json();
    
    if (!data.tournaments || data.tournaments.length === 0) {
      container.innerHTML = '<p class="text-muted">No active tournaments. Join one below!</p>';
      return;
    }
    
    // Build HTML for each tournament
    let tournamentsHTML = '';
    
    for (const tournament of data.tournaments) {
      // Check if user is entered in this tournament
      const lbResponse = await fetch(`/api/tournaments?leaderboard=true&tournament_id=${tournament.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let userEntry = null;
      if (lbResponse.ok) {
        const lbData = await lbResponse.json();
        userEntry = lbData.leaderboard?.find(e => e.user_id === user.id);
      }
      
      const isEntered = !!userEntry;
      
      // Calculate stats for entered tournaments
      let predictionsCount = '--';
      let resultPct = '--%';
      let scorePct = '--%';
      
      if (isEntered) {
        try {
          const predResponse = await fetch(`/api/predictions?gameweek=${tournament.gameweek}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (predResponse.ok) {
            const predData = await predResponse.json();
            // Count predictions for matches in this tournament's gameweek
            const gameweekMatchIds = new Set((predData.matches || []).map(m => m.id));
            const tournamentPreds = (predData.predictions || []).filter(p => 
              gameweekMatchIds.has(p.match_id)
            );
            predictionsCount = tournamentPreds.length;
            
            // Calculate Result % and Score %
            const finishedMatches = (predData.matches || []).filter(m => m.status === 'finished');
            const finishedPreds = tournamentPreds.filter(p => 
              finishedMatches.some(m => m.id === p.match_id)
            );
            const correctResults = finishedPreds.filter(p => (p.points_earned || 0) >= 10).length;
            const correctScores = finishedPreds.filter(p => (p.points_earned || 0) === 20).length;
            resultPct = finishedPreds.length > 0 
              ? Math.round((correctResults / finishedPreds.length) * 100) + '%' 
              : '--%';
            scorePct = finishedPreds.length > 0 
              ? Math.round((correctScores / finishedPreds.length) * 100) + '%' 
              : '--%';
          }
        } catch (e) {
          console.log('Could not fetch predictions for tournament', tournament.id);
        }
      }
      
      tournamentsHTML += `
        <div class="tournament-section mb-3">
          <!-- Tournament Header -->
          <div class="card mb-2" style="background: linear-gradient(135deg, var(--accent-green) 0%, var(--accent-blue) 100%); color: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem;">
              <div>
                <h2 style="margin: 0; font-size: 1.5rem;">${tournament.name}</h2>
                <p style="margin: 0.25rem 0 0 0; opacity: 0.9;">
                  <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem;">${tournament.status.toUpperCase()}</span>
                  ${isEntered ? '<span style="margin-left: 0.5rem;"><i class="fas fa-check-circle"></i> ENTERED</span>' : ''}
                </p>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.25rem; font-weight: 700;">GW${tournament.gameweek}</div>
                <div style="font-size: 0.875rem; opacity: 0.9;">Gameweek</div>
              </div>
            </div>
          </div>
          
          <!-- Tournament Stats -->
          <div class="profile-stats mb-3">
            <div class="profile-stat">
              <div class="profile-stat-value">${isEntered ? (userEntry.entry_points || 0) : '--'}</div>
              <div class="profile-stat-label">Tournament Points</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value">${isEntered && userEntry.rank ? '#' + userEntry.rank : '--'}</div>
              <div class="profile-stat-label">Tournament Rank</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value">${predictionsCount}</div>
              <div class="profile-stat-label">Predictions Made</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value">${resultPct}</div>
              <div class="profile-stat-label">Result %</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value">${scorePct}</div>
              <div class="profile-stat-label">Score %</div>
            </div>
          </div>
          
          ${!isEntered ? `
            <div style="text-align: center; margin-bottom: 1rem;">
              <button class="btn btn-green btn-lg" onclick="enterTournament('${tournament.id}')">
                <i class="fas fa-ticket-alt"></i> Enter Now - £${tournament.entry_fee}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }
    
    container.innerHTML = tournamentsHTML;
    
  } catch (error) {
    console.error('Error loading tournaments:', error);
    container.innerHTML = '<p class="text-muted">Error loading tournaments.</p>';
  }
}

async function enterTournament(tournamentId) {
  const token = localStorage.getItem('gbf_token');
  
  if (!confirm('Enter this tournament?')) return;
  
  try {
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'join', tournament_id: tournamentId })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to enter');
    }
    
    alert('Successfully entered tournament!');
    window.location.reload();
    
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Global cache for predictions data
let cachedPredictionsData = null;

async function loadUserPredictions() {
  const token = localStorage.getItem('gbf_token');
  const container = document.getElementById('current-predictions');
  
  if (!container) return null;
  
  try {
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    const gameweek = gwData.current_gameweek || 35;
    
    const response = await fetch(`/api/predictions?gameweek=${gameweek}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load predictions');
    
    const data = await response.json();
    cachedPredictionsData = data; // Cache for other functions
    
    if (!data.predictions || data.predictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-futbol"></i>
          <p>No predictions yet for GW${gameweek}</p>
          <a href="predictions.html" class="btn btn-primary btn-sm" style="margin-top: 1rem;">
            <i class="fas fa-edit"></i> Make Predictions
          </a>
        </div>
      `;
      return data;
    }
    
    // Show submitted predictions list
    let predictionsHTML = '<div style="max-height: 300px; overflow-y: auto;">';
    data.predictions.forEach((pred) => {
      const match = data.matches.find(m => m.id === pred.match_id);
      if (match) {
        const isFinished = match.status === 'finished';
        const points = pred.points_earned || 0;
        const pointsColor = points >= 20 ? '#22c55e' : points >= 10 ? '#f59e0b' : 'rgba(255,255,255,0.4)';
        
        let resultLine = '';
        if (isFinished) {
          const actualResult = match.home_score + '-' + match.away_score;
          const checkmark = points > 0 ? '✓' : '✗';
          resultLine = `<div style="font-size: 0.875rem; color: ${pointsColor};">Result: ${actualResult} ${checkmark} ${points}pts</div>`;
        } else {
          resultLine = `<div style="font-size: 0.875rem; color: rgba(255,255,255,0.4);">Not played yet</div>`;
        }
        
        predictionsHTML += `
          <div style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
            <div style="font-weight: 600;">${match.home_team} vs ${match.away_team}</div>
            <div class="text-muted" style="font-size: 0.875rem;">Your prediction: ${pred.predicted_result} | ${pred.home_score}-${pred.away_score}</div>
            ${resultLine}
          </div>
        `;
      }
    });
    predictionsHTML += '</div>';
    
    container.innerHTML = predictionsHTML;
    
    return data;
    
  } catch (error) {
    console.error('Error loading predictions:', error);
    container.innerHTML = `<div class="empty-state"><p>Error: ${error.message}</p></div>`;
    return null;
  }
}

// Global variables for chart and data
let performanceChart = null;
let currentChartMode = 'points';

// SECTION 1: Performance Graph
async function loadPerformanceGraph() {
  const token = localStorage.getItem('gbf_token');
  const container = document.getElementById('performance-chart-container');
  const emptyState = document.getElementById('performance-empty');
  
  if (!container) return;
  
  try {
    // Get user's tournaments
    const response = await fetch('/api/tournaments?status=live', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load tournaments');
    
    const data = await response.json();
    const tournaments = data.tournaments || [];
    
    if (tournaments.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    
    // Collect gameweek data for each tournament
    const tournamentData = [];
    const colors = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6'];
    
    for (let i = 0; i < tournaments.length; i++) {
      const tournament = tournaments[i];
      const gwData = await fetchGameweekData(tournament.gameweek, token);
      
      if (gwData && gwData.predictions) {
        tournamentData.push({
          name: tournament.name,
          gameweek: tournament.gameweek,
          points: gwData.totalPoints || 0,
          color: colors[i % colors.length]
        });
      }
    }
    
    // Need at least 2 gameweeks for a meaningful graph
    const uniqueGWs = [...new Set(tournamentData.map(t => t.gameweek))];
    if (uniqueGWs.length < 2 && tournamentData.length < 2) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <i class="fas fa-chart-bar"></i>
        <p>More data coming as gameweeks complete</p>
      `;
      return;
    }
    
    container.style.display = 'block';
    emptyState.style.display = 'none';
    
    renderPerformanceChart(tournamentData);
    
  } catch (error) {
    console.error('Error loading performance graph:', error);
    container.style.display = 'none';
    emptyState.style.display = 'block';
  }
}

async function fetchGameweekData(gameweek, token) {
  try {
    const response = await fetch(`/api/predictions?gameweek=${gameweek}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const predictions = data.predictions || [];
    const totalPoints = predictions.reduce((sum, p) => sum + (p.points_earned || 0), 0);
    
    return { ...data, totalPoints };
  } catch (e) {
    return null;
  }
}

function renderPerformanceChart(tournamentData) {
  const ctx = document.getElementById('performanceChart');
  if (!ctx) return;
  
  // Group by gameweek
  const gameweeks = [...new Set(tournamentData.map(t => t.gameweek))].sort();
  
  const datasets = tournamentData.map((t, index) => ({
    label: t.name,
    data: gameweeks.map(gw => t.gameweek === gw ? t.points : null),
    borderColor: t.color,
    backgroundColor: t.color + '20',
    tension: 0.4,
    fill: false
  }));
  
  if (performanceChart) {
    performanceChart.destroy();
  }
  
  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: gameweeks.map(gw => `GW${gw}`),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 200,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#94a3b8' }
        }
      }
    }
  });
}

function switchChart(mode) {
  currentChartMode = mode;
  document.getElementById('toggle-points').classList.toggle('active', mode === 'points');
  document.getElementById('toggle-rank').classList.toggle('active', mode === 'rank');
  // Re-render with new mode (rank mode would need leaderboard data)
  loadPerformanceGraph();
}

// SECTION 2: Prediction History Table
async function loadPredictionHistory() {
  const container = document.getElementById('prediction-history-container');
  
  if (!container) return;
  
  try {
    // Use cached data from loadUserPredictions
    const data = cachedPredictionsData;
    if (!data) {
      container.innerHTML = '<p class="text-muted">Loading...</p>';
      return;
    }
    
    const predictions = data.predictions || [];
    const matches = data.matches || [];
    
    if (predictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-futbol"></i>
          <p>No predictions yet</p>
        </div>
      `;
      return;
    }
    
    // Build table
    let tableHTML = `
      <div style="overflow-x: auto;">
        <table class="prediction-table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color);">
              <th style="text-align: left; padding: 0.75rem;">Match</th>
              <th style="text-align: center; padding: 0.75rem;">Your Pick</th>
              <th style="text-align: center; padding: 0.75rem;">Result</th>
              <th style="text-align: center; padding: 0.75rem;">Points</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    let totalPoints = 0;
    let correctResults = 0;
    let correctScores = 0;
    
    predictions.forEach(pred => {
      const match = matches.find(m => m.id === pred.match_id);
      if (!match) return;
      
      const points = pred.points_earned || 0;
      totalPoints += points;
      if (points >= 10) correctResults++;
      if (points === 20) correctScores++;
      
      const pointsColor = points >= 20 ? '#22c55e' : points >= 10 ? '#f59e0b' : '#64748b';
      const isFinished = match.status === 'finished';
      const actualResult = isFinished ? `${match.home_score}-${match.away_score}` : '-';
      
      tableHTML += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <td style="padding: 0.75rem;">${match.home_team} vs ${match.away_team}</td>
          <td style="text-align: center; padding: 0.75rem;">${pred.predicted_result} (${pred.home_score}-${pred.away_score})</td>
          <td style="text-align: center; padding: 0.75rem;">${actualResult}</td>
          <td style="text-align: center; padding: 0.75rem; color: ${pointsColor}; font-weight: 600;">${points}pts</td>
        </tr>
      `;
    });
    
    tableHTML += `
          </tbody>
          <tfoot>
            <tr style="background: var(--bg-hover); font-weight: 600;">
              <td style="padding: 0.75rem;" colspan="2">Total: ${predictions.length} predictions</td>
              <td style="text-align: center; padding: 0.75rem;">${correctResults} correct</td>
              <td style="text-align: center; padding: 0.75rem; color: var(--accent-green);">${totalPoints}pts</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    
    container.innerHTML = tableHTML;
    
  } catch (error) {
    console.error('Error loading prediction history:', error);
    container.innerHTML = `<div class="empty-state"><p>Error loading history</p></div>`;
  }
}

// SECTION 3: Achievements
async function loadAchievements() {
  const container = document.getElementById('achievements');
  
  if (!container) return;
  
  try {
    // Use cached data from loadUserPredictions
    const data = cachedPredictionsData;
    if (!data) {
      container.innerHTML = '<p class="text-muted">Loading...</p>';
      return;
    }
    
    const predictions = data.predictions || [];
    const matches = data.matches || [];
    
    // Calculate achievements
    const achievements = [
      {
        id: 'first-prediction',
        icon: '🎯',
        name: 'First Prediction',
        earned: predictions.length > 0
      },
      {
        id: 'perfect-score',
        icon: '💯',
        name: 'Perfect Score',
        earned: predictions.some(p => p.points_earned === 20)
      },
      {
        id: 'hat-trick',
        icon: '🎩',
        name: 'Hat-trick',
        earned: checkConsecutiveCorrect(predictions, matches, 3)
      },
      {
        id: 'on-fire',
        icon: '🔥',
        name: 'On Fire',
        earned: checkConsecutiveCorrect(predictions, matches, 5)
      },
      {
        id: 'sharp-shooter',
        icon: '🔫',
        name: 'Sharp Shooter',
        earned: predictions.filter(p => p.points_earned === 20).length >= 5
      },
      {
        id: 'top-10',
        icon: '⭐',
        name: 'Top 10 Finish',
        earned: false // Would need tournament history
      },
      {
        id: 'top-of-week',
        icon: '👑',
        name: 'Top of the Week',
        earned: false // Would need to compare with all users
      }
    ];
    
    let html = '';
    achievements.forEach(ach => {
      const earnedClass = ach.earned ? 'earned' : '';
      const opacity = ach.earned ? '1' : '0.4';
      html += `
        <div class="achievement-badge ${earnedClass}" style="opacity: ${opacity};">
          <div class="achievement-icon">${ach.icon}</div>
          <div class="achievement-name">${ach.name}</div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Error loading achievements:', error);
    container.innerHTML = '<p class="text-muted">Could not load achievements</p>';
  }
}

function checkConsecutiveCorrect(predictions, matches, count) {
  // Sort predictions by match kickoff time
  const sortedPreds = predictions
    .filter(p => (p.points_earned || 0) >= 10)
    .map(p => {
      const match = matches.find(m => m.id === p.match_id);
      return { ...p, kickoff: match?.kickoff_time || '9999' };
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  
  if (sortedPreds.length < count) return false;
  
  // Check for consecutive correct predictions
  let consecutive = 1;
  for (let i = 1; i < sortedPreds.length; i++) {
    if ((sortedPreds[i].points_earned || 0) >= 10) {
      consecutive++;
      if (consecutive >= count) return true;
    } else {
      consecutive = 0;
    }
  }
  
  return false;
}

// SECTION 4: Detailed Insights
async function loadInsights() {
  const container = document.getElementById('insights');
  
  if (!container) return;
  
  try {
    // Use cached data from loadUserPredictions
    const predictions = data.predictions || [];
    const matches = data.matches || [];
    
    if (predictions.length === 0) {
      container.innerHTML = '<p class="text-muted">Make predictions to see insights</p>';
      return;
    }
    
    // Calculate insights
    const finishedPreds = predictions.filter(p => {
      const match = matches.find(m => m.id === p.match_id);
      return match && match.status === 'finished';
    });
    
    const pointsArray = finishedPreds.map(p => p.points_earned || 0);
    const bestGW = pointsArray.length > 0 ? Math.max(...pointsArray) : 0;
    const worstGW = pointsArray.length > 0 ? Math.min(...pointsArray) : 0;
    const avgPoints = pointsArray.length > 0 
      ? Math.round(pointsArray.reduce((a, b) => a + b, 0) / pointsArray.length) 
      : 0;
    
    // Favourite result distribution
    const resultCounts = { H: 0, X: 0, A: 0 };
    predictions.forEach(p => {
      if (resultCounts[p.predicted_result] !== undefined) {
        resultCounts[p.predicted_result]++;
      }
    });
    const total = predictions.length;
    const favResult = Object.entries(resultCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Accuracy by result type
    const accuracyByResult = {};
    ['H', 'X', 'A'].forEach(result => {
      const resultPreds = finishedPreds.filter(p => p.predicted_result === result);
      const correct = resultPreds.filter(p => (p.points_earned || 0) >= 10).length;
      accuracyByResult[result] = resultPreds.length > 0 
        ? Math.round((correct / resultPreds.length) * 100) 
        : 0;
    });
    
    container.innerHTML = `
      <div class="insight-card best">
        <div class="insight-label">Best Prediction</div>
        <div class="insight-value">${bestGW}pts</div>
      </div>
      <div class="insight-card worst">
        <div class="insight-label">Worst Prediction</div>
        <div class="insight-value">${worstGW}pts</div>
      </div>
      <div class="insight-card neutral">
        <div class="insight-label">Average Points</div>
        <div class="insight-value">${avgPoints}pts</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Favourite Pick</div>
        <div class="insight-value">${favResult}</div>
        <div class="insight-detail">${Math.round((resultCounts[favResult] / total) * 100)}% of picks</div>
      </div>
      <div class="insight-card" style="grid-column: span 2;">
        <div class="insight-label">Accuracy by Prediction Type</div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
          <div style="flex: 1; text-align: center; padding: 0.5rem; background: rgba(59, 130, 246, 0.2); border-radius: 0.5rem;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #3b82f6;">${accuracyByResult.H}%</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Home Wins</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 0.5rem; background: rgba(245, 158, 11, 0.2); border-radius: 0.5rem;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #f59e0b;">${accuracyByResult.X}%</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Draws</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 0.5rem; background: rgba(239, 68, 68, 0.2); border-radius: 0.5rem;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #ef4444;">${accuracyByResult.A}%</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Away Wins</div>
          </div>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Error loading insights:', error);
    container.innerHTML = '<p class="text-muted">Could not load insights</p>';
  }
}

// Initialize all sections on page load
document.addEventListener('DOMContentLoaded', async function() {
  await loadProfile();
  await loadUserTournaments();
  await loadUserPredictions();
  await loadPerformanceGraph();
  await loadPredictionHistory();
  await loadAchievements();
  await loadInsights();
});