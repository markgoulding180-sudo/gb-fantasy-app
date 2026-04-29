// Tournaments page - Load live tournaments
document.addEventListener('DOMContentLoaded', async function() {
  await loadTournaments();
});

async function loadTournaments() {
  const container = document.getElementById('tournaments-list');
  if (!container) return;
  
  const token = localStorage.getItem('gbf_token');
  
  try {
    const response = await fetch('/api/tournaments?status=live');
    const data = await response.json();
    
    if (!data.tournaments || data.tournaments.length === 0) {
      container.innerHTML = '<p class="text-muted">No active tournaments. Check back soon!</p>';
      return;
    }
    
    // Build HTML for all tournaments
    let tournamentsHTML = '';
    
    // Get current user info
    const user = JSON.parse(localStorage.getItem('gbf_user') || '{}');
    
    data.tournaments.forEach(tournament => {
      // Check if user is entered (simplified check - in production query tournament_entries)
      const isEntered = tournament.current_entries > 0 && user.display_name;
      
      tournamentsHTML += `
        <div class="tournament-card live" style="padding: 2rem; border: 2px solid var(--accent-green); margin-bottom: 1rem; position: relative;">
          ${isEntered ? `
            <div class="user-badge-container" style="position: absolute; top: 1rem; right: 1rem; text-align: center;">
              <img src="assets/user-badge.png" alt="Entered" class="user-badge-img" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent-green);">
              <div class="user-badge-name" style="font-weight: 600; color: var(--accent-green); margin-top: 0.5rem; font-size: 0.875rem;">${user.display_name}</div>
            </div>
          ` : ''}
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; ${isEntered ? 'padding-right: 100px;' : ''}">
            <span class="tournament-status live">Live</span>
            <span class="text-muted"><i class="far fa-clock"></i> ${tournament.time_remaining || 'Open'}</span>
          </div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; ${isEntered ? 'padding-right: 100px;' : ''}">${tournament.name}</h2>
          <div style="display: flex; gap: 2rem; margin-top: 1rem;">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--accent-green);">£${tournament.prize_pool || 0}</div>
              <div class="text-muted" style="font-size: 0.75rem;">Prize Pool</div>
            </div>
            <div>
              <div style="font-size: 1.25rem; font-weight: 700;">£${tournament.entry_fee}</div>
              <div class="text-muted" style="font-size: 0.75rem;">Entry Fee</div>
            </div>
            <div>
              <div style="font-size: 1.25rem; font-weight: 700;">${tournament.current_entries || 0}</div>
              <div class="text-muted" style="font-size: 0.75rem;">Entries</div>
            </div>
          </div>
          <div style="margin-top: 1rem;">
            ${isEntered 
              ? `<div style="color: var(--accent-green); font-weight: 600;"><i class="fas fa-check-circle"></i> Entered</div>`
              : `<button class="btn btn-green" onclick="enterTournamentFromList('${tournament.id}')"><i class="fas fa-ticket-alt"></i> Enter Tournament</button>`
            }
          </div>
        </div>
      `;
    });
    
    container.innerHTML = tournamentsHTML;
    
  } catch (error) {
    console.error('Error loading tournaments:', error);
    container.innerHTML = '<p class="text-muted">Error loading tournaments. Please refresh.</p>';
  }
}

async function enterTournamentFromList(tournamentId) {
  const token = localStorage.getItem('gbf_token');
  
  if (!confirm('Enter this tournament?\n\nYou will use your existing GW35 predictions.')) {
    return;
  }
  
  try {
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
      const error = await response.json();
      throw new Error(error.error || 'Failed to enter tournament');
    }
    
    alert('Successfully entered tournament!');
    window.location.reload();
    
  } catch (error) {
    alert('Error: ' + error.message);
  }
}