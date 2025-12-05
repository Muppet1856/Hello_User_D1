import { api } from './app.js';

// This file handles Team Admin tab population and logic

// Populate Team Admin tab
const teamAdminTab = document.getElementById('team-admin');
teamAdminTab.innerHTML = `
  <h3>Team Admin - Member Manager</h3>
  <div class="accordion" id="teamAccordion"></div>
`;

// Load my teams and build UI
async function loadMyTeams() {
  const res = await api('/my-teams');
  if (!res.ok) {
    alert('Failed to load your teams');
    return;
  }
  const teams = await res.json();
  const accordion = document.getElementById('teamAccordion');
  accordion.innerHTML = '';

  if (!teams.length) {
    accordion.innerHTML = '<p>No teams found.</p>';
    return;
  }

  teams.forEach((team, index) => {
    const itemId = `team-${team.id}`;
    const collapseId = `collapse-${team.id}`;
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.innerHTML = `
      <h2 class="accordion-header" id="${itemId}">
        <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="${collapseId}">
          ${team.name} (ID: ${team.id}) in ${team.org_name} (Org ID: ${team.org_id})
        </button>
      </h2>
      <div id="${collapseId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="${itemId}" data-bs-parent="#teamAccordion">
        <div class="accordion-body">
          <div class="mb-4">
            <h4>Invite Users</h4>
            <div class="row mb-3">
              <div class="col-md-4">
                <h5>Statistician</h5>
                <input id="invite-stat-email-${team.id}" class="form-control mb-2" placeholder="Email" type="email">
                <button class="btn btn-secondary invite-btn" data-team-id="${team.id}" data-role="statistician">Invite</button>
                <div id="invite-stat-message-${team.id}" class="mt-2"></div>
              </div>
              <div class="col-md-4">
                <h5>Member</h5>
                <input id="invite-member-email-${team.id}" class="form-control mb-2" placeholder="Email" type="email">
                <button class="btn btn-secondary invite-btn" data-team-id="${team.id}" data-role="member">Invite</button>
                <div id="invite-member-message-${team.id}" class="mt-2"></div>
              </div>
              <div class="col-md-4">
                <h5>Guest</h5>
                <input id="invite-guest-email-${team.id}" class="form-control mb-2" placeholder="Email" type="email">
                <button class="btn btn-secondary invite-btn" data-team-id="${team.id}" data-role="guest">Invite</button>
                <div id="invite-guest-message-${team.id}" class="mt-2"></div>
              </div>
            </div>
          </div>
          <div class="mb-4">
            <h4>Existing Members</h4>
            <ul id="member-list-${team.id}" class="list-group"></ul>
          </div>
        </div>
      </div>
    `;
    accordion.appendChild(item);

    // Attach invite handlers
    item.querySelectorAll('.invite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const teamId = e.target.dataset.teamId;
        const role = e.target.dataset.role;
        const email = document.getElementById(`invite-${role}-email-${teamId}`).value.trim();
        if (!email) {
          alert('Please enter an email');
          return;
        }
        const res = await api(`/teams/${teamId}/invite`, {
          method: 'POST',
          body: JSON.stringify({ email, role })
        });
        const msg = document.getElementById(`invite-${role}-message-${teamId}`);
        if (res.ok) {
          msg.innerHTML = '<div class="alert alert-success">Invitation sent!</div>';
          loadMembers(teamId); // Refresh members after invite (in case immediate add, but typically after acceptance)
        } else {
          msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
        }
      });
    });

    loadMembers(team.id);
  });
}

// Load members for a specific team
async function loadMembers(teamId) {
  const res = await api(`/teams/${teamId}/members`);
  if (!res.ok) {
    alert('Failed to load members');
    return;
  }
  const members = await res.json();
  const memberList = document.getElementById(`member-list-${teamId}`);
  memberList.innerHTML = '';
  members.forEach(member => {
    const displayRole = member.role === 'team_admin' ? 'Team Admin' : member.role.charAt(0).toUpperCase() + member.role.slice(1);
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <span>${member.name || 'No Name'} (${member.email}) - Role: <span id="role-${member.user_id}-${teamId}">${displayRole}</span></span>
        <div>
          <select id="new-role-${member.user_id}-${teamId}" class="form-select d-inline-block w-auto me-2">
            <option value="statistician">Statistician</option>
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </select>
          <button class="btn btn-warning reassign-btn me-2" data-user-id="${member.user_id}" data-team-id="${teamId}">Re-assign</button>
          <button class="btn btn-danger remove-btn" data-user-id="${member.user_id}" data-team-id="${teamId}">Remove</button>
        </div>
      </div>
      <div id="member-message-${member.user_id}-${teamId}" class="mt-2"></div>
    `;
    memberList.appendChild(li);
  });

  // Attach re-assign handlers
  document.querySelectorAll(`#member-list-${teamId} .reassign-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const teamId = e.target.dataset.teamId;
      const newRole = document.getElementById(`new-role-${userId}-${teamId}`).value;
      if (!confirm(`Re-assign to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}?`)) return;
      const res = await api(`/teams/${teamId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      const msg = document.getElementById(`member-message-${userId}-${teamId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Role updated!</div>';
        const displayNewRole = newRole.charAt(0).toUpperCase() + newRole.slice(1);
        document.getElementById(`role-${userId}-${teamId}`).textContent = displayNewRole;
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to update role.</div>';
      }
    });
  });

  // Attach remove handlers
  document.querySelectorAll(`#member-list-${teamId} .remove-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const teamId = e.target.dataset.teamId;
      if (!confirm('Remove this user from the team?')) return;
      const res = await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      const msg = document.getElementById(`member-message-${userId}-${teamId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">User removed!</div>';
        loadMembers(teamId); // Refresh list
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to remove user.</div>';
      }
    });
  });
}

// Initialization function called from app.js
export function initTeamAdmin() {
  const teamTabLink = document.querySelector('#team-admin-nav a');
  if (teamTabLink) {
    teamTabLink.addEventListener('shown.bs.tab', loadMyTeams);
  }
}