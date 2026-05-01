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

async function loadUserPredictions() {
  const token = localStorage.getItem('gbf_token');
  const container = document.getElementById('current-predictions');
  
  if (!container) return;
  
  try {
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    const gameweek = gwData.next_gameweek || gwData.current_gameweek || 35;
    
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
    
  } catch (error) {
    console.error('Error loading predictions:', error);
    container.innerHTML = `<div class="empty-state"><p>Error: ${error.message}</p></div>`;
  }
}