const state = {
  currentUser: null,
  users: [],
  orgs: [],
  teams: [],
  orgMembers: [],
  teamMembers: [],
  passkeys: [],
  selectedOrgId: null,
  selectedTeamId: null,
  session: null,
  userOrganizations: [],
  userTeams: [],
  visiblePage: 'landing',
}

const ROLE_OPTIONS = ['admin', 'org_admin', 'team_admin', 'statistician', 'member', 'guest']

const hasRoleInOrganizations = (role) => state.userOrganizations.some((org) => org.role === role)
const hasRoleInTeams = (role) => state.userTeams.some((team) => team.role === role)

const getManagedOrgs = () => {
  if (hasRoleInOrganizations('admin')) return state.orgs
  return state.orgs.filter((org) =>
    state.userOrganizations.some((membership) => membership.id === org.id && membership.role === 'org_admin')
  )
}

const getManagedTeams = () => {
  if (hasRoleInOrganizations('admin')) return state.teams
  const managedOrgIds = state.userOrganizations
    .filter((membership) => membership.role === 'org_admin')
    .map((membership) => membership.id)
  if (hasRoleInTeams('team_admin')) {
    const teamAdminIds = state.userTeams
      .filter((team) => team.role === 'team_admin')
      .map((team) => team.id)
    return state.teams.filter((team) => managedOrgIds.includes(team.organizationId) || teamAdminIds.includes(team.id))
  }
  return state.teams.filter((team) => managedOrgIds.includes(team.organizationId))
}

const PAGE_CONFIG = [
  {
    id: 'landing',
    label: 'Home',
    sectionId: 'hero',
    predicate: () => true,
  },
  {
    id: 'userAdmin',
    label: 'User Admin',
    sectionId: 'admin',
    predicate: () => hasRoleInOrganizations('admin'),
  },
  {
    id: 'organizationAdmin',
    label: 'Organization Admin',
    sectionId: 'orgs',
    predicate: () => hasRoleInOrganizations('org_admin') || hasRoleInOrganizations('admin'),
  },
  {
    id: 'teamAdmin',
    label: 'Team Admin',
    sectionId: 'teams',
    predicate: () => hasRoleInTeams('team_admin') || hasRoleInOrganizations('admin'),
  },
  {
    id: 'account',
    label: 'Account',
    sectionId: 'account',
    predicate: () => Boolean(state.currentUser),
  },
]

const getAccessiblePages = () => PAGE_CONFIG.filter((page) => page.predicate())

const alertContainer = document.getElementById('status-alert')
const accountProfile = document.getElementById('account-profile')
const teamOrgSelect = document.getElementById('team-org-select')
const orgAdminSelect = document.getElementById('org-admin-select')
const teamSelect = document.getElementById('team-select')
const teamRoleSelect = document.getElementById('team-role-select')
const teamRoleFormSelect = document.getElementById('team-role-form-select')
const orgRoleSelect = document.getElementById('org-role-select')
const orgInviteLink = document.getElementById('org-invite-link')
const dynamicNav = document.getElementById('dynamic-nav')
const pageSections = Array.from(document.querySelectorAll('[data-page-section]'))

const fetchJson = async (path, options = {}) => {
  try {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { message: error.message } }
  }
}

const showAlert = (message, variant = 'info') => {
  alertContainer.innerHTML = `
    <div class="alert alert-${variant} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `
}

const clearAlert = () => {
  alertContainer.innerHTML = ''
}

const enablePasskeyForms = (enabled) => {
  document.querySelectorAll('[data-requires-session] input, [data-requires-session] button').forEach((el) => {
    el.disabled = !enabled
  })
}

