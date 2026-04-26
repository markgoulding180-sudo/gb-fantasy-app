// GB Fantasy - Main JavaScript
// Premier League Prediction Website

document.addEventListener('DOMContentLoaded', function() {
  // Mobile menu toggle
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', function() {
      navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    });
  }

  // Handle prediction form submission
  const predictionsForm = document.getElementById('predictions-form');
  if (predictionsForm) {
    predictionsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Collect all predictions
      const predictions = {};
      for (let i = 1; i <= 10; i++) {
        const result = document.querySelector(`input[name="match${i}_result"]:checked`);
        const homeScore = document.querySelector(`input[name="match${i}_home_score"]`).value;
        const awayScore = document.querySelector(`input[name="match${i}_away_score"]`).value;
        
        predictions[`match${i}`] = {
          result: result ? result.value : null,
          homeScore: homeScore || null,
          awayScore: awayScore || null
        };
      }
      
      // Show confirmation (in real app, this would send to backend)
      alert('Predictions submitted successfully! Good luck!');
      console.log('Predictions:', predictions);
    });
  }

  // Handle registration form submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
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
      
      // Show confirmation (in real app, this would send to backend)
      alert('Account created successfully! Welcome to GB Fantasy!');
      
      // Redirect to home
      window.location.href = 'index.html';
    });
  }

  // Gameweek selector change handler
  const gameweekSelect = document.getElementById('gameweek');
  if (gameweekSelect) {
    gameweekSelect.addEventListener('change', function() {
      console.log('Selected gameweek:', this.value);
      // In real app, this would load predictions for the selected gameweek
    });
  }

  // Tournament filter change handler
  const tournamentFilter = document.getElementById('tournament-filter');
  if (tournamentFilter) {
    tournamentFilter.addEventListener('change', function() {
      console.log('Selected tournament:', this.value);
      // In real app, this would filter the leaderboard
    });
  }

  // Prediction option selection visual feedback
  const predictionOptions = document.querySelectorAll('.prediction-option input');
  predictionOptions.forEach(option => {
    option.addEventListener('change', function() {
      // Remove checked state from siblings
      const name = this.name;
      document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.parentElement.classList.remove('selected');
      });
      // Add checked state to current
      if (this.checked) {
        this.parentElement.classList.add('selected');
      }
    });
  });

  // Score input validation
  const scoreInputs = document.querySelectorAll('.score-input');
  scoreInputs.forEach(input => {
    input.addEventListener('input', function() {
      // Ensure value is between 0 and 20
      let value = parseInt(this.value);
      if (value < 0) this.value = 0;
      if (value > 20) this.value = 20;
    });
  });

  // Animate cards on scroll
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

  // Update countdowns every minute
  updateCountdowns();
  setInterval(updateCountdowns, 60000);

  console.log('GB Fantasy loaded successfully!');
});

// Utility functions
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCurrency(amount) {
  return '£' + formatNumber(amount);
}

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatNumber, formatCurrency };
}
