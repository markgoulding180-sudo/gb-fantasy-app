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
    
    // Get Master Clock
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    
    if (gwData.error) {
      // Master clock not initialized
      document.getElementById('api-gw').textContent = 'Not Set';
      document.getElementById('next-gw').textContent = '⚠️ Initialize Master Clock';
      document.getElementById('next-gw').style.color = 'var(--accent-amber)';
      document.getElementById('deadline').textContent = 'N/A';
      return;
    }
    
    document.getElementById('api-gw').textContent = gwData.last_finalised_gameweek || 'None';
    document.getElementById('next-gw').textContent = `GW${gwData.current_gameweek}`;
    document.getElementById('next-gw').style.color = '';
    document.getElementById('deadline').textContent = gwData.deadline ? new Date(gwData.deadline).toLocaleString() : 'N/A';
    
    // Update labels
    const lastCompletedLabel = document.querySelector('#status-panel .admin-status-item:nth-child(1) span');
    const nextGWLabel = document.querySelector('#status-panel .admin-status-item:nth-child(2) span');
    if (lastCompletedLabel) lastCompletedLabel.textContent = 'Last Finalised:';
    if (nextGWLabel) nextGWLabel.textContent = 'Current GW (Master Clock):';
    
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
    
    // Get current gameweek first
    log('Getting current gameweek...');
    const gwResponse = await fetch('/api/current-gameweek');
    const gwData = await gwResponse.json();
    const currentGameweek = gwData.current_gameweek || 35;
    log(`Current gameweek: ${currentGameweek}`);
    
    // Step 1: Sync fixtures
    log('Syncing fixtures from FPL API...');
    const syncResponse = await fetch('/api/sync-fixtures', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    log(`Sync response status: ${syncResponse.status}`);
    
    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      log(`Sync error: ${errorText}`, 'error');
      throw new Error('Failed to sync fixtures: ' + syncResponse.status);
    }
    
    const syncData = await syncResponse.json();
    log(`Synced ${syncData.matches?.length || 0} matches`, 'success');
    
    // Step 2: Create tournament
    log('Creating tournament...');
    const tournamentName = document.getElementById('tournament-name-input')?.value || `GW${currentGameweek} Tournament`;
    const entryFee = parseInt(document.getElementById('tournament-fee-input')?.value) || 20;
    const startGameweek = parseInt(document.getElementById('tournament-start-gw')?.value) || currentGameweek;
    const endGameweek = parseInt(document.getElementById('tournament-end-gw')?.value) || currentGameweek;
    
    const tournamentResponse = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'create',
        name: tournamentName,
        entry_fee: entryFee,
        prize_pool: 0,
        gameweek: startGameweek,
        end_gameweek: endGameweek,
        max_entries: 100,
        closes_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
    });
    
    if (!tournamentResponse.ok) {
      const errorData = await tournamentResponse.json();
      log(`Tournament error: ${JSON.stringify(errorData)}`, 'error');
      throw new Error(errorData.details || errorData.error || 'Failed to create tournament');
    }
    
    const tournamentData = await tournamentResponse.json();
    log(`Tournament created: ${tournamentData.tournament?.name}`, 'success');
    
    log('Tournament launched successfully!', 'success');
    alert('Tournament launched! Users can now register and enter.');
    
    refreshStatus();
    
  } catch (error) {
    console.error('Launch tournament error:', error);
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
      method: 'GET',
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
  if (!confirm('Finalise all points for current gameweek and advance to next?')) return;
  
  log('Finalising points...');
  
  try {
    const token = localStorage.getItem('gbf_token');
    
    // Call the finalise endpoint with manual=true to force advancement
    const response = await fetch('/api/gameweek-transition?manual=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to finalise points');
    }
    
    const data = await response.json();
    log(`Points finalised for GW${data.finalised_gameweek}: ${data.actions?.join(', ')}`, 'success');
    log(`System advanced to GW${data.new_current_gameweek}`, 'success');
    
    // Refresh the status display
    await refreshStatus();
    
  } catch (error) {
    log(`Finalise error: ${error.message}`, 'error');
  }
}

// Master Clock Functions
async function initMasterClock() {
  const select = document.getElementById('master-gw-select');
  const gameweek = select.value;
  
  if (!gameweek) {
    log('Please select a gameweek', 'warn');
    return;
  }
  
  if (!confirm(`Initialize Master Clock to GW${gameweek}?\n\nThis sets the current gameweek for the entire system.`)) return;
  
  log(`Initializing Master Clock to GW${gameweek}...`);
  
  try {
    const token = localStorage.getItem('gbf_token');
    const response = await fetch('/api/master-clock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'init',
        gameweek: parseInt(gameweek)
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to init Master Clock');
    }
    
    const data = await response.json();
    log(`Master Clock initialized: ${data.message}`, 'success');
    
    await refreshStatus();
    
  } catch (error) {
    log(`Error initializing Master Clock: ${error.message}`, 'error');
  }
}

