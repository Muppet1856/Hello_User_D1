import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import {
  adminUserCreateSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  organizationPayloadSchema,
  orgMemberPayloadSchema,
  passkeyAuthSchema,
  passkeyRegisterSchema,
  roleEnum,
  invitationPayloadSchema,
  teamMemberPayloadSchema,
  teamPayloadSchema,
  userUpdateSchema,
} from './lib/zod_validator'

export interface Env {
  ASSETS: any
  HELLO_USER_DB: D1Database
  DB?: D1Database
  MATCH_DO: DurableObjectNamespace
  RESEND_API_KEY: string
  APP_URL: string
  debug?: string
  HOME_TEAM?: string
}

type RowResult<T> = {
  results?: T[]
}

type UserRow = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  verified: number
  magic_token: string | null
  created_at: string
}

type OrganizationRow = {
  id: string
  name: string
  slug: string
  created_at: string
}

type TeamRow = {
  id: string
  organization_id: string
  name: string
  description: string | null
  created_at: string
}

type OrgMembershipRow = {
  id: string
  organization_id: string
  user_id: string
  role: string
}

type TeamMembershipRow = {
  id: string
  team_id: string
  user_id: string
  role: string
}

type OrgDetailRow = {
  organization_id: string
  name: string
  slug: string
  role: string
  membership_id: string
}

type TeamDetailRow = {
  team_id: string
  name: string
  description: string | null
  organization_id: string
  role: string
  membership_id: string
}

type MagicLinkRow = {
  id: string
  user_id: string
  expires_at: string
}

type UserRoleRow = {
  id: string
  user_id: string
  role: string
  org_id: string | null
  team_id: string | null
  created_at: string
}

type InvitationRow = {
  id: string
  token: string
  email: string
  role: string
  org_id: string | null
  team_id: string | null
  expires_at: string
  created_by: string
}

type PasskeyRow = {
  id: string
  user_id: string
  name: string
  credential_id: string
  public_key: string
  counter: number
  created_at: string
}

type OrgMemberDetailRow = OrgMembershipRow & {
  email: string
  first_name: string | null
  last_name: string | null
}

type TeamMemberDetailRow = TeamMembershipRow & {
  email: string
  first_name: string | null
  last_name: string | null
}

type AuthContext = {
  userId: string
  roles: string[]
}

const API_PREFIX = '/api'

const app = new Hono<Env>()

// Helpers -------------------------------------------------------

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const generateId = () => crypto.randomUUID()
const randomToken = () => crypto.randomUUID().split('-')[0]
const getDb = (env: Env): D1Database => env.HELLO_USER_DB ?? env.DB ?? (() => { throw new Error('Missing D1 binding') })()
const parseAuth = (request: Request): AuthContext | null => {
  const userId = request.headers.get('x-user-id')?.trim()
  const roles = request.headers
    .get('x-user-roles')
    ?.split(',')
    .map((role) => role.trim())
    .filter(Boolean)

  if (!userId || !roles?.length) return null

  return { userId, roles }
}

