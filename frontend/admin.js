// GB Fantasy - Admin Panel JavaScript

const API_BASE = '/.netlify/functions';

// Admin authentication check
const ADMIN_KEY = 'gbf_admin_key';

document.addEventListener('DOMContentLoaded', function() {
  checkAdminAuth();
  refreshStatus();
});

function checkAdminAuth() {
  // Simple admin check - in production, use proper auth
  const isAdmin = localStorage.getItem('gbf_is_admin');
  if (!isAdmin) {
    const key = prompt('Enter admin key:');
    if (key === '1066') {
      localStorage.setItem('gbf_is_admin', 'true');
    } else {
      alert('Access denied');
      window.location.href = 'index.html';
    }
  }
}

// Logging
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

// Status refresh
async function refreshStatus() {
  log('Refreshing status...');
  
  try {
    // Get current gameweek from API
    const gwResponse = await fetch(`${API_BASE}/current-gameweek`);
    if (gwResponse.ok) {
      const gwData = await gwResponse.json();
      document.getElementById('api-gw').textContent = gwData.current_gameweek || 'N/A';
      document.getElementById('next-gw').textContent = gwData.next_gameweek || 'N/A';
      document.getElementById('deadline').textContent = gwData.deadline 
        ? new Date(gwData.deadline).toLocaleString() 
        : 'N/A';
    }
    
    // Get override status
    const override = localStorage.getItem('gbf_manual_gw');
    document.getElementById('override-status').textContent = override ? 'ON' : 'OFF';
    document.getElementById('override-status').style.color = override ? 'var(--accent-red)' : 'var(--accent-green)';
    document.getElementById('manual-gw').textContent = override || 'None';
    
    if (override) {
      document.getElementById('override-panel').classList.add('override-active');
      document.getElementById('manual-gw-select').value = override;
    }
    
    // Get database stats
    const statsResponse = await fetch(`${API_BASE}/admin-stats`);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      document.getElementById('total-matches').textContent = stats.total_matches || 0;
      document.getElementById('total-predictions').textContent = stats.total_predictions || 0;
    }
    
    log('Status refreshed successfully');
  } catch (error) {
    log('Error refreshing status: ' + error.message, 'error');
  }
}

// Gameweek Override
function setManualGW() {
  const select = document.getElementById('manual-gw-select');
  const gw = select.value;
  
  if (!gw) {
    alert('Please select a gameweek');
    return;
  }
  
  localStorage.setItem('gbf_manual_gw', gw);
  log(`Manual GW override set to: ${gw}`, 'warn');
  refreshStatus();
}

function clearManualGW() {
  localStorage.removeItem('gbf_manual_gw');
  document.getElementById('manual-gw-select').value = '';
  log('Manual GW override cleared. Using FPL API.', 'info');
  refreshStatus();
}

// Sync Fixtures
async function syncFixtures() {
  const gwSelect = document.getElementById('sync-gw-select');
  const gw = gwSelect.value;
  
  log(`Starting fixture sync${gw ? ` for GW ${gw}` : ' for all gameweeks'}...`);
  
  try {
    const url = gw 
      ? `${API_BASE}/sync-fixtures?gameweek=${gw}`
      : `${API_BASE}/sync-fixtures`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      log(`Sync complete: ${data.results.created} created, ${data.results.updated} updated`);
      if (data.results.errors.length > 0) {
        log(`Errors: ${data.results.errors.length}`, 'error');
      }
    } else {
      log('Sync failed: ' + data.error, 'error');
    }
  } catch (error) {
    log('Sync error: ' + error.message, 'error');
  }
  
  refreshStatus();
}

// Live Scores
async function syncLiveScores() {
  log('Updating live scores...');
  
  try {
    const response = await fetch(`${API_BASE}/live-scores`);
    const data = await response.json();
    
    if (response.ok) {
      log(`Live scores updated: ${data.results.updated} matches, ${data.results.finished} finished`);
      if (data.results.live.length > 0) {
        log(`Live matches: ${data.results.live.map(m => `${m.home}-${m.away}`).join(', ')}`);
      }
    } else {
      log('Live scores failed: ' + data.error, 'error');
    }
  } catch (error) {
    log('Live scores error: ' + error.message, 'error');
  }
}

// Finalise Points
async function finalisePoints() {
  if (!confirm('This will finalise all points for the current gameweek. Continue?')) {
    return;
  }
  
  log('Finalising points...');
  
  try {
    const response = await fetch(`${API_BASE}/gameweek-transition`);
    const data = await response.json();
    
    if (response.ok) {
      log('Points finalised successfully');
      log(`Actions: ${data.actions.join(', ')}`);
      if (data.all_matches_finished) {
        log('All matches finished - GW ready to advance', 'warn');
      }
    } else {
      log('Finalisation failed: ' + data.error, 'error');
    }
  } catch (error) {
    log('Finalisation error: ' + error.message, 'error');
  }
  
  refreshStatus();
}

// Advance GW
async function advanceGW() {
  if (!confirm('Advance to next gameweek? This will open predictions for the next GW.')) {
    return;
  }
  
  log('Advancing gameweek...');
  
  // Get current GW info
  const response = await fetch(`${API_BASE}/current-gameweek`);
  if (response.ok) {
    const data = await response.json();
    const nextGW = data.next_gameweek;
    
    if (nextGW) {
      // Set manual override to next GW
      localStorage.setItem('gbf_manual_gw', nextGW);
      log(`Advanced to GW ${nextGW}`, 'warn');
      
      // Clear override after setting (so API takes over)
      setTimeout(() => {
        localStorage.removeItem('gbf_manual_gw');
        log('Cleared manual override - using FPL API');
      }, 5000);
      
      refreshStatus();
    } else {
      log('No next gameweek available', 'error');
    }
  }
}

// Check Transition
async function checkTransition() {
  log('Checking gameweek transition status...');
  
  try {
    const response = await fetch(`${API_BASE}/gameweek-transition`);
    const data = await response.json();
    
    if (response.ok) {
      log(`Current GW: ${data.current_gameweek}, Next: ${data.next_gameweek}`);
      log(`All matches finished: ${data.all_matches_finished}`);
      log(`Data checked: ${data.data_checked}`);
      log(`Actions taken: ${data.actions.join(', ') || 'None'}`);
      
      if (data.all_matches_finished && data.data_checked) {
        log('GW is ready to advance!', 'warn');
      }
    } else {
      log('Transition check failed: ' + data.error, 'error');
    }
  } catch (error) {
    log('Transition check error: ' + error.message, 'error');
  }
}

// Live Matches
async function refreshLiveMatches() {
  const container = document.getElementById('live-matches');
  container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  
  try {
    const response = await fetch(`${API_BASE}/live-scores`);
    const data = await response.json();
    
    if (response.ok && data.results.live.length > 0) {
      container.innerHTML = data.results.live.map(m => `
        <div style="padding: 0.5rem; background: var(--bg-hover); border-radius: 0.25rem; margin-bottom: 0.5rem;">
          <strong>${m.home} - ${m.away}</strong> 
          <span style="color: var(--accent-green);">${m.minute}'</span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="text-muted">No live matches currently.</p>';
    }
  } catch (error) {
    container.innerHTML = '<p class="text-error">Error loading live matches.</p>';
  }
}
