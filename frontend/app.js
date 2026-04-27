// GB Fantasy - Main JavaScript
// Premier League Prediction Website

// API Base URL - Netlify Functions
const API_BASE = '/.netlify/functions';

// Supabase client configuration (anon key for frontend)
const SUPABASE_URL = 'https://your-project.supabase.co'; // Will be replaced by Netlify env
const SUPABASE_KEY = 'your-anon-key'; // Will be replaced by Netlify env

// Auth state
let currentUser = null;
let authToken = localStorage.getItem('gbf_token') || null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

async function initApp() {
  // Check for existing session
  if (authToken) {
    await validateSession();
  }

  // Mobile menu toggle
  initMobileMenu();

  // Page-specific initializations
  const path = window.location.pathname;
  
  if (path.includes('predictions')) {
    await initPredictionsPage();
  } else if (path.includes('leaderboard')) {
    await initLeaderboardPage();
  } else if (path.includes('tournaments')) {
    await initTournamentsPage();
  } else if (path.includes('register')) {
    initRegisterPage();
  } else if (path.includes('login')) {
    initLoginPage();
  } else {
    await initHomePage();
  }

  // Update UI based on auth state
  updateAuthUI();
}

// ==================== AUTH FUNCTIONS ====================

async function validateSession() {
  try {
    const response = await fetch(`${API_BASE}/leaderboard?limit=1`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
      // Token invalid, clear it
      logout();
    }
  } catch (error) {
    console.error('Session validation error:', error);
  }
}

async function registerUser(userData) {
  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function loginUser(credentials) {
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Store session
    authToken = data.session.access_token;
    localStorage.setItem('gbf_token', authToken);
    localStorage.setItem('gbf_refresh', data.session.refresh_token);
    currentUser = data.user;
    localStorage.setItem('gbf_user', JSON.stringify(currentUser));

    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('gbf_token');
  localStorage.removeItem('gbf_refresh');
  localStorage.removeItem('gbf_user');
  updateAuthUI();
}

function updateAuthUI() {
  // Update navigation based on auth state
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  const registerLink = navLinks.querySelector('a[href="register.html"]');
  const loginLink = navLinks.querySelector('a[href="login.html"]');
  
  if (authToken && currentUser) {
    // User is logged in - replace Register/Login with username
    if (registerLink) {
      registerLink.innerHTML = `<i class="fas fa-user"></i> ${currentUser.display_name}`;
      registerLink.href = '#';
      registerLink.onclick = (e) => {
        e.preventDefault();
        if (confirm('Log out?')) logout();
      };
    }
    // Hide login link when logged in
    if (loginLink) {
      loginLink.style.display = 'none';
    }
  } else {
    // User is logged out - ensure Login link is visible
    if (loginLink) {
      loginLink.style.display = '';
    }
  }
}

// ==================== PAGE INITIALIZERS ====================

function initMobileMenu() {
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', function() {
      navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    });
  }
}

async function initHomePage() {
  // Fetch live stats
  try {
    const [tournamentsRes, leaderboardRes] = await Promise.all([
      fetch(`${API_BASE}/tournaments?status=live&limit=2`),
      fetch(`${API_BASE}/leaderboard?limit=5`)
    ]);

    const tournamentsData = await tournamentsRes.json();
    const leaderboardData = await leaderboardRes.json();

    // Update hero stats if elements exist
    updateHeroStats(tournamentsData.tournaments, leaderboardData.leaderboard);
    
    // Update live tournaments section
    updateLiveTournaments(tournamentsData.tournaments);
    
    // Update top players
    updateTopPlayers(leaderboardData.leaderboard);

  } catch (error) {
    console.error('Failed to load home page data:', error);
  }
}

async function initPredictionsPage() {
  const gameweekSelect = document.getElementById('gameweek');
  
  // Load fixtures for selected gameweek
  await loadFixtures(gameweekSelect ? gameweekSelect.value : '34');

  // Gameweek selector change handler
  if (gameweekSelect) {
    gameweekSelect.addEventListener('change', function() {
      loadFixtures(this.value);
    });
  }

  // Handle prediction form submission
  const predictionsForm = document.getElementById('predictions-form');
  if (predictionsForm) {
    predictionsForm.addEventListener('submit', handlePredictionSubmit);
  }

  // Prediction option selection visual feedback
  const predictionOptions = document.querySelectorAll('.prediction-option input');
  predictionOptions.forEach(option => {
    option.addEventListener('change', function() {
      const name = this.name;
      document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.parentElement.classList.remove('selected');
      });
      if (this.checked) {
        this.parentElement.classList.add('selected');
      }
    });
  });

  // Score input validation
  const scoreInputs = document.querySelectorAll('.score-input');
  scoreInputs.forEach(input => {
    input.addEventListener('input', function() {
      let value = parseInt(this.value);
      if (value < 0) this.value = 0;
      if (value > 20) this.value = 20;
    });
  });
}

