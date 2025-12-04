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
        } else {
          msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
        }
      });
    });
  });
}

// Initialization function called from app.js
export function initTeamAdmin() {
  loadMyTeams();
}