const isMainAdmin = (auth: AuthContext) => auth.roles.includes('main_admin')

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const toBase64Url = (input: Uint8Array | ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4 || 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const getSigningSecret = (env: Env) => env.RESEND_API_KEY ?? env.APP_URL ?? 'hello-user-secret'

const getSigningKey = async (env: Env) =>
  await crypto.subtle.importKey('raw', encoder.encode(getSigningSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

const signToken = async (payload: Record<string, unknown>, env: Env) => {
  const key = await getSigningKey(env)
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`))
  return `${header}.${body}.${toBase64Url(new Uint8Array(signature))}`
}

const verifySignedToken = async (token: string, env: Env) => {
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) return null

  const key = await getSigningKey(env)
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(`${header}.${body}`))
  if (!valid) return null

  const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as Record<string, unknown>
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  if (exp && Date.now() > exp) return null

  return payload
}

const toUser = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name ?? null,
  lastName: row.last_name ?? null,
  avatarUrl: row.avatar_url ?? null,
  verified: Boolean(row.verified),
  createdAt: row.created_at,
})

const toOrganization = (row: OrganizationRow) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: row.created_at,
})

const toTeam = (row: TeamRow) => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
})

const fetchUserByEmail = async (db: D1Database, email: string) =>
  await db
    .prepare<UserRow>('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first()

const fetchUserById = async (db: D1Database, userId: string) =>
  await db
    .prepare<UserRow>('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first()

const createUser = async (db: D1Database, email: string, firstName?: string, lastName?: string) => {
  const id = generateId()
  await db
    .prepare(
      'INSERT INTO users (id, email, first_name, last_name, verified) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, email, firstName ?? null, lastName ?? null, 0)
    .run()
  return await fetchUserById(db, id)
}

const ensureUser = async (db: D1Database, email: string, firstName?: string, lastName?: string) => {
  const record = await fetchUserByEmail(db, email)
  if (record) return record
  return await createUser(db, email, firstName, lastName)
}

const fetchUserRoles = async (db: D1Database, userId: string) =>
  await db
    .prepare<RowResult<UserRoleRow>>('SELECT * FROM user_roles WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all()

const persistScopedRole = async (
  db: D1Database,
  userId: string,
  role: string,
  orgId: string | null,
  teamId: string | null
) => {
  await db
    .prepare('INSERT OR IGNORE INTO user_roles (id, user_id, role, org_id, team_id) VALUES (?, ?, ?, ?, ?)')
    .bind(generateId(), userId, role, orgId, teamId)
    .run()
}

const removeScopedRole = async (
  db: D1Database,
  userId: string,
  role: string,
  orgId: string | null,
  teamId: string | null
) => {
  await db
    .prepare(
      'DELETE FROM user_roles WHERE user_id = ? AND role = ? AND IFNULL(org_id, "") = IFNULL(?, "") AND IFNULL(team_id, "") = IFNULL(?, "")'
    )
    .bind(userId, role, orgId, teamId)
    .run()
}

const getUserDetails = async (db: D1Database, userId: string) => {
  const user = await fetchUserById(db, userId)
  if (!user) return null

  const orgMemberships = await db
    .prepare<RowResult<OrgDetailRow>>(
      `
      SELECT o.id as organization_id, o.name, o.slug, m.role, m.id as membership_id
      FROM organizations o
      JOIN org_memberships m ON o.id = m.organization_id
      WHERE m.user_id = ?
      `
    )
    .bind(userId)
    .all()

  const teamMemberships = await db
    .prepare<RowResult<TeamDetailRow>>(
      `
      SELECT t.id as team_id, t.name, t.description, t.organization_id, tm.role, tm.id as membership_id
      FROM teams t
      JOIN team_memberships tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
      `
    )
    .bind(userId)
    .all()

  const passkeys = await db
    .prepare<RowResult<PasskeyRow>>('SELECT * FROM passkeys WHERE user_id = ?')
    .bind(userId)
    .all()

  const roles = await fetchUserRoles(db, userId)

  return {
    user: toUser(user),
    organizations: (orgMemberships.results ?? []).map((row) => ({
      id: row.organization_id,
      name: row.name,
      slug: row.slug,
      role: row.role,
    })),
    teams: (teamMemberships.results ?? []).map((row) => ({
      id: row.team_id,
      name: row.name,
      description: row.description,
      organizationId: row.organization_id,
      role: row.role,
    })),
    passkeys: (passkeys.results ?? []).map((pk) => ({
      id: pk.id,
      name: pk.name,
      credentialId: pk.credential_id,
      createdAt: pk.created_at,
    })),
    roles: (roles.results ?? []).map((role) => ({
      id: role.id,
      role: role.role,
      orgId: role.org_id,
      teamId: role.team_id,
      createdAt: role.created_at,
    })),
  }
}

const fetchOrgMembers = async (db: D1Database, orgId: string) => {
  const rows = await db
    .prepare<RowResult<OrgMemberDetailRow>>(
      `
      SELECT m.*, u.email, u.first_name, u.last_name
      FROM org_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      ORDER BY m.created_at DESC
      `
    )
    .bind(orgId)
    .all()
  return rows.results ?? []
}

const fetchOrgMembershipForUser = async (db: D1Database, orgId: string, userId: string) =>
  await db
    .prepare<OrgMembershipRow>('SELECT * FROM org_memberships WHERE organization_id = ? AND user_id = ?')
    .bind(orgId, userId)
    .first()

const fetchTeamMembershipForUser = async (db: D1Database, teamId: string, userId: string) =>
  await db
    .prepare<TeamMembershipRow>('SELECT * FROM team_memberships WHERE team_id = ? AND user_id = ?')
    .bind(teamId, userId)
    .first()

const fetchTeamById = async (db: D1Database, teamId: string) =>
  await db
    .prepare<TeamRow>('SELECT * FROM teams WHERE id = ?')
    .bind(teamId)
    .first()

const ensureOrgMembershipRole = async (db: D1Database, orgId: string, userId: string, role: string) => {
  const existing = await fetchOrgMembershipForUser(db, orgId, userId)
  if (existing) {
    if (existing.role !== role) {
      await db.prepare('UPDATE org_memberships SET role = ? WHERE id = ?').bind(role, existing.id).run()
    }
    return existing.id
  }

  const id = generateId()
  await db
    .prepare('INSERT INTO org_memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)')
    .bind(id, orgId, userId, role)
    .run()
  return id
}

const ensureTeamMembershipRole = async (db: D1Database, teamId: string, userId: string, role: string) => {
  const existing = await fetchTeamMembershipForUser(db, teamId, userId)
  if (existing) {
    if (existing.role !== role) {
      await db.prepare('UPDATE team_memberships SET role = ? WHERE id = ?').bind(role, existing.id).run()
    }
    return existing.id
  }

  const id = generateId()
  await db
    .prepare('INSERT INTO team_memberships (id, team_id, user_id, role) VALUES (?, ?, ?, ?)')
    .bind(id, teamId, userId, role)
    .run()
  return id
}

const resolveTeamAdminScope = async (db: D1Database, teamId: string, auth: AuthContext) => {
  const team = await fetchTeamById(db, teamId)
  if (!team) return { team: null, orgAdmin: false, teamAdmin: false }

  const orgMembership = await fetchOrgMembershipForUser(db, team.organization_id, auth.userId)
  const orgAdmin = orgMembership?.role === 'org_admin'
  const teamMembership = await fetchTeamMembershipForUser(db, teamId, auth.userId)
  const teamAdmin = teamMembership?.role === 'team_admin'

  return { team, orgAdmin, teamAdmin }
}

const fetchTeamMembers = async (db: D1Database, teamId: string) => {
  const rows = await db
    .prepare<RowResult<TeamMemberDetailRow>>(
      `
      SELECT tm.*, u.email, u.first_name, u.last_name
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY tm.created_at DESC
      `
    )
    .bind(teamId)
    .all()
  return rows.results ?? []
}

// Routes --------------------------------------------------------

app.use(['/api/admin/*', '/api/organizations', '/api/organizations/*', '/api/teams/*', '/api/invitations'], async (c, next) => {
  const auth = parseAuth(c.req.raw)
  if (!auth) {
    return c.json({ message: 'Authentication required' }, 401)
  }

  c.set('auth', auth)
  await next()
})

app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

app.post(
  '/api/auth/magic-link',
  zValidator('json', magicLinkRequestSchema),
  async (c) => {
    const { email } = c.req.valid('json')
    const normalized = normalizeEmail(email)
    const db = getDb(c.env)
    const user = await ensureUser(db, normalized)
    if (!user) return c.json({ message: 'Failed to create user' }, 500)

    const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString()
    const payload = {
      email: normalized,
      purpose: 'magic-signin',
      exp: new Date(expiresAt).getTime(),
    }
    const token = await signToken(payload, c.env)
    await db
      .prepare(
        'INSERT INTO magic_links (id, user_id, email, token, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(generateId(), user.id, normalized, token, 'magic-signin', expiresAt)
      .run()

    return c.json({
      message: 'Magic link created. In production you would email this link.',
      token,
      expiresAt,
      user: toUser(user),
    })
  }
)

app.post(
  '/api/auth/magic-link/verify',
  zValidator('json', magicLinkVerifySchema),
  async (c) => {
    const { email, token } = c.req.valid('json')
    const normalized = normalizeEmail(email)
    const db = getDb(c.env)
    const payload = await verifySignedToken(token, c.env)
    if (!payload) {
      return c.json({ message: 'Invalid or expired token' }, 400)
    }

    if (payload.purpose !== 'magic-signin' && payload.purpose !== 'invitation') {
      return c.json({ message: 'Unsupported token purpose' }, 400)
    }

    if (typeof payload.email !== 'string' || normalizeEmail(payload.email) !== normalized) {
      return c.json({ message: 'Token email mismatch' }, 400)
    }

    const link = await db
      .prepare<MagicLinkRow>(
        'SELECT * FROM magic_links WHERE email = ? AND token = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(normalized, token)
      .first()

    if (!link) {
      return c.json({ message: 'No matching token found' }, 404)
    }

    if (new Date(link.expires_at).getTime() < Date.now()) {
      return c.json({ message: 'Token expired' }, 400)
    }

    const invitation = await db
      .prepare<InvitationRow>('SELECT * FROM invitations WHERE token = ?')
      .bind(token)
      .first()

    if (invitation && new Date(invitation.expires_at).getTime() < Date.now()) {
      return c.json({ message: 'Invitation expired' }, 400)
    }

    const existingUser = link.user_id
      ? await fetchUserById(db, link.user_id)
      : await fetchUserByEmail(db, normalized)

    const user = existingUser ?? (await ensureUser(db, normalized))
    if (!user) {
      return c.json({ message: 'Unable to locate user for token' }, 404)
    }

    await db
      .prepare('UPDATE users SET verified = 1 WHERE id = ?')
      .bind(user.id)
      .run()

    const scopedRole = (payload.role as string | undefined) ?? invitation?.role
    const orgScope = (payload.orgId as string | undefined) ?? invitation?.org_id ?? null
    const teamScope = (payload.teamId as string | undefined) ?? invitation?.team_id ?? null

    if (orgScope) {
      const org = await db
        .prepare<OrganizationRow>('SELECT * FROM organizations WHERE id = ?')
        .bind(orgScope)
        .first()
      if (!org) return c.json({ message: 'Invitation organization not found' }, 404)
    }

    if (teamScope) {
      const team = await fetchTeamById(db, teamScope)
      if (!team) return c.json({ message: 'Invitation team not found' }, 404)
    }

    if (scopedRole && (orgScope || teamScope)) {
      await persistScopedRole(db, user.id, scopedRole, orgScope, teamScope)
      if (orgScope) {
        await ensureOrgMembershipRole(db, orgScope, user.id, scopedRole)
      }
      if (teamScope) {
        await ensureTeamMembershipRole(db, teamScope, user.id, scopedRole)
      }
    }

    if (invitation) {
      await db.prepare('DELETE FROM invitations WHERE id = ?').bind(invitation.id).run()
    }

    const details = await getUserDetails(db, user.id)
    if (!details) {
      return c.json({ message: 'Unable to load user after verification' }, 500)
    }

    return c.json({ message: 'Welcome back', session: details })
  }
)

app.post(
  '/api/auth/passkeys/register',
  zValidator('json', passkeyRegisterSchema),
  async (c) => {
    const { userId, name } = c.req.valid('json')
    const db = getDb(c.env)
    const user = await fetchUserById(db, userId)
    if (!user) {
      return c.json({ message: 'User not found' }, 404)
    }

    const credentialId = randomToken() + crypto.randomUUID().split('-')[0]
    const publicKey = `public:${crypto.randomUUID()}`
    await db
      .prepare(
        'INSERT INTO passkeys (id, user_id, name, credential_id, public_key, counter) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(generateId(), userId, name, credentialId, publicKey, 0)
      .run()

    return c.json({
      message: 'Passkey ready for authentication',
      credentialId,
      publicKey,
    })
  }
)

app.post(
  '/api/auth/passkeys/authenticate',
  zValidator('json', passkeyAuthSchema),
  async (c) => {
    const { credentialId } = c.req.valid('json')
    const db = getDb(c.env)
    const record = await db
      .prepare<PasskeyRow>('SELECT * FROM passkeys WHERE credential_id = ?')
      .bind(credentialId)
      .first()
    if (!record) return c.json({ message: 'Passkey not registered' }, 404)

    const user = await fetchUserById(db, record.user_id)
    if (!user) return c.json({ message: 'User not found' }, 404)

    const details = await getUserDetails(db, user.id)
    if (!details) return c.json({ message: 'Unable to load user details' }, 500)

    return c.json({ message: 'Passkey authenticated', session: details })
  }
)

app.post(
  '/api/admin/users',
  zValidator('json', adminUserCreateSchema),
  async (c) => {
    const payload = c.req.valid('json')
    const normalized = normalizeEmail(payload.email)
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    if (!isMainAdmin(auth)) {
      return c.json({ message: 'Only main_admin users may create users' }, 403)
    }
    const existing = await fetchUserByEmail(db, normalized)
    if (existing) {
      return c.json({ message: 'User already exists', user: toUser(existing) }, 200)
    }

    const user = await createUser(db, normalized, payload.firstName, payload.lastName)
    if (!user) return c.json({ message: 'Unable to create user' }, 500)

    return c.json({ message: 'User added', user: toUser(user) })
  }
)

app.get('/api/admin/users', async (c) => {
  const db = getDb(c.env)
  const auth = c.get('auth') as AuthContext
  if (!isMainAdmin(auth)) {
    return c.json({ message: 'Only main_admin users may list all users' }, 403)
  }
  const rows = await db.prepare<RowResult<UserRow>>('SELECT * FROM users ORDER BY created_at DESC').all()
  return c.json({ users: (rows.results ?? []).map(toUser) })
})

app.patch(
  '/api/users/:userId',
  zValidator('params', z.object({ userId: z.string() })),
  zValidator('json', userUpdateSchema),
  async (c) => {
    const {
      params: { userId },
    } = c.req.valid('params')
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    await db
      .prepare(
        'UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?'
      )
      .bind(payload.firstName ?? null, payload.lastName ?? null, payload.avatarUrl ?? null, userId)
      .run()
    const updated = await fetchUserById(db, userId)
    if (!updated) return c.json({ message: 'User not found' }, 404)
    return c.json({ user: toUser(updated) })
  }
)

app.get('/api/organizations', async (c) => {
  const db = getDb(c.env)
  const rows = await db.prepare<RowResult<OrganizationRow>>('SELECT * FROM organizations ORDER BY created_at DESC').all()
  return c.json({ organizations: (rows.results ?? []).map(toOrganization) })
})

app.post(
  '/api/organizations',
  zValidator('json', organizationPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    if (!isMainAdmin(auth)) {
      return c.json({ message: 'Only main_admin users may create organizations' }, 403)
    }
    await db
      .prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)')
      .bind(generateId(), payload.name, payload.slug)
      .run()
    const rows = await db
      .prepare<RowResult<OrganizationRow>>('SELECT * FROM organizations ORDER BY created_at DESC')
      .all()
    return c.json({ organizations: (rows.results ?? []).map(toOrganization) })
  }
)

app.delete(
  '/api/organizations/:orgId',
  zValidator('params', z.object({ orgId: z.string() })),
  async (c) => {
    const {
      params: { orgId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    if (!isMainAdmin(auth)) {
      return c.json({ message: 'Only main_admin users may delete organizations' }, 403)
    }
    await db.prepare('DELETE FROM organizations WHERE id = ?').bind(orgId).run()
    return c.json({ message: 'Organization removed' })
  }
)

app.get(
  '/api/organizations/:orgId/members',
  zValidator('params', z.object({ orgId: z.string() })),
  async (c) => {
    const {
      params: { orgId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }
    const members = await fetchOrgMembers(db, orgId)
    return c.json({ members })
  }
)

app.post('/api/invitations', zValidator('json', invitationPayloadSchema), async (c) => {
  const payload = c.req.valid('json')
  const db = getDb(c.env)
  const auth = c.get('auth') as AuthContext
  const normalized = normalizeEmail(payload.email)
  const expiresAt = new Date(Date.now() + 1000 * 60 * (payload.expiresInMinutes ?? 60 * 24)).toISOString()

  let orgId: string | null = payload.orgId ?? null
  let teamId: string | null = payload.teamId ?? null

  if (teamId) {
    const { team, orgAdmin, teamAdmin } = await resolveTeamAdminScope(db, teamId, auth)
    if (!team) return c.json({ message: 'Team not found' }, 404)
    if (!isMainAdmin(auth) && !orgAdmin && !teamAdmin) {
      return c.json({ message: 'Admin access required for this team' }, 403)
    }
    orgId = team.organization_id
  } else if (orgId) {
    const organization = await db
      .prepare<OrganizationRow>('SELECT * FROM organizations WHERE id = ?')
      .bind(orgId)
      .first()
    if (!organization) return c.json({ message: 'Organization not found' }, 404)
    const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }
  }

  const tokenPayload = {
    email: normalized,
    role: payload.role,
    orgId,
    teamId,
    purpose: 'invitation',
    exp: new Date(expiresAt).getTime(),
  }

  const token = await signToken(tokenPayload, c.env)

  await db
    .prepare(
      'INSERT INTO invitations (id, token, email, role, org_id, team_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(generateId(), token, normalized, payload.role, orgId, teamId, expiresAt, auth.userId)
    .run()

  await db
    .prepare('INSERT INTO magic_links (id, user_id, email, token, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(generateId(), null, normalized, token, 'invitation', expiresAt)
    .run()

  return c.json({ token, expiresAt })
})

app.post(
  '/api/organizations/:orgId/members',
  zValidator('params', z.object({ orgId: z.string() })),
  zValidator('json', orgMemberPayloadSchema),
  async (c) => {
    const {
      params: { orgId },
    } = c.req.valid('params')
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }
    await db
      .prepare('INSERT INTO org_memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)')
      .bind(generateId(), orgId, payload.userId, payload.role)
      .run()
    await persistScopedRole(db, payload.userId, payload.role, orgId, null)
    const members = await fetchOrgMembers(db, orgId)
    return c.json({ members })
  }
)

app.delete(
  '/api/organizations/:orgId/members/:memberId',
  zValidator('params', z.object({ orgId: z.string(), memberId: z.string() })),
  async (c) => {
    const {
      params: { orgId, memberId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const record = await db
      .prepare<OrgMembershipRow>('SELECT * FROM org_memberships WHERE id = ?')
      .bind(memberId)
      .first()

    if (!record) {
      return c.json({ message: 'Membership not found' }, 404)
    }

    if (record.organization_id !== orgId) {
      return c.json({ message: 'Membership does not belong to this organization' }, 400)
    }

    const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }

    if (record.role === 'org_admin' && !isMainAdmin(auth)) {
      return c.json({ message: 'Cannot remove another org admin' }, 403)
    }

    await db.prepare('DELETE FROM org_memberships WHERE id = ?').bind(memberId).run()
    await removeScopedRole(db, record.user_id, record.role, record.organization_id, null)
    return c.json({ message: 'Membership removed' })
  }
)


app.get('/api/organizations/:orgId/teams', async (c) => {
  const orgId = c.req.param('orgId')
  if (!orgId) {
    return c.json({ message: 'Missing organization id' }, 400)
  }
  const db = getDb(c.env)
  const auth = c.get('auth') as AuthContext
  const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
  if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
    return c.json({ message: 'Org admin role required for this organization' }, 403)
  }
  const rows = await db
    .prepare<RowResult<TeamRow>>('SELECT * FROM teams WHERE organization_id = ? ORDER BY created_at DESC')
    .bind(orgId)
    .all()
  return c.json({ teams: (rows.results ?? []).map(toTeam) })
})

app.post(
  '/api/organizations/:orgId/teams',
  zValidator('json', teamPayloadSchema),
  async (c) => {
    const orgId = c.req.param('orgId')
    if (!orgId) {
      return c.json({ message: 'Missing organization id' }, 400)
    }
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const membership = await fetchOrgMembershipForUser(db, orgId, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }
    await db
      .prepare('INSERT INTO teams (id, organization_id, name, description) VALUES (?, ?, ?, ?)')
      .bind(generateId(), orgId, payload.name, payload.description ?? null)
      .run()
    const rows = await db
      .prepare<RowResult<TeamRow>>('SELECT * FROM teams WHERE organization_id = ? ORDER BY created_at DESC')
      .bind(orgId)
      .all()
    return c.json({ teams: (rows.results ?? []).map(toTeam) })
  }
)

app.delete(
  '/api/teams/:teamId',
  zValidator('params', z.object({ teamId: z.string() })),
  async (c) => {
    const {
      params: { teamId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const team = await fetchTeamById(db, teamId)

    if (!team) {
      return c.json({ message: 'Team not found' }, 404)
    }

    const membership = await fetchOrgMembershipForUser(db, team.organization_id, auth.userId)
    if (!isMainAdmin(auth) && (!membership || membership.role !== 'org_admin')) {
      return c.json({ message: 'Org admin role required for this organization' }, 403)
    }

    await db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run()
    return c.json({ message: 'Team deleted' })
  }
)

app.get('/api/teams/:teamId/members', async (c) => {
  const teamId = c.req.param('teamId')
  if (!teamId) {
    return c.json({ message: 'Missing team id' }, 400)
  }
  const db = getDb(c.env)
  const auth = c.get('auth') as AuthContext
  const { team, orgAdmin, teamAdmin } = await resolveTeamAdminScope(db, teamId, auth)
  if (!team) {
    return c.json({ message: 'Team not found' }, 404)
  }
  if (!isMainAdmin(auth) && !orgAdmin && !teamAdmin) {
    return c.json({ message: 'Admin access required for this team' }, 403)
  }
  const members = await fetchTeamMembers(db, teamId)
  return c.json({ members })
})

app.post(
  '/api/teams/:teamId/members',
  zValidator('json', teamMemberPayloadSchema),
  async (c) => {
    const teamId = c.req.param('teamId')
    if (!teamId) {
      return c.json({ message: 'Missing team id' }, 400)
    }
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const { team, orgAdmin, teamAdmin } = await resolveTeamAdminScope(db, teamId, auth)
    if (!team) {
      return c.json({ message: 'Team not found' }, 404)
    }
    if (!isMainAdmin(auth) && !orgAdmin && !teamAdmin) {
      return c.json({ message: 'Admin access required for this team' }, 403)
    }
    await db
      .prepare('INSERT INTO team_memberships (id, team_id, user_id, role) VALUES (?, ?, ?, ?)')
      .bind(generateId(), teamId, payload.userId, payload.role)
      .run()
    await persistScopedRole(db, payload.userId, payload.role, team.organization_id, teamId)
    const members = await fetchTeamMembers(db, teamId)
    return c.json({ members })
  }
)

app.patch(
  '/api/teams/:teamId/members/:memberId',
  zValidator('json', z.object({ role: roleEnum })),
  async (c) => {
    const memberId = c.req.param('memberId')
    const teamId = c.req.param('teamId')
    if (!memberId || !teamId) {
      return c.json({ message: 'Missing member id' }, 400)
    }
    const payload = c.req.valid('json')
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const { team, orgAdmin, teamAdmin } = await resolveTeamAdminScope(db, teamId, auth)
    if (!team) {
      return c.json({ message: 'Team not found' }, 404)
    }
    const record = await db
      .prepare<TeamMembershipRow>('SELECT * FROM team_memberships WHERE id = ?')
      .bind(memberId)
      .first()
    if (!record) return c.json({ message: 'Member not found' }, 404)

    if (record.team_id !== teamId) {
      return c.json({ message: 'Membership does not belong to this team' }, 400)
    }

    if (!isMainAdmin(auth) && !orgAdmin && !teamAdmin) {
      return c.json({ message: 'Admin access required for this team' }, 403)
    }

    if (record.role === 'team_admin' && !isMainAdmin(auth) && !orgAdmin) {
      return c.json({ message: 'Cannot change role for another team admin' }, 403)
    }

    await db
      .prepare('UPDATE team_memberships SET role = ? WHERE id = ?')
      .bind(payload.role, memberId)
      .run()

    await removeScopedRole(db, record.user_id, record.role, team.organization_id, teamId)
    await persistScopedRole(db, record.user_id, payload.role, team.organization_id, teamId)

    const updated = await db
      .prepare<TeamMembershipRow>('SELECT * FROM team_memberships WHERE id = ?')
      .bind(memberId)
      .first()

    if (!updated) return c.json({ message: 'Member not found' }, 404)
    return c.json({ member: updated })
  }
)

app.delete(
  '/api/teams/:teamId/members/:memberId',
  async (c) => {
    const memberId = c.req.param('memberId')
    const teamId = c.req.param('teamId')
    if (!memberId || !teamId) {
      return c.json({ message: 'Missing member id' }, 400)
    }
    const db = getDb(c.env)
    const auth = c.get('auth') as AuthContext
    const { team, orgAdmin, teamAdmin } = await resolveTeamAdminScope(db, teamId, auth)
    if (!team) {
      return c.json({ message: 'Team not found' }, 404)
    }

    const record = await db
      .prepare<TeamMembershipRow>('SELECT * FROM team_memberships WHERE id = ?')
      .bind(memberId)
      .first()

    if (!record) {
      return c.json({ message: 'Member not found' }, 404)
    }

    if (record.team_id !== teamId) {
      return c.json({ message: 'Membership does not belong to this team' }, 400)
    }

    if (!isMainAdmin(auth) && !orgAdmin && !teamAdmin) {
      return c.json({ message: 'Admin access required for this team' }, 403)
    }

    if (record.role === 'team_admin' && !isMainAdmin(auth) && !orgAdmin) {
      return c.json({ message: 'Cannot remove another team admin' }, 403)
    }

    await db.prepare('DELETE FROM team_memberships WHERE id = ?').bind(memberId).run()
    await removeScopedRole(db, record.user_id, record.role, team.organization_id, teamId)
    return c.json({ message: 'Member removed' })
  }
)

app.get(
  '/api/users/:userId',
  zValidator('params', z.object({ userId: z.string() })),
  async (c) => {
    const {
      params: { userId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const details = await getUserDetails(db, userId)
    if (!details) return c.json({ message: 'User not found' }, 404)
    return c.json(details)
  }
)

app.get(
  '/api/auth/passkeys/:userId',
  zValidator('params', z.object({ userId: z.string() })),
  async (c) => {
    const {
      params: { userId },
    } = c.req.valid('params')
    const db = getDb(c.env)
    const rows = await db
      .prepare<RowResult<PasskeyRow>>('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all()
    return c.json({ passkeys: rows.results ?? [] })
  }
)

// Exported fetch ------------------------------------------------

const serveStatic = async (request: Request, env: Env) => {
  const asset = await env.ASSETS.fetch(request.clone())
  if (asset.status < 400) return asset

  const fallbackUrl = new URL(request.url)
  fallbackUrl.pathname = '/index.html'
  return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request))
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    }

    if (url.pathname.startsWith(API_PREFIX)) {
      return app.fetch(request, env, ctx)
    }

    return serveStatic(request, env)
  },
}
