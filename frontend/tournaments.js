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
    
    data.tournaments.forEach(tournament => {
      tournamentsHTML += `
        <div class="tournament-card live" style="padding: 2rem; border: 2px solid var(--accent-green); margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
            <span class="tournament-status live">Live</span>
            <span class="text-muted"><i class="far fa-clock"></i> ${tournament.time_remaining || 'Open'}</span>
          </div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${tournament.name}</h2>
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
            <a href="profile.html" class="btn btn-green">
              <i class="fas fa-ticket-alt"></i> Enter Tournament
            </a>
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