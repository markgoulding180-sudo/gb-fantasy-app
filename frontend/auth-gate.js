// Auth gate - redirects unauthenticated users to login
(function() {
  // Pages that don't require authentication
  const publicPages = [
    '/index.html',
    '/',
    '/login.html',
    '/register.html'
  ];
  
  // Current page
  const currentPath = window.location.pathname;
  
  // Check if current page is public
  const isPublicPage = publicPages.some(page => currentPath.endsWith(page) || currentPath === page);
  
  if (!isPublicPage) {
    // Check for auth token
    const token = localStorage.getItem('gbf_token');
    
    if (!token) {
      // Redirect to login
      window.location.href = '/login.html?redirect=' + encodeURIComponent(currentPath);
      return;
    }
    
    // User is authenticated - update navbar
    updateNavbarForAuth();
  }
})();

function updateNavbarForAuth() {
  const token = localStorage.getItem('gbf_token');
  const userJson = localStorage.getItem('gbf_user');
  
  if (!token || !userJson) return;
  
  try {
    const user = JSON.parse(userJson);
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    
    // Find register and login links
    const registerLink = navLinks.querySelector('a[href="register.html"]');
    const loginLink = navLinks.querySelector('a[href="login.html"]');
    
    // Replace with user info and logout
    if (registerLink) {
      registerLink.innerHTML = `<i class="fas fa-user"></i> ${user.display_name || user.username}`;
      registerLink.href = '/profile.html';
    }
    
    if (loginLink) {
      loginLink.innerHTML = `<i class="fas fa-sign-out-alt"></i> Logout`;
      loginLink.href = '#';
      loginLink.onclick = function(e) {
        e.preventDefault();
        localStorage.removeItem('gbf_token');
        localStorage.removeItem('gbf_user');
        window.location.href = '/index.html';
      };
    }
    
  } catch (e) {
    console.error('Error updating navbar:', e);
  }
}