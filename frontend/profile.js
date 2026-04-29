// Profile page JavaScript
document.addEventListener('DOMContentLoaded', async function() {
  await loadProfile();
  await loadActiveTournament();
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
    
    // Fetch full user stats
    const response = await fetch('/api/leaderboard?limit=100', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      const userEntry = data.leaderboard?.find(e => e.user.id === user.id);
      
      // Tournament stats will be loaded by loadActiveTournament
      // Global stats removed - not relevant for tournament mode
    }
    
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function loadActiveTournament() {
  const token = localStorage.getItem('gbf_token');
  const container = document.getElementById('active-tournament');
  
  try {
    // Check for active tournament
    const response = await fetch('/api/tournaments?status=live', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load tournaments');
    
    const data = await response.json();
    const tournament = data.tournaments?.[0];
    
    if (!tournament) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-trophy"></i>
          <p>No active tournament</p>
        </div>
      `;
      return;
    }
    
    // Fetch leaderboard to get user's rank and stats
    let userRank = null;
    let userPoints = 0;
    try {
      const lbResponse = await fetch(`/api/tournaments?leaderboard=true&tournament_id=${tournament.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (lbResponse.ok) {
        const lbData = await lbResponse.json();
        const userEntry = lbData.leaderboard?.find(e => e.user_id === JSON.parse(localStorage.getItem('gbf_user')).id);
        if (userEntry) {
          userRank = userEntry.rank;
          userPoints = userEntry.entry_points || 0;
        }
        
        // Update tournament stats
        document.getElementById('stat-tournament-points').textContent = userPoints;
        document.getElementById('stat-tournament-rank').textContent = userRank ? '#' + userRank : '--';
      }
    } catch (e) {
      console.error('Error fetching leaderboard:', e);
    }
    
    // Check if user is already entered
    const isEntered = tournament.current_entries > 0;
    
    if (isEntered) {
      container.innerHTML = `
        <div style="text-align: center; padding: 1rem;">
          <h4 style="margin-bottom: 0.5rem; color: var(--accent-green);">
            <i class="fas fa-check-circle"></i> Entered
          </h4>
          <p style="font-size: 1.25rem; font-weight: 600;">${tournament.name}</p>
          <p class="text-muted">Entry Fee: £${tournament.entry_fee}</p>
          ${userRank ? `<p style="font-size: 1.5rem; font-weight: 700; color: var(--accent-amber);">Rank #${userRank}</p>` : ''}
          <div style="margin-top: 1rem;">
            <a href="predictions.html" class="btn btn-primary">
              <i class="fas fa-futbol"></i> Edit Predictions
            </a>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 1rem;">
          <h4 style="margin-bottom: 0.5rem;">${tournament.name}</h4>
          <p style="font-size: 1.5rem; font-weight: 700; color: var(--accent-green);">
            £${tournament.entry_fee} Entry
          </p>
          <p class="text-muted">4 Week Tournament</p>
          <div style="margin-top: 1rem;">
            <button class="btn btn-green btn-lg" onclick="enterTournament('${tournament.id}')">
              <i class="fas fa-ticket-alt"></i> Enter Now - £${tournament.entry_fee}
            </button>
          </div>
        </div>
      `;
    }
    
  } catch (error) {
    console.error('Error loading tournament:', error);
    // Silently fail - don't show error to user
    container.innerHTML = `
      <div style="text-align: center; padding: 1rem;">
        <h4 style="margin-bottom: 0.5rem;">GW35 Tournament - £20 Entry</h4>
        <p style="font-size: 1.5rem; font-weight: 700; color: var(--accent-green);">
          £20 Entry
        </p>
        <p class="text-muted">4 Week Tournament</p>
        <div style="margin-top: 1rem;">
          <button class="btn btn-green btn-lg" onclick="enterTournament('1')">
            <i class="fas fa-ticket-alt"></i> Enter Now - £20
          </button>
        </div>
      </div>
    `;
  }
}

async function enterTournament(tournamentId) {
  const token = localStorage.getItem('gbf_token');
  
  console.log('Token from localStorage:', token ? token.substring(0, 20) + '...' : 'NULL');
  
  if (!token) {
    alert('Not logged in. Please log in again.');
    window.location.href = '/login.html';
    return;
  }
  
  if (!confirm('Enter this tournament for £20?\n\nPayment processing will be added soon.')) {
    return;
  }
  
  try {
    console.log('Sending request with token...');
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'join',
        tournament_id: tournamentId 
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      let errorMsg = 'Failed to enter tournament';
      try {
        const errorData = JSON.parse(text);
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        errorMsg = text || errorMsg;
      }
      throw new Error(errorMsg);
    }
    
    alert('Successfully entered tournament!');
    
    // Redirect to predictions
    window.location.href = '/predictions.html';
    
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function loadUserPredictions() {
  const token = localStorage.getItem('gbf_token');
  const container = document.getElementById('current-predictions');
  
  try {
    // Get current gameweek
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    const gameweek = gwData.next_gameweek || gwData.current_gameweek || 35;
    
    // Get predictions
    const response = await fetch(`/api/predictions?gameweek=${gameweek}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load predictions');
    
    const data = await response.json();
    
    // Update predictions count stat
    document.getElementById('stat-predictions').textContent = data.predictions?.length || 0;
    
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
      return;
    }
    
    // Show submitted predictions list
    let predictionsHTML = '<div style="max-height: 300px; overflow-y: auto;">';
    data.predictions.forEach((pred, index) => {
      const match = data.matches.find(m => m.id === pred.match_id);
      if (match) {
        predictionsHTML += `
          <div style="padding: 0.75rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600;">${match.home_team} vs ${match.away_team}</div>
              <div class="text-muted" style="font-size: 0.875rem;">Result: ${pred.predicted_result} | Score: ${pred.home_score}-${pred.away_score}</div>
            </div>
            <i class="fas fa-check-circle text-green"></i>
          </div>
        `;
      }
    });
    predictionsHTML += '</div>';
    predictionsHTML += `
      <div style="text-align: center; margin-top: 1rem;">
        <a href="predictions.html" class="btn btn-primary btn-sm">
          <i class="fas fa-edit"></i> Edit Predictions
        </a>
      </div>
    `;
    
    container.innerHTML = predictionsHTML;
    
  } catch (error) {
    console.error('Error loading predictions:', error);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error loading predictions</p>
      </div>
    `;
  }
}