import { api } from './app.js';  // Import shared api

// This file handles Main Admin tab population and logic

// Populate Main Admin tab
const mainAdminTab = document.getElementById('main-admin');
mainAdminTab.innerHTML = `
  <h3>Main Admin - Organization Manager</h3>
  
  <div class="mb-4">
    <h4>Create New Organization</h4>
    <input id="new-org-name" class="form-control mb-2" placeholder="Organization Name" type="text">
    <button id="create-org-btn" class="btn btn-primary">Create Organization</button>
    <div id="create-org-message" class="mt-2"></div>
  </div>
  
  <div>
    <h4>Existing Organizations</h4>
    <ul id="org-list" class="list-group"></ul>
  </div>
`;

// Load org list
async function loadOrgs() {
  const res = await api('/organizations');
  if (!res.ok) {
    alert('Failed to load organizations');
    return;
  }
  const orgs = await res.json();
  const orgList = document.getElementById('org-list');
  orgList.innerHTML = '';
  orgs.forEach(org => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <span>${org.name} (ID: ${org.id})</span>
        <div>
          <input class="form-control d-inline-block w-auto me-2" id="invite-email-${org.id}" placeholder="Email to invite" type="email">
          <button class="btn btn-secondary invite-btn" data-org-id="${org.id}">Invite as Org Admin</button>
        </div>
      </div>
      <div id="invite-message-${org.id}" class="mt-2"></div>
    `;
    orgList.appendChild(li);
  });

  // Attach invite handlers
  document.querySelectorAll('.invite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const orgId = e.target.dataset.orgId;
      const email = document.getElementById(`invite-email-${orgId}`).value.trim();
      if (!email) {
        alert('Please enter an email');
        return;
      }
      const res = await api(`/organizations/${orgId}/invite-admin`, {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      const msg = document.getElementById(`invite-message-${orgId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Invitation sent!</div>';
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
      }
    });
  });
}

// Create org handler
document.getElementById('create-org-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-org-name').value.trim();
  if (!name) {
    alert('Please enter a name');
    return;
  }
  const res = await api('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  const msg = document.getElementById('create-org-message');
  if (res.ok) {
    msg.innerHTML = '<div class="alert alert-success">Organization created!</div>';
    loadOrgs(); // Refresh list
  } else {
    msg.innerHTML = '<div class="alert alert-danger">Failed to create organization.</div>';
  }
});

// Initialization function
export function initMainAdmin() {
  loadOrgs();
}