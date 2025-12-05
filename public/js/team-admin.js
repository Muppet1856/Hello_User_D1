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
  let members = await res.json();

  // Sort members: team_admin first, then statistician, member, guest
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
      <td>${displayRole}</td>
      <td>${member.name || 'No Name'}</td>
      <td>${member.email}</td>
      <td>
        ${member.role !== 'team_admin' ? `
          <button class="btn btn-danger btn-sm remove-btn" data-user-id="${member.user_id}" data-team-id="${teamId}">Remove</button>
        ` : ''}
      </td>
    `;
    memberTableBody.appendChild(row);

    // Attach message div below the row if needed (but since table, we can append a td for messages if errors occur)
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
export function initTeamAdmin() {
  const teamTabLink = document.querySelector('#team-admin-nav a');
  if (teamTabLink) {
    teamTabLink.addEventListener('shown.bs.tab', loadMyTeams);
  }
}