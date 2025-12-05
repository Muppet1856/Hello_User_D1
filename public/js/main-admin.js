// public/js/main-admin.js
import { api } from './app.js';

// This file handles Main Admin tab population and logic

// Populate Main Admin tab
const mainAdminTab = document.getElementById('main-admin');
mainAdminTab.innerHTML = `
  <h3>Main Admin - Organization Manager</h3>
  <div class="mb-4">
    <h4>Create Organization</h4>
    <input id="new-org-name" class="form-control mb-2" placeholder="Organization Name">
    <button class="btn btn-primary" id="create-org-btn">Create</button>
    <div id="create-org-message" class="mt-2"></div>
  </div>
  <div class="accordion" id="mainOrgAccordion"></div>
`;

// Preserve accordion open/closed state when rebuilding the DOM
function getOpenCollapseIds(container) {
  if (!container) return new Set();
  return new Set(Array.from(container.querySelectorAll('.accordion-collapse.show')).map(el => el.id));
}

function restoreOpenCollapseState(container, openIds) {
  if (!container || !openIds) return;
  openIds.forEach(id => {
    const collapseEl = container.querySelector(`#${id}`);
    if (!collapseEl) return;
    collapseEl.classList.add('show');
    const trigger = container.querySelector(`[data-bs-target="#${id}"]`);
    if (trigger) {
      trigger.classList.remove('collapsed');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
}

// Attach create org handler
document.getElementById('create-org-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-org-name').value.trim();
  if (!name) {
    alert('Please enter an organization name');
    return;
  }
  const res = await api('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  const msg = document.getElementById('create-org-message');
  if (res.ok) {
    msg.innerHTML = '<div class="alert alert-success">Organization created!</div>';
    loadAllOrgs(); // Refresh orgs
  } else {
    msg.innerHTML = '<div class="alert alert-danger">Failed to create organization.</div>';
  }
});

// Load all orgs and build UI
async function loadAllOrgs() {
  const res = await api('/organizations');
  if (!res.ok) {
    alert('Failed to load organizations');
    return;
  }
  const orgs = await res.json();
  const accordion = document.getElementById('mainOrgAccordion');
  if (!accordion) return;
  const openCollapseIds = getOpenCollapseIds(accordion);
  accordion.innerHTML = '';

  if (!orgs.length) {
    accordion.innerHTML = '<p>No organizations found.</p>';
    return;
  }

  const teamLoaders = [];
  for (const org of orgs) {
    const itemId = `main-org-${org.id}`;
    const collapseId = `main-collapse-org-${org.id}`;
    const shouldExpand = openCollapseIds.has(collapseId);
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.innerHTML = `
      <h2 class="accordion-header" id="${itemId}">
        <button class="accordion-button ${shouldExpand ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${shouldExpand ? 'true' : 'false'}" aria-controls="${collapseId}">
          <table class="w-100">
            <tr>
              <td>${org.name} (ID: ${org.id})</td>
              <td class="text-end pe-5">
                <button class="btn btn-warning btn-sm rename-btn me-1" data-org-id="${org.id}" data-org-name="${org.name}">Rename</button>
                <button class="btn btn-danger btn-sm delete-btn" data-org-id="${org.id}">Delete</button>
              </td>
            </tr>
          </table>
        </button>
      </h2>
      <div id="${collapseId}" class="accordion-collapse collapse ${shouldExpand ? 'show' : ''}" aria-labelledby="${itemId}" data-bs-parent="#mainOrgAccordion">
        <div class="accordion-body">
          <div class="mb-4">
            <h4>Invite Org Admin</h4>
            <input id="invite-org-admin-email-${org.id}" class="form-control mb-2" placeholder="Email" type="email">
            <button class="btn btn-secondary invite-org-admin-btn" data-org-id="${org.id}">Invite</button>
            <div id="invite-org-admin-message-${org.id}" class="mt-2"></div>
          </div>
          <div class="accordion" id="mainTeamAccordion-${org.id}"></div>
        </div>
      </div>
    `;
    accordion.appendChild(item);

    // Attach rename handler (opens modal)
    item.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering collapse
      const orgId = e.target.dataset.orgId;
      const currentName = e.target.dataset.orgName;
      showRenameModal(orgId, currentName);
    });

    // Attach delete handler (opens modal)
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering collapse
      const orgId = e.target.dataset.orgId;
      showDeleteModal(orgId);
    });

    // Attach invite org admin handler
    item.querySelector('.invite-org-admin-btn').addEventListener('click', async (e) => {
      const orgId = e.target.dataset.orgId;
      const email = document.getElementById(`invite-org-admin-email-${orgId}`).value.trim();
      if (!email) {
        alert('Please enter an email');
        return;
      }
      const res = await api(`/organizations/${orgId}/invite-admin`, {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      const msg = document.getElementById(`invite-org-admin-message-${orgId}`);
      if (res.ok) {
        msg.innerHTML = '<div class="alert alert-success">Invitation sent!</div>';
      } else {
        msg.innerHTML = '<div class="alert alert-danger">Failed to send invitation.</div>';
      }
    });

    teamLoaders.push(loadTeamsForOrg(org.id, openCollapseIds));
  }

  await Promise.all(teamLoaders);
  restoreOpenCollapseState(accordion, openCollapseIds);
}

