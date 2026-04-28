// Admin panel JavaScript
document.addEventListener('DOMContentLoaded', function() {
  // Check admin access
  checkAdminAccess();
  
  // Load initial status
  refreshStatus();
});

async function checkAdminAccess() {
  const token = localStorage.getItem('gbf_token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  
  // TODO: Check if user is admin
  // For now, allow any logged in user
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/admin-stats');
    const data = await response.json();
    
    document.getElementById('total-matches').textContent = data.matches || 0;
    document.getElementById('total-predictions').textContent = data.predictions || 0;
    
    // Get current gameweek
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    
    document.getElementById('api-gw').textContent = gwData.current_gameweek || 'N/A';
    document.getElementById('next-gw').textContent = gwData.next_gameweek || 'N/A';
    document.getElementById('deadline').textContent = gwData.deadline ? new Date(gwData.deadline).toLocaleString() : 'N/A';
    
  } catch (error) {
    console.error('Error refreshing status:', error);
  }
}

async function launchTournament() {
  if (!confirm('Launch new tournament? This will:\n1. Sync current GW fixtures from FPL\n2. Create £20 entry tournament\n3. Open for user registrations')) {
    return;
  }
  
  log('Launching tournament...', 'info');
  
  try {
    const token = localStorage.getItem('gbf_token');
    
    // Step 1: Sync fixtures
    log('Syncing fixtures from FPL API...');
    const syncResponse = await fetch('/api/sync-fixtures', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!syncResponse.ok) {
      throw new Error('Failed to sync fixtures');
    }
    
    const syncData = await syncResponse.json();
    log(`Synced ${syncData.matches?.length || 0} matches`);
    
    // Step 2: Create tournament
    log('Creating tournament...');
    const tournamentResponse = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `GW Tournament - £20 Entry`,
        entry_fee: 20,
        prize_pool: 0,
        gameweek: syncData.gameweek || 34,
        max_entries: 100,
        closes_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
    });
    
    if (!tournamentResponse.ok) {
      throw new Error('Failed to create tournament');
    }
    
    const tournamentData = await tournamentResponse.json();
    log(`Tournament created: ${tournamentData.tournament?.name}`, 'success');
    
    // Step 3: Update settings
    await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        key: 'tournament_active',
        value: 'true'
      })
    });
    
    log('Tournament launched successfully!', 'success');
    alert('Tournament launched! Users can now register and enter.');
    
    refreshStatus();
    
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    alert('Failed to launch tournament: ' + error.message);
  }
}

async function syncFixtures() {
  const gwSelect = document.getElementById('sync-gw-select');
  const gameweek = gwSelect ? gwSelect.value : '';
  
  log(`Syncing fixtures${gameweek ? ` for GW ${gameweek}` : ''}...`);
  
  try {
    const token = localStorage.getItem('gbf_token');
    const url = gameweek ? `/api/sync-fixtures?gameweek=${gameweek}` : '/api/sync-fixtures';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Sync failed');
    }
    
    const data = await response.json();
    log(`Synced ${data.matches?.length || 0} matches`, 'success');
    refreshStatus();
    
  } catch (error) {
    log(`Sync error: ${error.message}`, 'error');
  }
}

async function syncLiveScores() {
  log('Updating live scores...');
  
  try {
    const token = localStorage.getItem('gbf_token');
    const response = await fetch('/api/live-scores', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to update scores');
    }
    
    const data = await response.json();
    log(`Updated ${data.updated?.length || 0} matches`, 'success');
    
  } catch (error) {
    log(`Live scores error: ${error.message}`, 'error');
  }
}

async function finalisePoints() {
  if (!confirm('Finalise all points for current gameweek?')) return;
  
  log('Finalising points...');
  
  try {
    const token = localStorage.getItem('gbf_token');
    const response = await fetch('/api/gameweek-transition', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to finalise points');
    }
    
    const data = await response.json();
    log(`Points finalised: ${data.actions?.join(', ')}`, 'success');
    
  } catch (error) {
    log(`Finalise error: ${error.message}`, 'error');
  }
}

function log(message, type = 'info') {
  const logOutput = document.getElementById('log-output');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logOutput.appendChild(entry);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLog() {
  document.getElementById('log-output').innerHTML = '<div class="log-entry">Log cleared.</div>';
}