const buildInviteLink = ({ scopeType, scopeId, role }) => {
  const url = new URL(window.location.href)
  url.searchParams.set('scope', `${scopeType}:${scopeId}`)
  url.searchParams.set('role', role)
  const token = document.getElementById('magic-token')?.value?.trim()
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

const handleOrgSelectionChange = async (orgId) => {
  state.selectedOrgId = orgId
  if (teamOrgSelect) teamOrgSelect.value = orgId || ''
  if (orgAdminSelect) orgAdminSelect.value = orgId || ''
  if (orgInviteLink) orgInviteLink.textContent = ''
  await loadOrgMembers(orgId)
  await loadTeams(orgId)
}

const showPage = (pageId) => {
  state.visiblePage = pageId
  pageSections.forEach((section) => {
    const shouldShow = section.dataset.pageSection === pageId
    section.classList.toggle('d-none', !shouldShow)
  })
  document.querySelectorAll('[data-page-link]').forEach((link) => {
    link.classList.toggle('active', link.dataset.pageLink === pageId)
  })
}

const renderNavLinks = () => {
  if (!dynamicNav) return
  const pages = getAccessiblePages()
  dynamicNav.innerHTML = pages
    .map(
      (page) => `
        <li class="nav-item">
          <a class="nav-link ${state.visiblePage === page.id ? 'active' : ''}" href="#${page.sectionId}" data-page-link="${page.id}">
            ${page.label}
          </a>
        </li>
      `
    )
    .join('')
  if (state.currentUser) {
    dynamicNav.insertAdjacentHTML(
      'beforeend',
      `
        <li class="nav-item ms-2">
          <button class="btn btn-outline-light btn-sm" type="button" data-sign-out>Sign out</button>
        </li>
      `
    )
  }
}

const setCurrentSession = (session) => {
  state.session = session
  state.userOrganizations = session?.organizations ?? []
  state.userTeams = session?.teams ?? []
  if (!session) {
    state.orgMembers = []
    state.teamMembers = []
    state.selectedOrgId = null
    state.selectedTeamId = null
  }
  setCurrentUser(session?.user ?? null)
  renderNavLinks()
  const targetPage = session ? 'account' : 'landing'
  showPage(targetPage)
}

const loadSessionById = async (userId) => {
  const { ok, data } = await fetchJson(`/api/users/${userId}`)
  if (!ok) {
    showAlert(data.message || 'Unable to load your profile', 'danger')
    return null
  }
  return data
}

const handleLoginSuccess = async (payload) => {
  if (!payload) return
  if (payload.session) {
    setCurrentSession(payload.session)
    await loadOrgs()
    return
  }
  const userId =
    typeof payload === 'string' ? payload : payload.user?.id ?? payload.userId ?? payload.id
  if (!userId) return
  const session = await loadSessionById(userId)
  if (session) {
    setCurrentSession(session)
    await loadOrgs()
  }
}

const handleSignOut = () => {
  setCurrentSession(null)
  showAlert('Signed out of Hello User D1', 'info')
}

if (dynamicNav) {
  dynamicNav.addEventListener('click', (event) => {
    const pageLink = event.target.closest('[data-page-link]')
    if (pageLink) {
      event.preventDefault()
      showPage(pageLink.dataset.pageLink)
      return
    }
    const signOutButton = event.target.closest('[data-sign-out]')
    if (signOutButton) {
      handleSignOut()
    }
  })
}

const setCurrentUser = (user) => {
  state.currentUser = user || null
  renderAccount()
  if (user) {
    document.getElementById('magic-verify-email').value = user.email
    loadPasskeys()
    enablePasskeyForms(true)
  } else {
    state.passkeys = []
    renderPasskeys()
    enablePasskeyForms(false)
  }
}

const renderAccount = () => {
  const form = document.getElementById('account-form')
  if (!state.currentUser) {
    accountProfile.innerHTML = 'Sign in with a magic link or passkey to see your details.'
    form.querySelectorAll('input, button').forEach((el) => (el.disabled = true))
    form.reset()
    return
  }
  accountProfile.innerHTML = `
    <strong>${state.currentUser.email}</strong>
    <div class="text-muted small">ID: ${state.currentUser.id}</div>
    <div class="text-muted small">Verified: ${state.currentUser.verified ? 'Yes' : 'Pending'}</div>
  `
  form.querySelectorAll('input, button').forEach((el) => (el.disabled = false))
  form.firstName.value = state.currentUser.firstName ?? ''
  form.lastName.value = state.currentUser.lastName ?? ''
  form.avatarUrl.value = state.currentUser.avatarUrl ?? ''
}

const renderUsers = () => {
  const body = document.getElementById('users-table-body')
  if (!state.users.length) {
    body.innerHTML = '<tr><td colspan="6" class="text-muted text-center">No users yet.</td></tr>'
    return
  }
  body.innerHTML = state.users
    .map(
      (user) => `
        <tr>
          <td class="text-truncate" style="max-width: 150px;">
            ${user.id}
          </td>
          <td>${user.email}</td>
          <td>${[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}</td>
          <td>
            ${
              user.verified
                ? '<span class="badge bg-success">yes</span>'
                : '<span class="badge bg-warning text-dark">pending</span>'
            }
          </td>
          <td>${new Date(user.createdAt).toLocaleString()}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-copy-user="${user.id}">
              Copy ID
            </button>
          </td>
        </tr>
      `
    )
    .join('')
}

const renderOrgList = () => {
  const container = document.getElementById('org-list')
  if (!state.orgs.length) {
    container.innerHTML =
      '<div class="col"><div class="border border-dashed rounded-3 p-4 text-muted text-center">No organizations yet.</div></div>'
    return
  }
  container.innerHTML = state.orgs
    .map(
      (org) => `
        <div class="col">
          <div class="card h-100 border-secondary">
            <div class="card-body d-flex flex-column">
              <div>
                <h5 class="card-title mb-1">${org.name}</h5>
                <p class="text-muted mb-2">@${org.slug}</p>
              </div>
              <p class="text-muted small mb-4">Created ${new Date(org.createdAt).toLocaleDateString()}</p>
              <div class="mt-auto d-flex justify-content-between">
                <span class="text-muted small">ID ${org.id}</span>
                <button class="btn btn-sm btn-outline-danger" data-org-delete="${org.id}">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `
    )
    .join('')
}

const renderOrgMembers = () => {
  const list = document.getElementById('org-members')
  if (!list) return
  if (!state.orgMembers.length) {
    list.innerHTML = '<li class="list-group-item text-muted">No members added yet.</li>'
    return
  }
  list.innerHTML = state.orgMembers
    .map((member) => {
      const canRemove = member.role !== 'org_admin'
      return `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-semibold">${member.email}</div>
            <div class="text-muted small">${[member.first_name, member.last_name].filter(Boolean).join(' ')}</div>
            <span class="badge bg-secondary mt-1">${member.role}</span>
          </div>
          <button class="btn btn-sm btn-outline-danger" data-org-remove="${member.id}" ${
            canRemove ? '' : 'disabled'
          }>
            ${canRemove ? 'Remove' : 'Locked'}
          </button>
        </li>
      `
    })
    .join('')
}

const renderTeamList = () => {
  const container = document.getElementById('team-list')
  const visibleTeams = getManagedTeams()
  if (!visibleTeams.length) {
    container.innerHTML =
      '<div class="col"><div class="border border-dashed rounded-3 p-4 text-muted text-center">No teams created yet.</div></div>'
    return
  }
  container.innerHTML = visibleTeams
    .map(
      (team) => `
        <div class="col">
          <div class="card h-100 ${team.id === state.selectedTeamId ? 'border-primary shadow-sm' : ''}">
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between gap-2">
                <div>
                  <h5 class="card-title mb-1">${team.name}</h5>
                  <p class="text-muted small mb-2">${team.description || 'No description'}</p>
                </div>
                <button class="btn btn-sm btn-outline-danger" data-team-delete="${team.id}">
                  Delete
                </button>
              </div>
              <p class="text-muted small mb-3">Team ID: ${team.id}</p>
              <button class="btn btn-sm btn-primary mt-auto" data-team-select="${team.id}">
                View members
              </button>
            </div>
          </div>
        </div>
      `
    )
    .join('')
}

const renderTeamMembers = () => {
  const list = document.getElementById('team-members')
  if (!state.teamMembers.length) {
    list.innerHTML = '<li class="list-group-item text-muted">No members added yet.</li>'
    return
  }
  list.innerHTML = state.teamMembers
    .map(
      (member) => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-semibold">${member.email}</div>
            <div class="text-muted small">${[member.first_name, member.last_name].filter(Boolean).join(' ')}</div>
            <span class="badge bg-secondary mt-1">${member.role}</span>
          </div>
          <button class="btn btn-sm btn-outline-danger" data-team-remove="${member.id}" ${
            member.role === 'team_admin' ? 'disabled' : ''
          }>
            ${member.role === 'team_admin' ? 'Locked' : 'Remove'}
          </button>
        </li>
      `
    )
    .join('')
}

const renderPasskeys = () => {
  const container = document.getElementById('passkey-list')
  if (!state.passkeys.length) {
    container.innerHTML = '<p class="text-muted small mb-0">No passkeys registered yet.</p>'
    return
  }
  container.innerHTML = `
    <div class="list-group">
      ${state.passkeys
        .map(
          (pk) => `
            <div class="list-group-item d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold">${pk.name}</div>
                <small class="text-muted d-block">${pk.credentialId}</small>
                <small class="text-muted">Created ${new Date(pk.createdAt).toLocaleString()}</small>
              </div>
              <button class="btn btn-sm btn-outline-primary" data-use-credential="${pk.credentialId}">
                Use
              </button>
            </div>
          `
        )
        .join('')}
    </div>
  `
}

const updateTeamOrgSelect = () => {
  if (!teamOrgSelect) return
  const manageableOrgs = getManagedOrgs()
  teamOrgSelect.innerHTML = manageableOrgs.map((org) => `<option value="${org.id}">${org.name}</option>`).join('')
  if (manageableOrgs.length) {
    state.selectedOrgId = state.selectedOrgId || manageableOrgs[0].id
    teamOrgSelect.value = state.selectedOrgId
  } else {
    state.selectedOrgId = null
    teamOrgSelect.innerHTML = '<option value="">No organizations</option>'
  }
  if (orgAdminSelect) {
    orgAdminSelect.innerHTML = manageableOrgs.map((org) => `<option value="${org.id}">${org.name}</option>`).join('')
    orgAdminSelect.value = state.selectedOrgId || ''
  }
}

const updateTeamSelectOptions = () => {
  if (!teamSelect) return
  const manageableTeams = getManagedTeams()
  teamSelect.innerHTML = manageableTeams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('')
  if (manageableTeams.length) {
    state.selectedTeamId = state.selectedTeamId || manageableTeams[0].id
    teamSelect.value = state.selectedTeamId
  } else {
    state.selectedTeamId = null
    teamSelect.innerHTML = '<option value="">No teams</option>'
  }
}

const updateMemberUserSelect = () => {
  const select = document.getElementById('team-user-select')
  const orgSelect = document.getElementById('org-user-select')
  if (!select && !orgSelect) return
  if (!state.users.length) {
    if (select) {
      select.innerHTML = '<option value="">Create a user first</option>'
      select.disabled = true
    }
    if (orgSelect) {
      orgSelect.innerHTML = '<option value="">Create a user first</option>'
      orgSelect.disabled = true
    }
    return
  }
  const html = state.users
    .map(
      (user) =>
        `<option value="${user.id}">${user.email} (${[user.firstName, user.lastName]
          .filter(Boolean)
          .join(' ')})</option>`
    )
    .join('')
  if (select) {
    select.disabled = false
    select.innerHTML = html
  }
  if (orgSelect) {
    orgSelect.disabled = false
    orgSelect.innerHTML = html
  }
}

const fillRoleSelects = () => {
  const html = ROLE_OPTIONS.map((role) => `<option value="${role}">${role}</option>`).join('')
  if (teamRoleSelect) teamRoleSelect.innerHTML = html
  if (teamRoleFormSelect) teamRoleFormSelect.innerHTML = html
  if (orgRoleSelect) orgRoleSelect.innerHTML = html
}

const loadUsers = async () => {
  const { ok, data } = await fetchJson('/api/admin/users')
  if (!ok) {
    showAlert(data.message || 'Unable to load users', 'danger')
    return
  }
  state.users = data.users ?? []
  renderUsers()
  updateMemberUserSelect()
}

const loadOrgs = async () => {
  const { ok, data } = await fetchJson('/api/organizations')
  if (!ok) {
    showAlert(data.message || 'Unable to load organizations', 'danger')
    return
  }
  state.orgs = data.organizations ?? []
  renderOrgList()
  updateTeamOrgSelect()
  await loadOrgMembers(state.selectedOrgId)
  if (state.selectedOrgId) {
    await loadTeams(state.selectedOrgId)
  } else {
    state.teams = []
    updateTeamSelectOptions()
    renderTeamList()
    state.teamMembers = []
    renderTeamMembers()
  }
}

const loadOrgMembers = async (orgId) => {
  if (!orgId) {
    state.orgMembers = []
    renderOrgMembers()
    return
  }
  const { ok, data } = await fetchJson(`/api/organizations/${orgId}/members`)
  if (!ok) {
    showAlert(data.message || 'Unable to load org members', 'danger')
    return
  }
  state.orgMembers = data.members ?? []
  renderOrgMembers()
}

const loadTeams = async (orgId) => {
  if (!orgId) {
    state.teams = []
    updateTeamSelectOptions()
    renderTeamList()
    state.teamMembers = []
    renderTeamMembers()
    return
  }
  const { ok, data } = await fetchJson(`/api/organizations/${orgId}/teams`)
  if (!ok) {
    showAlert(data.message || 'Unable to load teams', 'danger')
    return
  }
  state.teams = data.teams ?? []
  const manageableTeams = getManagedTeams()
  state.selectedTeamId = manageableTeams.length ? manageableTeams[0].id : null
  renderTeamList()
  updateTeamSelectOptions()
  if (state.selectedTeamId) {
    await loadTeamMembers(state.selectedTeamId)
  } else {
    state.teamMembers = []
    renderTeamMembers()
  }
}

const loadTeamMembers = async (teamId) => {
  if (!teamId) {
    state.teamMembers = []
    renderTeamMembers()
    return
  }
  const { ok, data } = await fetchJson(`/api/teams/${teamId}/members`)
  if (!ok) {
    showAlert(data.message || 'Unable to load members', 'danger')
    return
  }
  state.teamMembers = data.members ?? []
  renderTeamMembers()
}

const loadPasskeys = async () => {
  if (!state.currentUser) return
  const { ok, data } = await fetchJson(`/api/auth/passkeys/${state.currentUser.id}`)
  if (!ok) {
    showAlert(data.message || 'Unable to load passkeys', 'danger')
    return
  }
  state.passkeys = data.passkeys ?? []
  renderPasskeys()
}

document.getElementById('magic-link-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email: payload.email }),
  })
  showAlert(data.message || 'Magic link requested', ok ? 'success' : 'danger')
  if (ok) {
    document.getElementById('magic-token').value = data.token || ''
    document.getElementById('magic-verify-email').value = payload.email
  }
})

document.getElementById('magic-link-verify-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/auth/magic-link/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  showAlert(data.message || 'Magic link verified', ok ? 'success' : 'danger')
  if (ok) {
    await handleLoginSuccess(data)
    document.getElementById('magic-token').value = ''
  }
})

document.getElementById('passkey-register-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.currentUser) {
    showAlert('Sign in before registering a passkey', 'warning')
    return
  }
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/auth/passkeys/register', {
    method: 'POST',
    body: JSON.stringify({
      userId: state.currentUser.id,
      name: payload.name || 'Unnamed device',
    }),
  })
  showAlert(data.message || 'Passkey registered', ok ? 'success' : 'danger')
  if (ok) {
    loadPasskeys()
  }
})

document.getElementById('passkey-auth-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/auth/passkeys/authenticate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  showAlert(data.message || 'Passkey accepted', ok ? 'success' : 'danger')
  if (ok) {
    await handleLoginSuccess(data)
  }
})

document.getElementById('create-user-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  showAlert(data.message || 'User created', ok ? 'success' : 'danger')
  if (ok) {
    form.reset()
    await loadUsers()
  }
})

document.getElementById('refresh-users').addEventListener('click', async (event) => {
  event.preventDefault()
  await loadUsers()
})

document.getElementById('users-table-body').addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-user]')
  if (!button) return
  const userId = button.dataset.copyUser
  navigator.clipboard.writeText(userId).then(() => {
    showAlert('Copied user ID to clipboard', 'success')
  })
})

document.getElementById('create-org-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson('/api/organizations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  showAlert(data.message || 'Organization created', ok ? 'success' : 'danger')
  if (ok) {
    form.reset()
    await loadOrgs()
  }
})

document.getElementById('org-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-org-delete]')
  if (!button) return
  const orgId = button.dataset.orgDelete
  const { ok, data } = await fetchJson(`/api/organizations/${orgId}`, {
    method: 'DELETE',
  })
  showAlert(data.message || 'Organization removed', ok ? 'success' : 'danger')
  if (ok) {
    await loadOrgs()
  }
})

document.getElementById('add-org-member-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.selectedOrgId) {
    showAlert('Select an organization you administer first', 'warning')
    return
  }
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson(`/api/organizations/${state.selectedOrgId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const inviteLink = buildInviteLink({ scopeType: 'org', scopeId: state.selectedOrgId, role: payload.role })
  const inviteMessage = `${data.message || 'Member invited to org'}<div class="small mt-2">Invite link: <a href="${inviteLink}" class="link-primary">${inviteLink}</a></div>`
  showAlert(inviteMessage, ok ? 'success' : 'danger')
  if (ok) {
    form.reset()
    if (orgInviteLink) orgInviteLink.textContent = `Share this org invitation: ${inviteLink}`
    await loadOrgMembers(state.selectedOrgId)
  }
})

document.getElementById('org-members').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-org-remove]')
  if (!button || !state.selectedOrgId) return
  const memberId = button.dataset.orgRemove
  const member = state.orgMembers.find((m) => m.id === memberId)
  if (member?.role === 'org_admin') return
  const { ok, data } = await fetchJson(`/api/organizations/${state.selectedOrgId}/members/${memberId}`, {
    method: 'DELETE',
  })
  showAlert(data.message || 'Member removed', ok ? 'success' : 'danger')
  if (ok) {
    await loadOrgMembers(state.selectedOrgId)
  }
})

