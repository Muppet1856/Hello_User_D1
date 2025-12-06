// public/js/app.js
const API_BASE = '/api';

export const api = async (path, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
  return fetch(API_BASE + path, { ...options, headers });
};

// Login button handler
document.getElementById('login-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) {
    alert('Please enter your email');
    return;
  }

  const res = await api('/login', {
    method: 'POST',
    body: JSON.stringify({ email })
  });

  const msg = document.getElementById('login-message');
  if (res.ok) {
    msg.innerHTML = '<div class="alert alert-success">Check your email for the magic link!</div>';
  } else {
    msg.innerHTML = '<div class="alert alert-danger">Failed to send login link. Try again.</div>';
  }
});

// Handle magic link token from URL (?token=...)
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
  (async () => {
    try {
      const res = await api(`/verify?token=${token}`);
      if (!res.ok) throw new Error('Verify failed');
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        history.replaceState(null, '', '/');  // Clean URL
        loadDashboard();
      } else {
        alert('Invalid link - please try again');
      }
    } catch (e) {
      alert('Error verifying link: ' + e.message);
    }
  })();
}

// Load dashboard when authenticated
async function loadDashboard() {
  const res = await api('/me');
  if (!res.ok) {
    localStorage.removeItem('token');
    document.getElementById('loading').classList.add('d-none');
    document.getElementById('login-form').classList.remove('d-none');
    document.getElementById('dashboard').classList.add('d-none');
    return;
  }

  const user = await res.json();

  document.getElementById('login-form').classList.add('d-none');
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('dashboard').classList.remove('d-none');

  const roles = user.roles || [];
  const isMain = roles.some(r => r.role === 'main_admin');

  if (isMain) {
    document.getElementById('main-admin-nav').classList.remove('d-none');
    const { initMainAdmin } = await import('./main-admin.js');
    initMainAdmin();
  }
  if (roles.some(r => r.role === 'org_admin') || isMain) {
    document.getElementById('org-admin-nav').classList.remove('d-none');
    const { initOrgAdmin } = await import('./org-admin.js');
    initOrgAdmin();
  }
  if (roles.some(r => r.role === 'team_admin') || isMain) {
    document.getElementById('team-admin-nav').classList.remove('d-none');
    const { initTeamAdmin } = await import('./team-admin.js');
    initTeamAdmin();
  }

  // Activate the first visible tab
  const firstVisibleTab = document.querySelector('.nav-link:not(.d-none)');
  if (firstVisibleTab) {
    new bootstrap.Tab(firstVisibleTab).show();
  }
}

// Auto-load dashboard if already logged in
if (localStorage.getItem('token')) {
  document.getElementById('login-form').classList.add('d-none');
  document.getElementById('loading').classList.remove('d-none');
  loadDashboard();
}
