import { Context } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

export async function getUserWithRoles(db: D1Database, userId: string) {
  const user = await db.prepare('SELECT id, email, name, verified FROM users WHERE id = ?').bind(userId).first();
  if (!user) return null;
  const { results: roles } = await db.prepare('SELECT role, org_id, team_id FROM user_roles WHERE user_id = ?').bind(userId).all();
  return { ...user, roles };
}

export function isMainAdmin(roles: any[]) {
  return roles.some(r => r.role === 'main_admin');
}

export function isOrgAdminForOrg(roles: any[], orgId: string) {
  return isMainAdmin(roles) || roles.some(r => r.role === 'org_admin' && r.org_id === orgId);
}

export function isTeamAdminForTeam(roles: any[], teamId: string) {
  return isMainAdmin(roles) || roles.some(r => r.role === 'team_admin' && r.team_id === teamId);
}

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) {
  const path = c.req.path.replace(/^\/api/, '');
  if (path === '/login' || path === '/verify') {
    return await next();
  }

  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = auth.slice(7);
  try {
    if (!await jwt.verify(token, c.env.JWT_SECRET)) {
      throw new Error();
    }
    const payload = jwt.decode(token).payload as { id: string };
    const user = await getUserWithRoles(c.env.DB, payload.id);
    if (!user) {
      throw new Error();
    }
    c.set('user', user);
    c.set('userRoles', user.roles);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}
