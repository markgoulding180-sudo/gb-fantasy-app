// Leaderboard page - Load live leaderboard data
document.addEventListener('DOMContentLoaded', async function() {
  await loadLeaderboard();
  
  // Handle tournament filter change
  const tournamentFilter = document.getElementById('tournament-filter');
  if (tournamentFilter) {
    tournamentFilter.addEventListener('change', async function() {
      await loadLeaderboard(this.value);
    });
  }
});

async function loadLeaderboard(tournament = 'all') {
  const tbody = document.querySelector('.leaderboard-table tbody');
  const countSpan = document.querySelector('.card-header .text-muted');
  
  if (!tbody) return;
  
  // Show loading state
  tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Loading leaderboard...</td></tr>';
  
  try {
    const token = localStorage.getItem('gbf_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    
    const response = await fetch(`/api/leaderboard?tournament=${tournament}&limit=50`, { headers });
    
    if (!response.ok) {
      throw new Error('Failed to load leaderboard');
    }
    
    const data = await response.json();
    
    if (!data.leaderboard || data.leaderboard.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">No leaderboard data available.</td></tr>';
      return;
    }
    
    // Update count text
    if (countSpan) {
      countSpan.textContent = `Showing 1-${data.leaderboard.length} of ${data.pagination?.total || data.leaderboard.length} players`;
    }
    
    // Update Top 3 Podium
    updatePodium(data.leaderboard.slice(0, 3));
    
    // Render full leaderboard
    tbody.innerHTML = data.leaderboard.map((entry, index) => {
      const rank = entry.rank || index + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank';
      const initials = entry.user?.avatar_initials || 
                      (entry.user?.display_name || entry.user?.username || '?').substring(0, 2).toUpperCase();
      const streakHtml = entry.streak > 1 
        ? `<span style="color: var(--accent-green);"><i class="fas fa-fire"></i> ${entry.streak}</span>` 
        : '-';
      
      return `
        <tr>
          <td><span class="rank ${rankClass}">${rank}</span></td>
          <td>
            <div class="player-info">
              <div class="player-avatar" style="background-color: ${getAvatarColor(rank)};">${initials}</div>
              <div>
                <div style="font-weight: 600;">${entry.user?.display_name || 'Unknown'}</div>
                <div class="text-muted" style="font-size: 0.875rem;">@${entry.user?.username || 'unknown'}</div>
              </div>
            </div>
          </td>
          <td class="text-right points">${(entry.total_points || 0).toLocaleString()}</td>
          <td class="text-right text-green">${entry.gw_points || '-'}</td>
          <td class="text-right">${entry.gw_points || '-'}</td>
          <td class="text-right">${entry.correct_scores || 0}</td>
          <td class="text-right">${streakHtml}</td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-red"><i class="fas fa-exclamation-circle"></i> Error loading leaderboard: ${error.message}</td></tr>`;
  }
}

function updatePodium(top3) {
  const podium = document.querySelector('.grid.grid-3.mb-3');
  if (!podium || top3.length === 0) return;
  
  const medals = ['🥇', '🥈', '🥉'];
  const scales = ['1.05', '1', '1'];
  const sizes = ['64px', '56px', '56px'];
  const fontSizes = ['1.5rem', '1.25rem', '1.25rem'];
  const pointSizes = ['2rem', '1.75rem', '1.75rem'];
  
  top3.forEach((entry, index) => {
    const card = podium.children[index];
    if (!card) return;
    
    const initials = entry.user?.avatar_initials || 
                    (entry.user?.display_name || entry.user?.username || '?').substring(0, 2).toUpperCase();
    const displayName = entry.user?.display_name || 'Unknown';
    const username = entry.user?.username || 'unknown';
    const points = entry.total_points || 0;
    
    card.innerHTML = `
      <div style="font-size: ${index === 0 ? '3rem' : '2.5rem'}; margin-bottom: 0.5rem;">${medals[index]}</div>
      <div class="player-avatar" style="margin: 0 auto 1rem; width: ${sizes[index]}; height: ${sizes[index]}; font-size: ${fontSizes[index]}; background-color: ${getAvatarColor(index + 1)};">${initials}</div>
      <div style="font-size: ${index === 0 ? '1.25rem' : '1.1rem'}; font-weight: ${index === 0 ? '700' : '600'};">${displayName}</div>
      <div class="text-muted mb-2">@${username}</div>
      <div style="font-size: ${pointSizes[index]}; font-weight: 700; color: ${index === 0 ? 'var(--accent-green)' : 'var(--text-primary)'};">${points.toLocaleString()}</div>
      <div class="text-muted">Total Points</div>
    `;
  });
}

function getAvatarColor(rank) {
  const colors = {
    1: 'var(--accent-amber)',
    2: 'var(--accent-red)',
    3: 'var(--accent-amber)'
  };
  return colors[rank] || '#8b5cf6';
}
