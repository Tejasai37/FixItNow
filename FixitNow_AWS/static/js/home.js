// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Check user authentication status by making API call to Flask backend
async function checkUserSigninStatus() {
    try {
        const response = await fetch('/api/user-stats');
        return response.ok; // Returns true if user is signed in (status 200), false otherwise
    } catch (error) {
        console.error('Error checking signin status:', error);
        return false;
    }
}

// Get current user type from the backend
async function getCurrentUserType() {
    try {
        const response = await fetch('/api/current-user');
        if (response.ok) {
            const userData = await response.json();
            return userData.user_type;
        }
        return null;
    } catch (error) {
        console.error('Error getting user type:', error);
        return null;
    }
}

// Navigation function for dashboard buttons
async function navigateToDashboard(userType) {
    const isLoggedIn = await checkUserSigninStatus();
    
    if (!isLoggedIn) {
        // Redirect to signin page if not logged in
        alert('Please log in to access your dashboard.');
        window.location.href = '/signin';
        return;
    }
    
    const currentUserType = await getCurrentUserType();
    
    // Navigate to appropriate dashboard based on current user type
    if (currentUserType === 'homeowner') {
        window.location.href = '/homeowner_dashboard';
    } else if (currentUserType === 'service_provider') {
        window.location.href = '/service_provider_dashboard';
    } else {
        alert('Unable to determine user type. Please try signing in again.');
        window.location.href = '/signin';
    }
}

// Handle dashboard navigation link in navbar
async function handleDashboardNav(event) {
    event.preventDefault();
    
    const isLoggedIn = await checkUserSigninStatus();
    
    if (!isLoggedIn) {
        // If not signed in, scroll to features section
        const featuresSection = document.querySelector('#features');
        if (featuresSection) {
            featuresSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } else {
        // If signed in, navigate to appropriate dashboard
        const currentUserType = await getCurrentUserType();
        
        if (currentUserType === 'homeowner') {
            window.location.href = '/homeowner_dashboard';
        } else if (currentUserType === 'service_provider') {
            window.location.href = '/service_provider_dashboard';
        } else {
            // Fallback to features section if user type is unclear
            const featuresSection = document.querySelector('#features');
            if (featuresSection) {
                featuresSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    }
}

// Update navbar content based on authentication status
async function updateNavbar() {
    const navbarActions = document.querySelector('.navbar .d-flex');
    const dashboardLink = document.querySelector('.nav-link[href="#dashboard"]');
    
    if (!navbarActions) return;
    
    const isLoggedIn = await checkUserSigninStatus();
    
    if (isLoggedIn) {
        const currentUserType = await getCurrentUserType();
        const username = await getCurrentUsername();
        
        // Update navbar to show user info and logout
        navbarActions.innerHTML = `
            <div class="dropdown me-2">
                <button class="btn btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    <i class="fas fa-user me-1"></i>${username || 'User'}
                </button>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="${currentUserType === 'homeowner' ? '/homeowner_dashboard' : '/service_provider_dashboard'}">
                        <i class="fas fa-tachometer-alt me-2"></i>Dashboard
                    </a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="/logout">
                        <i class="fas fa-sign-out-alt me-2"></i>Logout
                    </a></li>
                </ul>
            </div>
        `;
    } else {
        // Show sign up/sign in button for non-authenticated users
        navbarActions.innerHTML = `
            <a href="/signup" class="btn btn-outline-primary me-2">Sign Up / Sign In</a>
        `;
    }
    
    // Add event listener to dashboard link
    if (dashboardLink) {
        dashboardLink.addEventListener('click', handleDashboardNav);
    }
}

// Get current username
async function getCurrentUsername() {
    try {
        const response = await fetch('/api/current-user');
        if (response.ok) {
            const userData = await response.json();
            return userData.username;
        }
        return null;
    } catch (error) {
        console.error('Error getting username:', error);
        return null;
    }
}

// Navbar background change on scroll
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
    }
});

// Initialize navbar when page loads
document.addEventListener('DOMContentLoaded', function() {
    updateNavbar();
});