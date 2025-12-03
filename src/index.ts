import { Hono } from 'hono';
import { z } from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Resend } from 'resend';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;  // For static assets
};

const app = new Hono<{ Bindings: Bindings }>();

// ... (All schemas, middleware, helpers, routes from previous implementation remain the same)
// E.g., /api/login, /api/verify, /api/orgs, /api/invite, etc.

// Add GET /api/me to fetch user details (for dashboard)
app.get('/api/me', async (c) => {
  const user = c.get('user');
  return c.json(await getUserWithRoles(c.env.DB, user.id));
});

// Fallback: Serve static assets for non-API paths
app.get('*', async (c) => {
  return await c.env.ASSETS.fetch(c.req);
});

export default app;