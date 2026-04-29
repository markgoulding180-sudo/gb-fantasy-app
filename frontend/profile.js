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
      
      if (userEntry) {
        document.getElementById('stat-points').textContent = userEntry.total_points || 0;
        document.getElementById('stat-rank').textContent = '#' + (userEntry.rank || '--');
        document.getElementById('stat-correct').textContent = userEntry.correct_scores || 0;
        
        // Calculate accuracy
        const accuracy = userEntry.total_predictions > 0 
          ? Math.round((userEntry.correct_results / userEntry.total_predictions) * 100)
          : 0;
        document.getElementById('stat-accuracy').textContent = accuracy + '%';
      }
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
    
    // Always show enter button for now (simplified)
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