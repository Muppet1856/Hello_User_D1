import { Hono } from 'hono';
import auth from './api/auth';
import orgs from './api/orgs';
import teams from './api/teams';
import { authMiddleware } from './api/helpers'; // If you moved it there

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const api = new Hono<{ Bindings: Bindings }>();

// Auth routes (no middleware needed for login/verify)
api.route('/', auth);

// Apply auth middleware to protected routes
api.use('*', authMiddleware); // Or apply selectively if needed

// Mount other routers
api.route('/', orgs);
api.route('/', teams);

// Mount API to app
app.route('/api', api);

// Static assets fallback
app.get('*', async (c) => c.env.ASSETS.fetch(c.req));

export default app;