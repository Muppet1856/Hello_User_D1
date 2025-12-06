import { Hono } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Resend } from 'resend';
import { getUserWithRoles } from './helpers'; // Adjust path if needed

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const auth = new Hono<{ Bindings: Bindings }>();

auth.post('/login', async (c) => {
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    const userId = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, email, verified, invited_by) VALUES (?, ?, FALSE, ?)').bind(userId, email, userId).run();
    user = { id: userId, email } as typeof user;
  }

  const token = await jwt.sign(
    { email, type: 'login', role: 'login', exp: Math.floor(Date.now() / 1000) + 3600 },
    c.env.JWT_SECRET
  );

  const expiresAt = new Date((Math.floor(Date.now() / 1000) + 3600) * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO invitations (id, token, email, role, org_id, team_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), token, email, 'login', null, null, expiresAt, user!.id).run();

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

auth.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Missing token' }, 400);
  }

  const invitation = await c.env.DB.prepare('SELECT * FROM invitations WHERE token = ?').bind(token).first();
  if (!invitation) {
    return c.json({ error: 'Invalid/expired token' }, 401);
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await c.env.DB.prepare('DELETE FROM invitations WHERE token = ?').bind(token).run();
    return c.json({ error: 'Invalid/expired token' }, 401);
  }

  let payload;
  try {
    if (!await jwt.verify(token, c.env.JWT_SECRET)) {
      throw new Error();
    }
    payload = jwt.decode(token).payload;
  } catch (err) {
    await c.env.DB.prepare('DELETE FROM invitations WHERE token = ?').bind(token).run();
    return c.json({ error: 'Invalid/expired token' }, 401);
  }

  if (payload.email !== invitation.email || (payload.role && payload.role !== invitation.role)) {
    await c.env.DB.prepare('DELETE FROM invitations WHERE token = ?').bind(token).run();
    return c.json({ error: 'Invalid/expired token' }, 401);
  }

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(payload.email).first();

  let invitedBy = invitation.created_by;  // From invitation token
  if (!user) {
    const userId = crypto.randomUUID();
    invitedBy = invitedBy || userId;  // Self-invited if no inviter
    await c.env.DB.prepare('INSERT INTO users (id, email, verified, invited_by) VALUES (?, ?, TRUE, ?)').bind(userId, payload.email, invitedBy).run();
    user = { id: userId, email: payload.email };
  } else if (!user.verified) {
    await c.env.DB.prepare('UPDATE users SET verified = TRUE WHERE id = ?').bind(user.id).run();
  }

  // If invitation, assign role
  if (invitation.role && invitation.role !== 'login') {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO user_roles (user_id, role, org_id, team_id) VALUES (?, ?, ?, ?)'
    ).bind(user.id, invitation.role, invitation.org_id || null, invitation.team_id || null).run();
  }

  const sessionToken = await jwt.sign(
    { id: user.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    c.env.JWT_SECRET
  );

  await c.env.DB.prepare('DELETE FROM invitations WHERE token = ?').bind(token).run();
  return c.json({ token: sessionToken });
});

auth.get('/me', async (c) => {
  const user = c.get('user');
  return c.json(user);
});

export default auth;
