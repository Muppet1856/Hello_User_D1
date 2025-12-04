import { Hono } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Resend } from 'resend';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const api = new Hono<{ Bindings: Bindings }>();

// --- Helpers ---
async function getUserWithRoles(db: D1Database, userId: string) {
  const user = await db.prepare('SELECT id, email, name, verified FROM users WHERE id = ?').bind(userId).first();
  if (!user) return null;
  const { results: roles } = await db.prepare('SELECT role, org_id, team_id FROM user_roles WHERE user_id = ?').bind(userId).all();
  return { ...user, roles };
}

// Permission checks (expand as needed)
function isMainAdmin(roles: any[]) {
  return roles.some(r => r.role === 'main_admin');
}

function isOrgAdminForOrg(roles: any[], orgId: string) {
  return isMainAdmin(roles) || roles.some(r => r.role === 'org_admin' && r.org_id === orgId);
}

function isTeamAdminForTeam(roles: any[], teamId: string) {
  return isMainAdmin(roles) || roles.some(r => r.role === 'team_admin' && r.team_id === teamId);
}

// --- Routes ---

// POST /api/login
api.post('/login', async (c) => {
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  const token = await jwt.sign(
    { email, type: 'login', exp: Math.floor(Date.now() / 1000) + 3600 },
    c.env.JWT_SECRET
  );

  const loginUrl = `https://grok-hello-user.zellen.workers.dev/?token=${token}`;

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'registration@volleyballscore.app',
    to: email,
    subject: 'Hello User Login Link',
    html: `<p>Click <a href="${loginUrl}">here</a> to log in (expires in 1 hour).</p>`,
  });

  return c.json({ success: true });
});

// GET /api/verify
api.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Missing token' }, 400);

  let payload;
  try {
    if (!await jwt.verify(token, c.env.JWT_SECRET)) throw new Error();
    payload = jwt.decode(token).payload;
  } catch {
    return c.json({ error: 'Invalid/expired token' }, 401);
  }

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(payload.email).first();

  if (!user) {
    const userId = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, email, verified) VALUES (?, ?, TRUE)').bind(userId, payload.email).run();
    user = { id: userId, email: payload.email };
  } else if (!user.verified) {
    await c.env.DB.prepare('UPDATE users SET verified = TRUE WHERE id = ?').bind(user.id).run();
  }

  // If invitation, assign role
  if (payload.role) {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO user_roles (user_id, role, org_id, team_id) VALUES (?, ?, ?, ?)'
    ).bind(user.id, payload.role, payload.org_id || null, payload.team_id || null).run();
  }

  const sessionToken = await jwt.sign({ id: user.id }, c.env.JWT_SECRET, { expiresIn: '30d' });
  return c.json({ token: sessionToken });
});

// Auth Middleware - attaches user or 401
api.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  const token = auth.slice(7);
  try {
    if (!await jwt.verify(token, c.env.JWT_SECRET)) throw new Error();
    const payload = jwt.decode(token).payload as { id: string };
    const user = await getUserWithRoles(c.env.DB, payload.id);
    if (!user) throw new Error();
    c.set('user', user);
    c.set('userRoles', user.roles);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// GET /api/me
api.get('/me', async (c) => {
  const user = c.get('user');
  return c.json(user);
});

// GET /api/organizations - List all organizations (main_admin only)
api.get('/organizations', async (c) => {
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await c.env.DB.prepare('SELECT id, name FROM organizations').all();
  return c.json(results);
});

// POST /api/organizations - Create a new organization (main_admin only)
api.post('/organizations', async (c) => {
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const user = c.get('user');  // Get the current user
  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  const orgId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)').bind(orgId, name, user.id).run();

  return c.json({ id: orgId, name }, 201);
});

// POST /api/organizations/:orgId/invite-admin - Invite user as org_admin (main_admin only)
api.post('/organizations/:orgId/invite-admin', async (c) => {
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const orgId = c.req.param('orgId');
  // Verify org exists
  const org = await c.env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  const token = await jwt.sign(
    { email, type: 'invite', role: 'org_admin', org_id: orgId, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const inviteUrl = `https://grok-hello-user.zellen.workers.dev/?token=${token}`;

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'registration@volleyballscore.app',
    to: email,
    subject: 'Invitation to Admin Organization',
    html: `<p>You've been invited to admin the organization. Click <a href="${inviteUrl}">here</a> to accept (expires in 24 hours).</p>`,
  });

  return c.json({ success: true });
});

