// public/js/org-admin.js
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
    const collapseId = `collapse-org-${org.id}`;
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
            <h4>Create Team</h4>
            <input id="new-team-name-${org.id}" class="form-control mb-2" placeholder="Team Name">
            <button class="btn btn-primary create-team-btn" data-org-id="${org.id}">Create</button>
            <div id="create-team-message-${org.id}" class="mt-2"></div>
          </div>
          <div class="accordion" id="teamAccordion-${org.id}"></div>
        </div>
      </div>
    `;
    accordion.appendChild(item);

    // Attach create team handler
    item.querySelector('.create-team-btn').addEventListener('click', async (e) => {
      const orgId = e.target.dataset.orgId;
      const name = document.getElementById(`new-team-name-${orgId}`).value.trim();
      if (!name) {
        alert('Please enter a team name');
        return;
      }
      const res = await api(`/organizations/${orgId}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      const msg = document.getElementById(`create-team-message-${orgId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Team created!</div>';
        loadTeamsForOrg(orgId); // Refresh teams
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to create team.</div>';
      }
    });

    loadTeamsForOrg(org.id);
  });
}

// Load teams for a specific org
async function loadTeamsForOrg(orgId) {
  const res = await api(`/organizations/${orgId}/teams`);
  if (!res.ok) {
    alert('Failed to load teams');
    return;
  }
  const teams = await res.json();
  const teamAccordion = document.getElementById(`teamAccordion-${orgId}`);
  teamAccordion.innerHTML = '';

  if (!teams.length) {
    teamAccordion.innerHTML = '<p>No teams found.</p>';
    return;
  }

  teams.forEach((team, index) => {
    const itemId = `team-${team.id}-${orgId}`;
    const collapseId = `collapse-team-${team.id}-${orgId}`;
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.innerHTML = `
      <h2 class="accordion-header" id="${itemId}">
        <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="${collapseId}">
          <span>${team.name} (ID: ${team.id})</span>
          <span class="ms-auto">
            <button class="btn btn-warning btn-sm rename-btn me-1" data-team-id="${team.id}" data-team-name="${team.name}">Rename</button>
            <button class="btn btn-danger btn-sm delete-btn" data-team-id="${team.id}">Delete</button>
          </span>
        </button>
      </h2>
      <div id="${collapseId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="${itemId}" data-bs-parent="#teamAccordion-${orgId}">
        <div class="accordion-body">
          <div class="mb-4">
            <h4>Invite User</h4>
            <div class="row mb-3">
              <div class="col-md-6">
                <input id="invite-email-${team.id}" class="form-control mb-2" placeholder="Email" type="email">
              </div>
              <div class="col-md-4">
                <select id="invite-role-${team.id}" class="form-select mb-2">
                  <option value="team_admin">Team Admin</option>
                  <option value="statistician">Statistician</option>
                  <option value="member">Member</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div class="col-md-2">
                <button class="btn btn-secondary invite-btn" data-team-id="${team.id}">Invite</button>
              </div>
            </div>
            <div id="invite-message-${team.id}" class="mt-2"></div>
          </div>
          <div class="mb-4">
            <h4>Existing Members</h4>
            <div class="table-responsive">
              <table class="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="member-table-${team.id}"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    teamAccordion.appendChild(item);

    // Attach rename handler (opens modal)
    item.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering collapse
      const teamId = e.target.dataset.teamId;
      const currentName = e.target.dataset.teamName;
      showRenameModal(teamId, currentName, orgId);
    });

    // Attach delete handler (opens modal)
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering collapse
      const teamId = e.target.dataset.teamId;
      showDeleteModal(teamId, orgId);
    });

    // Attach invite handler
    item.querySelector('.invite-btn').addEventListener('click', async (e) => {
      const teamId = e.target.dataset.teamId;
      const email = document.getElementById(`invite-email-${teamId}`).value.trim();
      const role = document.getElementById(`invite-role-${teamId}`).value;
      if (!email) {
        alert('Please enter an email');
        return;
      }
      let endpoint = `/teams/${teamId}/invite`;
      let body = { email, role };
      if (role === 'team_admin') {
        endpoint = `/teams/${teamId}/invite-admin`;
        body = { email };
      }
      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const msg = document.getElementById(`invite-message-${teamId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Invitation sent!</div>';
        loadMembers(teamId);
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
      }
    });

    loadMembers(team.id);
  });
}

// Function to show rename modal
function showRenameModal(teamId, currentName, orgId) {
  const modalId = `renameModal-${teamId}`;
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Rename Team</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form>
            <div class="mb-3">
              <label for="new-team-name-${teamId}" class="form-label">New Team Name</label>
              <input type="text" class="form-control" id="new-team-name-${teamId}" value="${currentName}">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary confirm-rename-btn">OK</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();

  // Attach confirm rename handler
  modal.querySelector('.confirm-rename-btn').addEventListener('click', async () => {
    const name = document.getElementById(`new-team-name-${teamId}`).value.trim();
    if (!name) {
      alert('Please enter a new name');
      return;
    }
    const res = await api(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      alert('Team renamed!');
      loadTeamsForOrg(orgId); // Refresh
    } else {
      alert('Failed to rename team.');
    }
    bsModal.hide();
  });

  // Clean up modal after hide
  modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

// Function to show delete confirm modal
function showDeleteModal(teamId, orgId) {
  const modalId = `deleteModal-${teamId}`;
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Confirm Delete</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete this team? This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">No</button>
          <button type="button" class="btn btn-danger confirm-delete-btn">Yes</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();

  // Attach confirm delete handler
  modal.querySelector('.confirm-delete-btn').addEventListener('click', async () => {
    const res = await api(`/teams/${teamId}`, { method: 'DELETE' });
    if (res.ok) {
      alert('Team deleted!');
      loadTeamsForOrg(orgId); // Refresh
    } else {
      alert('Failed to delete team.');
    }
    bsModal.hide();
  });

  // Clean up modal after hide
  modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

// Load members for a specific team (same as before)
async function loadMembers(teamId) {
  const res = await api(`/teams/${teamId}/members`);
  if (!res.ok) {
    alert('Failed to load members');
    return;
  }
  let members = await res.json();

  const rolePriority = {
    'team_admin': 0,
    'statistician': 1,
    'member': 2,
    'guest': 3
  };
  members.sort((a, b) => rolePriority[a.role] - rolePriority[b.role]);

  const memberTableBody = document.getElementById(`member-table-${teamId}`);
  memberTableBody.innerHTML = '';
  members.forEach(member => {
    const displayRole = member.role === 'team_admin' ? 'Team Admin' : member.role.charAt(0).toUpperCase() + member.role.slice(1);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span id="role-${member.user_id}-${teamId}">${displayRole}</span></td>
      <td>${member.name || 'No Name'}</td>
      <td>${member.email}</td>
      <td>
        <select id="new-role-${member.user_id}-${teamId}" class="form-select d-inline-block w-auto me-2">
          <option value="team_admin">Team Admin</option>
          <option value="statistician">Statistician</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </select>
        <button class="btn btn-warning btn-sm reassign-btn me-2" data-user-id="${member.user_id}" data-team-id="${teamId}">Re-assign</button>
        <button class="btn btn-danger btn-sm remove-btn" data-user-id="${member.user_id}" data-team-id="${teamId}">Remove</button>
      </td>
    `;
    memberTableBody.appendChild(row);
  });

  // Attach re-assign handlers
  document.querySelectorAll(`#member-table-${teamId} .reassign-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const teamId = e.target.dataset.teamId;
      const newRole = document.getElementById(`new-role-${userId}-${teamId}`).value;
      if (!confirm(`Re-assign to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}?`)) return;
      const res = await api(`/teams/${teamId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        alert('Role updated!');
        const displayNewRole = newRole === 'team_admin' ? 'Team Admin' : newRole.charAt(0).toUpperCase() + newRole.slice(1);
        document.getElementById(`role-${userId}-${teamId}`).textContent = displayNewRole;
        loadMembers(teamId); // Refresh for sorting
      } else {
        alert('Failed to update role.');
      }
    });
  });

  // Attach remove handlers
  document.querySelectorAll(`#member-table-${teamId} .remove-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const teamId = e.target.dataset.teamId;
      if (!confirm('Remove this user from the team?')) return;
      const res = await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('User removed!');
        loadMembers(teamId); // Refresh list
      } else {
        alert('Failed to remove user.');
      }
    });
  });
}

// Initialization function called from app.js
export function initOrgAdmin() {
  const orgTabLink = document.querySelector('#org-admin-nav a');
  if (orgTabLink) {
    orgTabLink.addEventListener('shown.bs.tab', loadMyOrgs);
  }
}