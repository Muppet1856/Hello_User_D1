import { Hono } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Resend } from 'resend';
import { isOrgAdminForOrg, isTeamAdminForTeam, isMainAdmin } from './helpers';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const teams = new Hono<{ Bindings: Bindings }>();

teams.get('/my-teams', async (c) => {
  const userRoles = c.get('userRoles');
  if (isMainAdmin(userRoles)) {
    const { results } = await c.env.DB.prepare('SELECT t.id, t.name, t.org_id, o.name AS org_name FROM teams t JOIN organizations o ON t.org_id = o.id').all();
    return c.json(results);
  }
  const teamIds = userRoles.filter(r => r.role === 'team_admin').map(r => r.team_id);
  if (!teamIds.length) return c.json([]);

  const placeholders = teamIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT t.id, t.name, t.org_id, o.name AS org_name FROM teams t JOIN organizations o ON t.org_id = o.id WHERE t.id IN (${placeholders})`).bind(...teamIds).all();
  return c.json(results);
});

teams.get('/organizations/:orgId/teams', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isOrgAdminForOrg(userRoles, orgId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await c.env.DB.prepare('SELECT id, name FROM teams WHERE org_id = ?').bind(orgId).all();
  return c.json(results);
});

teams.post('/organizations/:orgId/teams', async (c) => {
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

teams.post('/teams/:teamId/invite-admin', async (c) => {
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

  const createdBy = c.get('user').id;  // Inviter ID
  const token = await jwt.sign(
    { email, type: 'invite', role: 'team_admin', org_id: team.org_id, team_id: teamId, created_by: createdBy, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const expiresAt = new Date((Math.floor(Date.now() / 1000) + 3600 * 24) * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO invitations (id, token, email, role, org_id, team_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), token, email, 'team_admin', team.org_id, teamId, expiresAt, createdBy).run();

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

teams.post('/teams/:teamId/invite', async (c) => {
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

  const createdBy = c.get('user').id;  // Inviter ID
  const token = await jwt.sign(
    { email, type: 'invite', role, org_id: team.org_id, team_id: teamId, created_by: createdBy, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const expiresAt = new Date((Math.floor(Date.now() / 1000) + 3600 * 24) * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO invitations (id, token, email, role, org_id, team_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), token, email, role, team.org_id, teamId, expiresAt, createdBy).run();

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

// Rename team (PUT)
teams.put('/teams/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const userRoles = c.get('userRoles');

  const team = await c.env.DB.prepare('SELECT org_id FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) {
    return c.json({ error: 'Team not found' }, 404);
  }

  if (!isOrgAdminForOrg(userRoles, team.org_id)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  const result = await c.env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name, teamId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'Team not found' }, 404);
  }

  return c.json({ success: true });
});

// Delete team (DELETE)
teams.delete('/teams/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const userRoles = c.get('userRoles');

  const team = await c.env.DB.prepare('SELECT org_id FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) {
    return c.json({ error: 'Team not found' }, 404);
  }

  if (!isOrgAdminForOrg(userRoles, team.org_id)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const result = await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'Team not found' }, 404);
  }

  return c.json({ success: true });
});

export default teams;