// GET /api/my-orgs - List organizations where user is org_admin (or all if main_admin)
api.get('/my-orgs', async (c) => {
  const userRoles = c.get('userRoles');
  console.log('my-orgs: userRoles', userRoles);  // Debug log
  if (isMainAdmin(userRoles)) {
    const { results } = await c.env.DB.prepare('SELECT id, name FROM organizations').all();
    console.log('my-orgs: all orgs for main admin', results);  // Debug log
    return c.json(results);
  }
  const orgIds = userRoles.filter(r => r.role === 'org_admin').map(r => r.org_id);
  if (!orgIds.length) return c.json([]);

  const placeholders = orgIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT id, name FROM organizations WHERE id IN (${placeholders})`).bind(...orgIds).all();
  console.log('my-orgs: orgs for org admin', results);  // Debug log
  return c.json(results);
});

// GET /api/my-teams - List teams where user is team_admin (or all if main_admin)
api.get('/my-teams', async (c) => {
  const userRoles = c.get('userRoles');
  console.log('my-teams: userRoles', userRoles);  // Debug log
  if (isMainAdmin(userRoles)) {
    const { results } = await c.env.DB.prepare('SELECT t.id, t.name, t.org_id, o.name AS org_name FROM teams t JOIN organizations o ON t.org_id = o.id').all();
    console.log('my-teams: all teams for main admin', results);  // Debug log
    return c.json(results);
  }
  const teamIds = userRoles.filter(r => r.role === 'team_admin').map(r => r.team_id);
  if (!teamIds.length) return c.json([]);

  const placeholders = teamIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT t.id, t.name, t.org_id, o.name AS org_name FROM teams t JOIN organizations o ON t.org_id = o.id WHERE t.id IN (${placeholders})`).bind(...teamIds).all();
  console.log('my-teams: teams for team admin', results);  // Debug log
  return c.json(results);
});

// GET /api/organizations/:orgId/teams - List teams in an organization (org_admin only)
api.get('/organizations/:orgId/teams', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isOrgAdminForOrg(userRoles, orgId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await c.env.DB.prepare('SELECT id, name FROM teams WHERE org_id = ?').bind(orgId).all();
  return c.json(results);
});

// POST /api/organizations/:orgId/teams - Create a new team in organization (org_admin only)
api.post('/organizations/:orgId/teams', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isOrgAdminForOrg(userRoles, orgId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const user = c.get('user');
  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  const teamId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO teams (id, name, org_id, created_by) VALUES (?, ?, ?, ?)').bind(teamId, name, orgId, user.id).run();

  return c.json({ id: teamId, name }, 201);
});

// POST /api/teams/:teamId/invite-admin - Invite user as team_admin (org_admin for the team's org only)
api.post('/teams/:teamId/invite-admin', async (c) => {
  const teamId = c.req.param('teamId');
  const userRoles = c.get('userRoles');

  const team = await c.env.DB.prepare('SELECT org_id, name FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) {
    return c.json({ error: 'Team not found' }, 404);
  }

  if (!isOrgAdminForOrg(userRoles, team.org_id)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  const token = await jwt.sign(
    { email, type: 'invite', role: 'team_admin', org_id: team.org_id, team_id: teamId, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const inviteUrl = `https://grok-hello-user.zellen.workers.dev/?token=${token}`;

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'registration@volleyballscore.app',
    to: email,
    subject: `Invitation to Admin Team: ${team.name}`,
    html: `<p>You've been invited to admin the team ${team.name}. Click <a href="${inviteUrl}">here</a> to accept (expires in 24 hours).</p>`,
  });

  return c.json({ success: true });
});

// GET /api/my-teams - List teams where user is team_admin
api.get('/my-teams', async (c) => {
  const userRoles = c.get('userRoles');
  const teamIds = userRoles.filter(r => r.role === 'team_admin').map(r => r.team_id);
  if (!teamIds.length) return c.json([]);

  const placeholders = teamIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT t.id, t.name, t.org_id, o.name AS org_name FROM teams t JOIN organizations o ON t.org_id = o.id WHERE t.id IN (${placeholders})`).bind(...teamIds).all();
  return c.json(results);
});

// POST /api/teams/:teamId/invite - Invite user to a specific role in team (team_admin only; roles: statistician, member, guest)
api.post('/teams/:teamId/invite', async (c) => {
  const teamId = c.req.param('teamId');
  const userRoles = c.get('userRoles');

  const team = await c.env.DB.prepare('SELECT org_id, name FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) {
    return c.json({ error: 'Team not found' }, 404);
  }

  if (!isTeamAdminForTeam(userRoles, teamId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['statistician', 'member', 'guest'])
  });
  const { email, role } = schema.parse(body);

  const token = await jwt.sign(
    { email, type: 'invite', role, org_id: team.org_id, team_id: teamId, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const inviteUrl = `https://grok-hello-user.zellen.workers.dev/?token=${token}`;

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'registration@volleyballscore.app',
    to: email,
    subject: `Invitation to Join Team: ${team.name} as ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    html: `<p>You've been invited to join the team ${team.name} as a ${role}. Click <a href="${inviteUrl}">here</a> to accept (expires in 24 hours).</p>`,
  });

  return c.json({ success: true });
});

// Mount API
app.route('/api', api);

// Static assets fallback
app.get('*', async (c) => c.env.ASSETS.fetch(c.req));

export default app;