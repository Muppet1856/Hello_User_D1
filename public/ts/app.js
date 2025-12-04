const API_BASE = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
  return fetch(API_BASE + path, { ...options, headers });
}

// Login flow
document.getElementById('login-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  const res = await api('/login', { method: 'POST', body: JSON.stringify({ email }) });
  const msg = document.getElementById('login-message');
  if (res.ok) {
    msg.innerHTML = '<div class="alert alert-success">Check your email for the magic link!</div>';
  } else {
    msg.innerHTML = '<div class="alert alert-danger">Something went wrong.</div>';
  }
});

// Handle ?token= from magic link / invitation
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
if (token) {
  const res = await api(`/verify?token=${token}`);
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
    history.replaceState(null, '', '/');
    loadDashboard();
  }
}

// Load dashboard once authenticated
async function loadDashboard() {
  const res = await api('/me');
  if (!res.ok) {
    localStorage.removeItem('token');
    return;
  }
  const user = await res.json();

  document.getElementById('login-form').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  const roles = user.roles || [];
  if (roles.some(r => r.role === 'main_admin')) {
    document.getElementById('main-admin-nav').style.display = 'list-item';
    // TODO: populate Main Admin tab content
  }
  if (roles.some(r => r.role === 'org_admin')) {
    document.getElementById('org-admin-nav').style.display = 'list-item';
    // TODO: populate Org Admin tab content
  }
  if (roles.some(r => r.role === 'team_admin')) {
    document.getElementById('team-admin-nav').style.display = 'list-item';
    // TODO: populate Team Admin tab content
  }

  // Activate first visible tab
  const firstTab = document.querySelector('.nav-link[style*="list-item"]');
  if (firstTab) new bootstrap.Tab(firstTab).show();
}

// Auto-load dashboard if we already have a token
if (localStorage.getItem('token')) loadDashboard();