async function initLeaderboardPage() {
  const tournamentFilter = document.getElementById('tournament-filter');
  
  await loadLeaderboard(tournamentFilter ? tournamentFilter.value : 'all');

  if (tournamentFilter) {
    tournamentFilter.addEventListener('change', function() {
      loadLeaderboard(this.value);
    });
  }
}

async function initTournamentsPage() {
  await loadTournaments();
}

function initRegisterPage() {
  // Handle registration form submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }
}

function initLoginPage() {
  // Handle login form submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  
  const credentials = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  const result = await loginUser(credentials);

  if (result.success) {
    alert('Welcome back, ' + result.user.display_name + '!');
    window.location.href = 'index.html';
  } else {
    alert(result.error);
  }
}

// ==================== DATA LOADING FUNCTIONS ====================

async function loadFixtures(gameweek) {
  try {
    const headers = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
    const response = await fetch(`${API_BASE}/predictions?gameweek=${gameweek}`, { headers });
    
    if (!response.ok) throw new Error('Failed to load fixtures');
    
    const data = await response.json();
    
    // Store matches data for form submission
    window.currentMatches = data.matches;
    
    // If user has existing predictions, populate the form
    if (data.predictions && data.predictions.length > 0) {
      populateExistingPredictions(data.predictions);
    }

  } catch (error) {
    console.error('Error loading fixtures:', error);
    // Fall back to static HTML content if API fails
  }
}

async function loadLeaderboard(tournament) {
  try {
    const response = await fetch(`${API_BASE}/leaderboard?tournament=${tournament}&limit=50`);
    
    if (!response.ok) throw new Error('Failed to load leaderboard');
    
    const data = await response.json();
    renderLeaderboard(data.leaderboard);

  } catch (error) {
    console.error('Error loading leaderboard:', error);
  }
}

async function loadTournaments() {
  try {
    const response = await fetch(`${API_BASE}/tournaments`);
    
    if (!response.ok) throw new Error('Failed to load tournaments');
    
    const data = await response.json();
    renderTournaments(data.tournaments);

  } catch (error) {
    console.error('Error loading tournaments:', error);
  }
}

// ==================== FORM HANDLERS ====================

async function handleRegisterSubmit(e) {
  e.preventDefault();
  
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  if (password !== confirmPassword) {
    alert('Passwords do not match!');
    return;
  }
  
  if (password.length < 8) {
    alert('Password must be at least 8 characters long!');
    return;
  }

  const userData = {
    username: document.getElementById('username').value,
    display_name: document.getElementById('display-name').value,
    email: document.getElementById('email').value,
    password: password
  };

  const result = await registerUser(userData);

  if (result.success) {
    alert('Account created successfully! Please log in.');
    window.location.href = 'index.html';
  } else {
    alert(result.error);
  }
}

