// Injury Updates
// Mock injury data - in production, this would come from an API

const mockInjuries = [
  {
    player: 'Erling Haaland',
    team: 'Man City',
    type: 'Ankle Injury',
    status: 'doubt',
    description: 'Minor ankle sprain, being assessed daily',
    returnDate: 'GW35',
    progress: 70
  },
  {
    player: 'Bukayo Saka',
    team: 'Arsenal',
    type: 'Hamstring',
    status: 'out',
    description: 'Grade 2 hamstring strain',
    returnDate: 'GW36',
    progress: 40
  },
  {
    player: 'Mohamed Salah',
    team: 'Liverpool',
    type: 'Muscle Fatigue',
    status: 'return',
    description: 'Back in training, available for selection',
    returnDate: 'GW34',
    progress: 95
  },
  {
    player: 'Marcus Rashford',
    team: 'Man Utd',
    type: 'Knee Injury',
    status: 'out',
    description: 'Knee ligament damage, surgery required',
    returnDate: 'GW38+',
    progress: 20
  },
  {
    player: 'Ollie Watkins',
    team: 'Aston Villa',
    type: 'Calf Strain',
    status: 'doubt',
    description: 'Tight calf, 50/50 for weekend',
    returnDate: 'GW34',
    progress: 60
  },
  {
    player: 'Cole Palmer',
    team: 'Chelsea',
    type: 'Knock',
    status: 'return',
    description: 'Minor knock, fully recovered',
    returnDate: 'GW34',
    progress: 100
  },
  {
    player: 'Alexander Isak',
    team: 'Newcastle',
    type: 'Groin Injury',
    status: 'out',
    description: 'Groin strain sustained in training',
    returnDate: 'GW36',
    progress: 30
  },
  {
    player: 'Son Heung-min',
    team: 'Spurs',
    type: 'Thigh Injury',
    status: 'doubt',
    description: 'Dead leg, fitness test required',
    returnDate: 'GW34',
    progress: 65
  },
  {
    player: 'Dominic Solanke',
    team: 'Bournemouth',
    type: 'Ankle',
    status: 'return',
    description: 'Ankle injury, back in full training',
    returnDate: 'GW34',
    progress: 90
  },
  {
    player: 'Jarrod Bowen',
    team: 'West Ham',
    type: 'Foot Injury',
    status: 'out',
    description: 'Fractured metatarsal',
    returnDate: 'GW37',
    progress: 35
  }
];

document.addEventListener('DOMContentLoaded', function() {
  loadInjuries('all');
  setupFilters();
});

function loadInjuries(filter) {
  const list = document.getElementById('injury-list');
  
  let injuries = mockInjuries;
  if (filter !== 'all') {
    injuries = mockInjuries.filter(i => i.status === filter);
  }
  
  // Update counts
  document.getElementById('count-out').textContent = mockInjuries.filter(i => i.status === 'out').length;
  document.getElementById('count-doubt').textContent = mockInjuries.filter(i => i.status === 'doubt').length;
  document.getElementById('count-return').textContent = mockInjuries.filter(i => i.status === 'return').length;
  document.getElementById('count-total').textContent = mockInjuries.length;
  
  if (injuries.length === 0) {
    list.innerHTML = `
      <div class="card" style="padding: 3rem; text-align: center;">
        <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--accent-green); margin-bottom: 1rem;"></i>
        <p>No injuries in this category</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = injuries.map(injury => {
    const statusClass = 'injury-' + injury.status;
    const statusText = injury.status === 'out' ? 'Out' : 
                      injury.status === 'doubt' ? 'Doubtful' : 'Returning';
    
    const initials = injury.player.split(' ').map(n => n[0]).join('').substring(0, 2);
    const shirtFile = getTeamShirt(injury.team);
    
    return `
      <div class="injury-card">
        <div class="injury-player">
          <img src="shirts/${shirtFile}" alt="${injury.team}" class="team-shirt-small" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <div class="player-avatar" style="display: none;">${initials}</div>
          <div class="player-info">
            <h4>${injury.player}</h4>
            <div class="player-team">${injury.team}</div>
          </div>
        </div>
        <div class="injury-details">
          <span class="injury-type ${statusClass}">${statusText}</span>
          <div class="injury-desc">${injury.description}</div>
          <div class="injury-timeline">
            <span>Recovery:</span>
            <div class="timeline-bar">
              <div class="timeline-progress" style="width: ${injury.progress}%"></div>
            </div>
            <span>${injury.progress}%</span>
          </div>
        </div>
        <div class="injury-return-date">
          <div class="return-label">Expected Return</div>
          <div class="return-date">${injury.returnDate}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getTeamShirt(teamName) {
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
    'Nott\'m Forest': 'nots forest.webp',
    'Spurs': 'spurs.webp',
    'West Ham': 'west ham.webp',
    'Wolves': 'wovles temp.webp',
    'Leeds': 'leeds.webp',
    'Sunderland': 'sunderland.webp'
  };
  return mapping[teamName] || 'arsenal.webp';
}

function setupFilters() {
  const filters = document.querySelectorAll('.injury-filter');
  filters.forEach(filter => {
    filter.addEventListener('click', () => {
      // Remove active from all
      filters.forEach(f => f.classList.remove('active'));
      // Add active to clicked
      filter.classList.add('active');
      // Load injuries with filter
      loadInjuries(filter.dataset.filter);
    });
  });
}
