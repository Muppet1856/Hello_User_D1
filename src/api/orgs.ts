import { Hono } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Resend } from 'resend';
import { isMainAdmin, isOrgAdminForOrg } from './helpers';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const orgs = new Hono<{ Bindings: Bindings }>();

orgs.get('/my-orgs', async (c) => {
  const userRoles = c.get('userRoles');
  if (isMainAdmin(userRoles)) {
    const { results } = await c.env.DB.prepare('SELECT id, name FROM organizations').all();
    return c.json(results);
  }
  const orgIds = userRoles.filter(r => r.role === 'org_admin').map(r => r.org_id);
  if (!orgIds.length) return c.json([]);

  const placeholders = orgIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT id, name FROM organizations WHERE id IN (${placeholders})`).bind(...orgIds).all();
  return c.json(results);
});

orgs.get('/organizations', async (c) => {
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await c.env.DB.prepare('SELECT id, name FROM organizations').all();
  return c.json(results);
});

orgs.post('/organizations', async (c) => {
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const user = c.get('user');
  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  const orgId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)').bind(orgId, name, user.id).run();

  return c.json({ id: orgId, name }, 201);
});

orgs.post('/organizations/:orgId/invite-admin', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const org = await c.env.DB.prepare('SELECT name FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  const createdBy = c.get('user').id;  // Inviter ID
  const token = await jwt.sign(
    { email, type: 'invite', role: 'org_admin', org_id: orgId, created_by: createdBy, exp: Math.floor(Date.now() / 1000) + 3600 * 24 }, // 24-hour expiry
    c.env.JWT_SECRET
  );

  const expiresAt = new Date((Math.floor(Date.now() / 1000) + 3600 * 24) * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO invitations (id, token, email, role, org_id, team_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), token, email, 'org_admin', orgId, null, expiresAt, createdBy).run();

  const inviteUrl = `https://grok-hello-user.zellen.workers.dev/?token=${token}`;

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'registration@volleyballscore.app',
    to: email,
    subject: `Invitation to Admin Organization: ${org.name}`,
    html: `

You've been invited to admin the organization ${org.name}. Click [here](${inviteUrl}) to accept (expires in 24 hours).

`,
  });

  return c.json({ success: true });
});

// Rename org (PUT)
orgs.put('/organizations/:orgId', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles) && !isOrgAdminForOrg(userRoles, orgId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  const result = await c.env.DB.prepare('UPDATE organizations SET name = ? WHERE id = ?').bind(name, orgId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  return c.json({ success: true });
});

// Delete org (DELETE)
orgs.delete('/organizations/:orgId', async (c) => {
  const orgId = c.req.param('orgId');
  const userRoles = c.get('userRoles');
  if (!isMainAdmin(userRoles) && !isOrgAdminForOrg(userRoles, orgId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const result = await c.env.DB.prepare('DELETE FROM organizations WHERE id = ?').bind(orgId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  return c.json({ success: true });
});

export default orgs;