document.getElementById('team-org-select').addEventListener('change', async (event) => {
  await handleOrgSelectionChange(event.target.value)
})

document.getElementById('org-admin-select').addEventListener('change', async (event) => {
  await handleOrgSelectionChange(event.target.value)
})

document.getElementById('team-select').addEventListener('change', async (event) => {
  state.selectedTeamId = event.target.value
  await loadTeamMembers(state.selectedTeamId)
})

document.getElementById('refresh-teams').addEventListener('click', async (event) => {
  event.preventDefault()
  if (state.selectedOrgId) {
    await loadTeams(state.selectedOrgId)
  }
})

document.getElementById('create-team-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.selectedOrgId) {
    showAlert('Select an organization first', 'warning')
    return
  }
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson(`/api/organizations/${state.selectedOrgId}/teams`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  showAlert(data.message || 'Team created', ok ? 'success' : 'danger')
  if (ok) {
    form.reset()
    await loadTeams(state.selectedOrgId)
  }
})

document.getElementById('team-list').addEventListener('click', async (event) => {
  const selectButton = event.target.closest('[data-team-select]')
  const deleteButton = event.target.closest('[data-team-delete]')
  if (selectButton) {
    state.selectedTeamId = selectButton.dataset.teamSelect
    if (teamSelect) teamSelect.value = state.selectedTeamId
    await loadTeamMembers(state.selectedTeamId)
    renderTeamList()
    return
  }
  if (deleteButton) {
    const teamId = deleteButton.dataset.teamDelete
    const { ok, data } = await fetchJson(`/api/teams/${teamId}`, { method: 'DELETE' })
    showAlert(data.message || 'Team deleted', ok ? 'success' : 'danger')
    if (ok && state.selectedOrgId) {
      await loadTeams(state.selectedOrgId)
    }
  }
})