// Load teams for a specific org (if needed; assuming similar to org-admin)
async function loadTeamsForOrg(orgId, openCollapseIds) {
  // Implement if Main Admin needs team listing inside orgs; otherwise remove or leave empty
  const res = await api(`/organizations/${orgId}/teams`);
  if (!res.ok) {
    alert('Failed to load teams');
    return;
  }
  const teams = await res.json();
  const teamAccordion = document.getElementById(`mainTeamAccordion-${orgId}`);
  if (!teamAccordion) return;
  const openTeamIds = openCollapseIds
    ? new Set([...openCollapseIds].filter(id => id.includes('team') && id.endsWith(`-${orgId}`)))
    : getOpenCollapseIds(teamAccordion);
  teamAccordion.innerHTML = '';

  if (!teams.length) {
    teamAccordion.innerHTML = '<p>No teams found.</p>';
    return;
  }

  // Add team accordions similar to org-admin.js if required
  // For now, assuming not needed; extend as per your repo
  restoreOpenCollapseState(teamAccordion, openTeamIds);
}

// Function to show rename modal
function showRenameModal(orgId, currentName) {
  const modalId = `renameModal-${orgId}`;
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Rename Organization</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form>
            <div class="mb-3">
              <label for="new-org-name-${orgId}" class="form-label">New Organization Name</label>
              <input type="text" class="form-control" id="new-org-name-${orgId}" value="${currentName}">
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
    const name = document.getElementById(`new-org-name-${orgId}`).value.trim();
    if (!name) {
      alert('Please enter a new name');
      return;
    }
    const res = await api(`/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      alert('Organization renamed!');
      loadAllOrgs(); // Refresh
    } else {
      alert('Failed to rename organization.');
    }
    bsModal.hide();
  });

  // Clean up modal after hide
  modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

// Function to show delete confirm modal
function showDeleteModal(orgId) {
  const modalId = `deleteModal-${orgId}`;
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
          <p>Are you sure you want to delete this organization? This action cannot be undone.</p>
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
    const res = await api(`/organizations/${orgId}`, { method: 'DELETE' });
    if (res.ok) {
      alert('Organization deleted!');
      loadAllOrgs(); // Refresh
    } else {
      alert('Failed to delete organization.');
    }
    bsModal.hide();
  });

  // Clean up modal after hide
  modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

// Initialization function called from app.js
export function initMainAdmin() {
  const mainTabLink = document.querySelector('#main-admin-nav a');
  if (mainTabLink) {
    mainTabLink.addEventListener('shown.bs.tab', loadAllOrgs);
  }
}
