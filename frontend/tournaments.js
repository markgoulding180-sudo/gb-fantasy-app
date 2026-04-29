// Tournaments page - Load live tournaments
document.addEventListener('DOMContentLoaded', async function() {
  await loadTournaments();
});

async function loadTournaments() {
  const container = document.getElementById('tournaments-list');
  if (!container) return;
  
  try {
    const response = await fetch('/api/tournaments?status=live');
    const data = await response.json();
    
    if (!data.tournaments || data.tournaments.length === 0) {
      container.innerHTML = '<p class="text-muted">No active tournaments. Check back soon!</p>';
      return;
    }
    
    // Show only the first (main) tournament
    const tournament = data.tournaments[0];
    
    container.innerHTML = `
      <div class="tournament-card live" style="padding: 2rem; border: 2px solid var(--accent-green);">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <span class="tournament-status live">Live</span>
          <span class="text-muted"><i class="far fa-clock"></i> ${tournament.time_remaining || 'Open'}</span>
        </div>
        <h2 style="font-size: 1.75rem; margin-bottom: 0.5rem;">${tournament.name}</h2>
        <div style="display: flex; gap: 2rem; margin-top: 1.5rem;">
          <div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-green);">£${tournament.prize_pool || 0}</div>
            <div class="text-muted" style="font-size: 0.875rem;">Prize Pool</div>
          </div>
          <div>
            <div style="font-size: 1.5rem; font-weight: 700;">£${tournament.entry_fee}</div>
            <div class="text-muted" style="font-size: 0.875rem;">Entry Fee</div>
          </div>
          <div>
            <div style="font-size: 1.5rem; font-weight: 700;">${tournament.current_entries || 0}</div>
            <div class="text-muted" style="font-size: 0.875rem;">Entries</div>
          </div>
        </div>
        <div style="margin-top: 1.5rem;">
          <a href="profile.html" class="btn btn-green btn-lg">
            <i class="fas fa-ticket-alt"></i> Enter Tournament
          </a>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Error loading tournaments:', error);
    container.innerHTML = '<p class="text-muted">Error loading tournaments. Please refresh.</p>';
  }
}