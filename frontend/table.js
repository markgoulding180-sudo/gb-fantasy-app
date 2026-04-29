// Premier League Table
const API_BASE = '/api';
const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

document.addEventListener('DOMContentLoaded', function() {
  loadTable();
});

async function loadTable() {
  try {
    // Fetch from FPL API
    const response = await fetch(FPL_BOOTSTRAP_URL);
    const data = await response.json();
    
    // Get teams and their stats
    const teams = data.teams.sort((a, b) => {
      // Sort by points, then goal difference
      if (b.points !== a.points) return b.points - a.points;
      return (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against);
    });
    
    // Update stats
    const totalMatches = teams.reduce((sum, t) => sum + t.played, 0) / 2;
    const totalGoals = teams.reduce((sum, t) => sum + t.goals_for, 0);
    const avgGoals = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(1) : '0';
    
    document.getElementById('total-matches').textContent = Math.floor(totalMatches);
    document.getElementById('total-goals').textContent = totalGoals;
    document.getElementById('avg-goals').textContent = avgGoals;
    
    // Get current gameweek
    const currentEvent = data.events.find(e => e.is_current);
    if (currentEvent) {
      document.getElementById('current-gameweek').textContent = 'GW' + currentEvent.id;
    }
    
    // Render table
    renderTable(teams);
    
    document.getElementById('last-updated').textContent = new Date().toLocaleString();
    
  } catch (error) {
    console.error('Table load error:', error);
    document.getElementById('league-table-body').innerHTML = `
      <tr>
        <td colspan="11" class="text-center" style="padding: 3rem; color: var(--accent-red);">
          <i class="fas fa-exclamation-circle"></i> Error loading table data
        </td>
      </tr>
    `;
  }
}

function renderTable(teams) {
  const tbody = document.getElementById('league-table-body');
  
  tbody.innerHTML = teams.map((team, index) => {
    const position = index + 1;
    const gd = team.goals_for - team.goals_against;
    
    // Determine position class
    let posClass = 'pos-mid';
    if (position <= 4) posClass = 'pos-champions';
    else if (position <= 5) posClass = 'pos-europa';
    else if (position <= 6) posClass = 'pos-conference';
    else if (position >= 18) posClass = 'pos-relegation';
    
    // Get team shirt (try to match by name)
    const shirtName = getShirtFileName(team.name);
    
    // Mock form (W-W-D-L-W) - in real app, fetch from fixtures
    const form = generateMockForm(position);
    
    return `
      <tr>
        <td><span class="position ${posClass}">${position}</span></td>
        <td>
          <div class="team-cell">
            <img src="shirts/${shirtName}" alt="${team.name}" class="team-shirt-small" onerror="this.style.display='none'">
            <span style="font-weight: 600;">${team.name}</span>
          </div>
        </td>
        <td>${team.played}</td>
        <td>${team.won}</td>
        <td>${team.draw}</td>
        <td>${team.lost}</td>
        <td>${team.goals_for}</td>
        <td>${team.goals_against}</td>
        <td style="font-weight: 600; ${gd > 0 ? 'color: var(--accent-green);' : gd < 0 ? 'color: var(--accent-red);' : ''}">${gd > 0 ? '+' : ''}${gd}</td>
        <td style="font-weight: 700;">${team.points}</td>
        <td>${form}</td>
      </tr>
    `;
  }).join('');
}

function getShirtFileName(teamName) {
  // Map team names to shirt file names
  const mapping = {
    'Arsenal': 'arsenal.webp',
    'Aston Villa': 'aston villa.webp',
    'Bournemouth': 'bournmouth.webp',
    'Brentford': 'brentford.webp',
    'Brighton': 'brighton.webp',
    'Burnley': 'burnley.webp',
    'Chelsea': 'chelsea.webp',
    'Crystal Palace': 'crystal.webp',
    'Everton': 'everton.webp',
    'Fulham': 'fullham.webp',
    'Liverpool': 'liverpool.webp',
    'Man City': 'man city.webp',
    'Man Utd': 'man u.webp',
    'Newcastle': 'new castle.webp',
    "Nott'm Forest": 'nots forest.webp',
    'Spurs': 'spurs.webp',
    'West Ham': 'west ham.webp',
    'Wolves': 'wovles temp.webp',
    'Leeds': 'leeds.webp',
    'Sunderland': 'sunderland.webp'
  };
  
  return mapping[teamName] || 'arsenal.webp';
}

function generateMockForm(position) {
  // Generate realistic form based on table position
  const forms = [
    ['W', 'W', 'D', 'W', 'W'],
    ['W', 'W', 'W', 'D', 'L'],
    ['W', 'D', 'W', 'W', 'D'],
    ['D', 'W', 'W', 'L', 'W'],
    ['W', 'L', 'W', 'D', 'W'],
    ['D', 'W', 'L', 'W', 'D'],
    ['W', 'D', 'D', 'W', 'L'],
    ['L', 'W', 'W', 'D', 'D'],
    ['D', 'D', 'W', 'L', 'W'],
    ['W', 'L', 'D', 'W', 'L']
  ];
  
  const form = forms[position % forms.length];
  return form.map(r => `<span class="form-indicator form-${r.toLowerCase()}">${r}</span>`).join('');
}