document.getElementById('add-team-member-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.selectedTeamId) {
    showAlert('Pick a team before adding members', 'warning')
    return
  }
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const { ok, data } = await fetchJson(`/api/teams/${state.selectedTeamId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const inviteLink = buildInviteLink({ scopeType: 'team', scopeId: state.selectedTeamId, role: payload.role })
  const inviteMessage = `${data.message || 'Member assigned'}<div class="small mt-2">Invite link: <a href="${inviteLink}" class="link-primary">${inviteLink}</a></div>`
  showAlert(inviteMessage, ok ? 'success' : 'danger')
  if (ok) {
    form.reset()
    await loadTeamMembers(state.selectedTeamId)
  }
})

document.getElementById('team-members').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-team-remove]')
  if (!button || !state.selectedTeamId) return
  const memberId = button.dataset.teamRemove
  const member = state.teamMembers.find((m) => m.id === memberId)
  if (member?.role === 'team_admin') return
  const { ok, data } = await fetchJson(`/api/teams/${state.selectedTeamId}/members/${memberId}`, {
    method: 'DELETE',
  })
  showAlert(data.message || 'Member removed', ok ? 'success' : 'danger')
  if (ok) {
    await loadTeamMembers(state.selectedTeamId)
  }
})

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.currentUser) {
    showAlert('Sign in first to update your info', 'warning')
    return
  }
  const form = event.currentTarget
  const payload = Object.fromEntries(new FormData(form))
  const body = {
    firstName: payload.firstName?.trim() || null,
    lastName: payload.lastName?.trim() || null,
    avatarUrl: payload.avatarUrl?.trim() || null,
  }
  const { ok, data } = await fetchJson(`/api/users/${state.currentUser.id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  showAlert(data.message || 'Profile updated', ok ? 'success' : 'danger')
  if (ok && data.user) {
    setCurrentUser(data.user)
  }
})

document.getElementById('passkey-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-use-credential]')
  if (!button) return
  document.getElementById('passkey-credential-id').value = button.dataset.useCredential
  showAlert('Credential loaded into the form', 'info')
})

const init = async () => {
  fillRoleSelects()
  renderNavLinks()
  showPage(state.visiblePage)
  await Promise.all([loadUsers(), loadOrgs()])
  renderUsers()
  renderOrgList()
  renderOrgMembers()
  renderTeamList()
  renderTeamMembers()
  renderPasskeys()
  renderAccount()
  enablePasskeyForms(Boolean(state.currentUser))
}

init()
