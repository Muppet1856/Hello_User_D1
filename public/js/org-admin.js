import { api } from './app.js';

// This file handles Org Admin tab population and logic

// Populate Org Admin tab
const orgAdminTab = document.getElementById('org-admin');
orgAdminTab.innerHTML = `
  <h3>Org Admin - Team Manager</h3>
  <div class="accordion" id="orgAccordion"></div>
`;

// Load my orgs and build UI
async function loadMyOrgs() {
  const res = await api('/my-orgs');
  if (!res.ok) {
    alert('Failed to load your organizations');
    return;
  }
  const orgs = await res.json();
  const accordion = document.getElementById('orgAccordion');
  accordion.innerHTML = '';

  if (!orgs.length) {
    accordion.innerHTML = '<p>No organizations found.</p>';
    return;
  }

  orgs.forEach((org, index) => {
    const itemId = `org-${org.id}`;
    const collapseId = `collapse-${org.id}`;
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.innerHTML = `
      <h2 class="accordion-header" id="${itemId}">
        <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="${collapseId}">
          ${org.name} (ID: ${org.id})
        </button>
      </h2>
      <div id="${collapseId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="${itemId}" data-bs-parent="#orgAccordion">
        <div class="accordion-body">
          <div class="mb-4">
            <h4>Create New Team</h4>
            <input id="new-team-name-${org.id}" class="form-control mb-2" placeholder="Team Name" type="text">
            <button class="btn btn-primary create-team-btn" data-org-id="${org.id}">Create Team</button>
            <div id="create-team-message-${org.id}" class="mt-2"></div>
          </div>
          <div>
            <h4>Existing Teams</h4>
            <ul id="team-list-${org.id}" class="list-group"></ul>
          </div>
        </div>
      </div>
    `;
    accordion.appendChild(item);

    loadTeams(org.id);

    // Attach create handler
    item.querySelector('.create-team-btn').addEventListener('click', async (e) => {
      const orgId = e.target.dataset.orgId;
      const name = document.getElementById(`new-team-name-${orgId}`).value.trim();
      if (!name) {
        alert('Please enter a name');
        return;
      }
      const res = await api(`/organizations/${orgId}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      const msg = document.getElementById(`create-team-message-${orgId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Team created!</div>';
        loadTeams(orgId); // Refresh list
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to create team.</div>';
      }
    });
  });
}

// Load teams for a specific org
async function loadTeams(orgId) {
  const res = await api(`/organizations/${orgId}/teams`);
  if (!res.ok) {
    alert('Failed to load teams');
    return;
  }
  const teams = await res.json();
  const teamList = document.getElementById(`team-list-${orgId}`);
  teamList.innerHTML = '';
  teams.forEach(team => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <span>${team.name} (ID: ${team.id})</span>
        <div>
          <input class="form-control d-inline-block w-auto me-2" id="invite-email-${team.id}" placeholder="Email to invite" type="email">
          <button class="btn btn-secondary invite-team-btn" data-team-id="${team.id}">Invite as Team Admin</button>
        </div>
      </div>
      <div id="invite-message-${team.id}" class="mt-2"></div>
    `;
    teamList.appendChild(li);
  });

  // Attach invite handlers
  document.querySelectorAll(`#team-list-${orgId} .invite-team-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const teamId = e.target.dataset.teamId;
      const email = document.getElementById(`invite-email-${teamId}`).value.trim();
      if (!email) {
        alert('Please enter an email');
        return;
      }
      const res = await api(`/teams/${teamId}/invite-admin`, {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      const msg = document.getElementById(`invite-message-${teamId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Invitation sent!</div>';
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
      }
    });
  });
}

// Initialization function called from app.js
export function initOrgAdmin() {
  loadMyOrgs();
} 