// Manual Gameweek Override Functions (deprecated - use Master Clock)
async function setManualGW() {
  log('Use "Initialize Master Clock" instead', 'warn');
}

async function clearManualGW() {
  log('Use "Initialize Master Clock" instead', 'warn');
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

// Manual Score Entry Functions
async function loadMatchesForScoreEntry() {
  const gwSelect = document.getElementById('manual-score-gw');
  const matchSelect = document.getElementById('manual-score-match');
  const gameweek = gwSelect.value;
  
  if (!gameweek) {
    matchSelect.innerHTML = '<option value="">Select gameweek first...</option>';
    return;
  }
  
  matchSelect.innerHTML = '<option value="">Loading matches...</option>';
  
  try {
    const token = localStorage.getItem('gbf_token');
    const response = await fetch(`/api/admin-stats?action=matches&gameweek=${gameweek}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load matches');
    
    const data = await response.json();
    const matches = data.matches || [];
    
    if (matches.length === 0) {
      matchSelect.innerHTML = '<option value="">No matches found for this GW</option>';
      return;
    }
    
    matchSelect.innerHTML = matches.map(m => {
      const statusIcon = m.status === 'finished' ? '✓' : m.status === 'live' ? '●' : '○';
      const score = m.home_score !== null ? ` (${m.home_score}-${m.away_score})` : '';
      return `<option value="${m.id}" data-home="${m.home_team}" data-away="${m.away_team}">${statusIcon} ${m.home_team} vs ${m.away_team}${score}</option>`;
    }).join('');
    
    log(`Loaded ${matches.length} matches for GW ${gameweek}`);
    
  } catch (error) {
    matchSelect.innerHTML = '<option value="">Error loading matches</option>';
    log(`Error loading matches: ${error.message}`, 'error');
  }
}

async function submitManualScore() {
  const matchSelect = document.getElementById('manual-score-match');
  const homeScore = document.getElementById('manual-score-home').value;
  const awayScore = document.getElementById('manual-score-away').value;
  const status = document.getElementById('manual-score-status').value;
  const resultDiv = document.getElementById('manual-score-result');
  
  const matchId = matchSelect.value;
  
  if (!matchId) {
    resultDiv.innerHTML = '<span class="text-red">Please select a match</span>';
    return;
  }
  
  const selectedOption = matchSelect.options[matchSelect.selectedIndex];
  const homeTeam = selectedOption.dataset.home;
  const awayTeam = selectedOption.dataset.away;
  
  // Calculate result
  const result = parseInt(homeScore) > parseInt(awayScore) ? 'H' :
                 parseInt(awayScore) > parseInt(homeScore) ? 'A' : 'D';
  
  resultDiv.innerHTML = '<span class="text-amber">Saving...</span>';
  
  try {
    const token = localStorage.getItem('gbf_token');
    
    log(`Setting score: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam} (${status})`);
    
    // Call admin-stats API with set-score action
    const response = await fetch('/api/admin-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'set-score',
        match_id: matchId,
        home_score: parseInt(homeScore),
        away_score: parseInt(awayScore),
        result: result,
        status: status
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save score');
    }
    
    const data = await response.json();
    
    resultDiv.innerHTML = `<span class="text-green">✅ Score saved! ${data.predictions_updated || 0} predictions updated, ${data.users_updated || 0} users updated</span>`;
    log(`Score saved successfully. ${data.predictions_updated} predictions scored.`, 'success');
    
    // Refresh the match list to show updated score
    loadMatchesForScoreEntry();
    
  } catch (error) {
    resultDiv.innerHTML = `<span class="text-red">❌ Error: ${error.message}</span>`;
    log(`Score save error: ${error.message}`, 'error');
  }
}

async function recalculateTournamentPoints() {
  const resultDiv = document.getElementById('recalc-result');
  resultDiv.innerHTML = '<span class="text-amber"><i class="fas fa-spinner fa-spin"></i> Recalculating tournament points... This may take a moment.</span>';
  log('Starting tournament points recalculation...', 'info');
  
  try {
    const token = localStorage.getItem('gbf_token');
    
    const response = await fetch('/api/admin-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'recalculate-tournament-points'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to recalculate');
    }
    
    const data = await response.json();
    
    resultDiv.innerHTML = `<span class="text-green">✅ Recalculation complete! ${data.results.tournaments_processed} tournaments processed, ${data.results.entries_updated} entries updated</span>`;
    log(`Tournament points recalculated. ${data.results.entries_updated} entries updated.`, 'success');
    
  } catch (error) {
    resultDiv.innerHTML = `<span class="text-red">❌ Error: ${error.message}</span>`;
    log(`Recalculation error: ${error.message}`, 'error');
  }
}