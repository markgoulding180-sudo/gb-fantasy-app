// Predictions page - Dynamic gameweek loading
document.addEventListener('DOMContentLoaded', async function() {
  const gameweekSelect = document.getElementById('gameweek');
  const fixtureList = document.querySelector('.fixture-list');
  const predictionsForm = document.getElementById('predictions-form');
  
  // Default to gameweek 34
  let currentGameweek = 34;
  
  // Check for URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const urlGameweek = urlParams.get('gameweek');
  if (urlGameweek) {
    currentGameweek = parseInt(urlGameweek);
    gameweekSelect.value = currentGameweek;
  } else {
    gameweekSelect.value = 34;
  }
  
  // Load initial fixtures
  await loadFixtures(currentGameweek);
  
  // Handle gameweek change
  gameweekSelect.addEventListener('change', async function() {
    currentGameweek = parseInt(this.value);
    // Update URL without reloading
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('gameweek', currentGameweek);
    window.history.pushState({}, '', newUrl);
    await loadFixtures(currentGameweek);
  });
  
  // Handle form submission
  predictionsForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    await submitPredictions(currentGameweek);
  });
  
  async function loadFixtures(gameweek) {
    try {
      fixtureList.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Loading fixtures...</div>';
      
      const token = localStorage.getItem('access_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/predictions?gameweek=${gameweek}`, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load fixtures');
      }
      
      if (!data.matches || data.matches.length === 0) {
        fixtureList.innerHTML = '<div class="text-center p-4 text-muted">No fixtures found for this gameweek.</div>';
        return;
      }
      
      // Build fixtures HTML
      let fixturesHTML = '';
      data.matches.forEach((match, index) => {
        const matchNum = index + 1;
        const kickoffDate = new Date(match.kickoff_time);
        const dateStr = kickoffDate.toLocaleDateString('en-GB', { 
          weekday: 'short', 
          day: 'numeric', 
          month: 'short' 
        });
        const timeStr = kickoffDate.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        // Check if match is finished
        const isFinished = match.status === 'finished';
        const disabled = isFinished ? 'disabled' : '';
        const finishedClass = isFinished ? 'fixture-finished' : '';
        const resultDisplay = isFinished ? 
          `<span class="final-score">${match.home_score} - ${match.away_score}</span>` : '';
        
        // Determine winner for finished matches
        let homeWinnerClass = '';
        let awayWinnerClass = '';
        let resultIndicator = '';
        if (isFinished) {
          if (match.result === 'H') {
            homeWinnerClass = 'team-winner';
            resultIndicator = '<span class="result-indicator">1</span>';
          } else if (match.result === 'A') {
            awayWinnerClass = 'team-winner';
            resultIndicator = '<span class="result-indicator">2</span>';
          } else if (match.result === 'D') {
            resultIndicator = '<span class="result-indicator">X</span>';
          }
        }
        
        // Find existing prediction if any
        const existingPred = data.predictions?.find(p => p.match_id === match.id);
        const homeScore = existingPred ? existingPred.home_score : '';
        const awayScore = existingPred ? existingPred.away_score : '';
        const resultH = existingPred && existingPred.predicted_result === 'H' ? 'checked' : '';
        const resultD = existingPred && existingPred.predicted_result === 'D' ? 'checked' : '';
        const resultA = existingPred && existingPred.predicted_result === 'A' ? 'checked' : '';
        
        fixturesHTML += `
          <div class="fixture ${finishedClass}" data-match-id="${match.id}">
            <div class="fixture-header">
              <span><i class="far fa-clock"></i> ${dateStr}, ${timeStr}</span>
              ${isFinished ? '<span class="badge badge-success">FINISHED</span>' + resultIndicator : '<span class="text-muted">' + (match.venue || 'TBC') + '</span>'}
            </div>
            <div class="fixture-teams">
              <div class="team home">
                <div class="team-name ${homeWinnerClass}">${match.home_team}</div>
                <img src="shirts/${getTeamShirtName(match.home_team)}.webp" alt="${match.home_team}" class="team-shirt" onerror="this.style.display='none'">
              </div>
              <span class="vs">VS ${resultDisplay}</span>
              <div class="team away">
                <img src="shirts/${getTeamShirtName(match.away_team)}.webp" alt="${match.away_team}" class="team-shirt" onerror="this.style.display='none'">
                <div class="team-name ${awayWinnerClass}">${match.away_team}</div>
              </div>
            </div>
            <div class="prediction-form">
              <div class="prediction-row">
                <div class="prediction-1x2">
                  <div class="prediction-option">
                    <input type="radio" name="match${matchNum}_result" id="match${matchNum}_h" value="H" ${resultH} ${disabled}>
                    <label for="match${matchNum}_h">1</label>
                  </div>
                  <div class="prediction-option">
                    <input type="radio" name="match${matchNum}_result" id="match${matchNum}_d" value="D" ${resultD} ${disabled}>
                    <label for="match${matchNum}_d">X</label>
                  </div>
                  <div class="prediction-option">
                    <input type="radio" name="match${matchNum}_result" id="match${matchNum}_a" value="A" ${resultA} ${disabled}>
                    <label for="match${matchNum}_a">2</label>
                  </div>
                </div>
                <div class="score-inputs">
                  <input type="number" class="score-input" name="match${matchNum}_home_score" min="0" max="20" placeholder="0" value="${homeScore}" ${disabled}>
                  <span class="score-separator">-</span>
                  <input type="number" class="score-input" name="match${matchNum}_away_score" min="0" max="20" placeholder="0" value="${awayScore}" ${disabled}>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      fixtureList.innerHTML = fixturesHTML;
      
    } catch (error) {
      console.error('Error loading fixtures:', error);
      fixtureList.innerHTML = `<div class="text-center p-4 text-red"><i class="fas fa-exclamation-circle"></i> Error loading fixtures: ${error.message}</div>`;
    }
  }
  
  async function submitPredictions(gameweek) {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Please log in to submit predictions');
        window.location.href = '/login';
        return;
      }
      
      const fixtures = document.querySelectorAll('.fixture');
      const predictions = [];
      
      fixtures.forEach((fixture, index) => {
        const matchId = fixture.dataset.matchId;
        const matchNum = index + 1;
        
        const resultRadio = document.querySelector(`input[name="match${matchNum}_result"]:checked`);
        const homeScore = document.querySelector(`input[name="match${matchNum}_home_score"]`).value;
        const awayScore = document.querySelector(`input[name="match${matchNum}_away_score"]`).value;
        
        if (resultRadio && homeScore !== '' && awayScore !== '') {
          predictions.push({
            match_id: matchId,
            predicted_result: resultRadio.value,
            home_score: parseInt(homeScore),
            away_score: parseInt(awayScore)
          });
        }
      });
      
      if (predictions.length === 0) {
        alert('Please enter at least one prediction');
        return;
      }
      
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          gameweek: gameweek,
          predictions: predictions
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit predictions');
      }
      
      alert('Predictions saved successfully!');
      
    } catch (error) {
      console.error('Error submitting predictions:', error);
      alert('Error submitting predictions: ' + error.message);
    }
  }
  
  function getTeamShirtName(teamName) {
    // Map team names to shirt file names
    const shirtMap = {
      'Arsenal': 'arsenal',
      'Aston Villa': 'aston villa',
      'Bournemouth': 'bournmouth',
      'Brentford': 'brentford',
      'Brighton': 'brighton',
      'Burnley': 'burnley',
      'Chelsea': 'chelsea',
      'Crystal Palace': 'crystal',
      'Everton': 'everton',
      'Fulham': 'fullham',
      'Leeds': 'leeds',
      'Liverpool': 'liverpool',
      'Man City': 'man city',
      'Man United': 'man u',
      'Newcastle': 'new castle',
      'Nott\'m Forest': 'nottingham',
      'Spurs': 'spurs',
      'Tottenham': 'spurs',
      'West Ham': 'west ham',
      'Wolves': 'wovles temp',
      'Sunderland': 'sunderland'
    };
    return shirtMap[teamName] || teamName.toLowerCase().replace(/\s+/g, '-');
  }
});