async function handlePredictionSubmit(e) {
  e.preventDefault();
  
  if (!authToken) {
    alert('Please log in to submit predictions');
    return;
  }

  const gameweek = document.getElementById('gameweek').value;
  const predictions = [];

  // Collect all predictions
  for (let i = 1; i <= 10; i++) {
    const result = document.querySelector(`input[name="match${i}_result"]:checked`);
    const homeScore = document.querySelector(`input[name="match${i}_home_score"]`).value;
    const awayScore = document.querySelector(`input[name="match${i}_away_score"]`).value;
    
    if (!result || homeScore === '' || awayScore === '') {
      alert(`Please complete prediction for Match ${i}`);
      return;
    }

    // Get match ID from stored matches data
    const matchId = window.currentMatches && window.currentMatches[i - 1] 
      ? window.currentMatches[i - 1].id 
      : null;

    if (matchId) {
      predictions.push({
        match_id: matchId,
        predicted_result: result.value,
        home_score: parseInt(homeScore),
        away_score: parseInt(awayScore)
      });
    }
  }

  try {
    const response = await fetch(`${API_BASE}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ gameweek: parseInt(gameweek), predictions })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Predictions submitted successfully! Good luck!');
    } else {
      alert(data.error || 'Failed to submit predictions');
    }
  } catch (error) {
    alert('Error submitting predictions. Please try again.');
  }
}

// ==================== RENDER FUNCTIONS ====================

function updateHeroStats(tournaments, leaderboard) {
  // Calculate total prize pool from live tournaments
  const totalPrizePool = tournaments 
    ? tournaments.reduce((sum, t) => sum + (t.prize_pool || 0), 0)
    : 12450;

  // Get active player count
  const activePlayers = leaderboard ? leaderboard.length : 1247;

  // Update DOM elements if they exist
  const prizePoolEl = document.querySelector('.hero-stat-value');
  if (prizePoolEl && tournaments) {
    prizePoolEl.textContent = '£' + totalPrizePool.toLocaleString();
  }

  const playersEl = document.querySelectorAll('.hero-stat-value')[1];
  if (playersEl && leaderboard) {
    playersEl.textContent = activePlayers.toLocaleString();
  }
}

function updateLiveTournaments(tournaments) {
  // This would dynamically update the live tournaments section
  // For now, the static HTML serves as fallback
}

function updateTopPlayers(leaderboard) {
  if (!leaderboard || leaderboard.length === 0) return;

  const tbody = document.querySelector('.leaderboard-table tbody');
  if (!tbody) return;

  // Only update if we're on the home page with the preview table
  const rows = tbody.querySelectorAll('tr');
  if (rows.length <= 5) {
    leaderboard.slice(0, 5).forEach((entry, index) => {
      if (rows[index]) {
        const rankClass = index < 3 ? `rank-${index + 1}` : 'rank';
        const initials = entry.user.avatar_initials || entry.user.display_name.substring(0, 2).toUpperCase();
        
        rows[index].innerHTML = `
          <td><span class="rank ${rankClass}">${entry.rank}</span></td>
          <td>
            <div class="player-info">
              <div class="player-avatar">${initials}</div>
              <div>
                <div style="font-weight: 600;">${entry.user.display_name}</div>
                <div class="text-muted" style="font-size: 0.875rem;">@${entry.user.username}</div>
              </div>
            </div>
          </td>
          <td class="text-right points">${entry.total_points.toLocaleString()}</td>
          <td class="text-right text-green">${entry.gw_points || '-'}</td>
        `;
      }
    });
  }
}

function populateExistingPredictions(predictions) {
  predictions.forEach(pred => {
    // Find the match index
    const matchIndex = window.currentMatches 
      ? window.currentMatches.findIndex(m => m.id === pred.match_id) + 1
      : null;

    if (matchIndex) {
      // Set result radio
      const resultRadio = document.querySelector(`input[name="match${matchIndex}_result"][value="${pred.predicted_result}"]`);
      if (resultRadio) {
        resultRadio.checked = true;
        resultRadio.parentElement.classList.add('selected');
      }

      // Set scores
      const homeInput = document.querySelector(`input[name="match${matchIndex}_home_score"]`);
      const awayInput = document.querySelector(`input[name="match${matchIndex}_away_score"]`);
      
      if (homeInput) homeInput.value = pred.home_score;
      if (awayInput) awayInput.value = pred.away_score;
    }
  });
}

function renderLeaderboard(leaderboard) {
  const tbody = document.querySelector('.leaderboard-table tbody');
  if (!tbody) return;

  tbody.innerHTML = leaderboard.map((entry, index) => {
    const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : 'rank';
    const initials = entry.user.avatar_initials || entry.user.display_name.substring(0, 2).toUpperCase();
    const streakHtml = entry.streak > 1 
      ? `<span style="color: var(--accent-green);"><i class="fas fa-fire"></i> ${entry.streak}</span>` 
      : '-';

    return `
      <tr>
        <td><span class="rank ${rankClass}">${entry.rank}</span></td>
        <td>
          <div class="player-info">
            <div class="player-avatar">${initials}</div>
            <div>
              <div style="font-weight: 600;">${entry.user.display_name}</div>
              <div class="text-muted" style="font-size: 0.875rem;">@${entry.user.username}</div>
            </div>
          </div>
        </td>
        <td class="text-right points">${entry.total_points.toLocaleString()}</td>
        <td class="text-right text-green">${entry.gw_points || '-'}</td>
        <td class="text-right">${entry.gw_points || '-'}</td>
        <td class="text-right">${entry.correct_scores}</td>
        <td class="text-right">${streakHtml}</td>
      </tr>
    `;
  }).join('');
}

function renderTournaments(tournaments) {
  // This would dynamically render tournaments
  // For now, static HTML serves as fallback with enhanced interactivity
  
  // Add click handlers to enter buttons
  document.querySelectorAll('.tournament-card .btn-primary').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!authToken) {
        e.preventDefault();
        alert('Please log in to enter tournaments');
        return;
      }
      
      // Tournament entry is handled via the predictions page
      // This could be enhanced to show a tournament selection modal
    });
  });
}



// ==================== UTILITY FUNCTIONS ====================

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCurrency(amount) {
  return '£' + formatNumber(amount);
}

// Animate cards on scroll
function initScrollAnimations() {
  const cards = document.querySelectorAll('.card, .tournament-card, .fixture');
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    observer.observe(card);
  });
}

// Countdown timer for tournament deadlines
function updateCountdowns() {
  const countdownElements = document.querySelectorAll('[data-countdown]');
  countdownElements.forEach(el => {
    const deadline = new Date(el.dataset.countdown);
    const now = new Date();
    const diff = deadline - now;
    
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      el.textContent = `${days}d ${hours}h ${minutes}m`;
    } else {
      el.textContent = 'Closed';
    }
  });
}

// Initialize scroll animations and countdowns
initScrollAnimations();
updateCountdowns();
setInterval(updateCountdowns, 60000);

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatNumber, formatCurrency, registerUser, loginUser, logout };
}
