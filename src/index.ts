import { Hono } from 'hono';
import auth from './api/auth';
import orgs from './api/orgs';
import teams from './api/teams';
import { authMiddleware } from './api/helpers';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const api = new Hono<{ Bindings: Bindings }>();

// Verbose request/response logging (helps confirm when the worker is actually handling the request)
app.use('*', async (c, next) => {
  const start = Date.now();
  console.log(`[REQ] ${c.req.method} ${c.req.url}`);
  const res = await next();
  const duration = Date.now() - start;
  console.log(`[RES] ${c.req.method} ${c.req.url} -> ${res.status} (${duration}ms)`);
  return res;
});

// Apply auth middleware to protect everything (except login/verify) before mounting routers
api.use('*', authMiddleware);

// Auth routes
api.route('/', auth);

// Mount other routers
api.route('/', orgs);
api.route('/', teams);

// Mount API to app
app.route('/api', api);

// Static assets fallback
app.get('*', async (c) => {
  const path = c.req.path;
  const isRoot = path === '/';
  const isJsAsset = path === '/js' || path.startsWith('/js/');
  const isCssAsset = path === '/css' || path.startsWith('/css/');

  if (!isRoot && !isJsAsset && !isCssAsset) {
    console.log(`[ASSETS] Blocked path: ${path}`);
    return c.text('Not Found', 404);
  }

  try {
    const res = await c.env.ASSETS.fetch(c.req);
    console.log(`[ASSETS] Served path: ${path} -> ${res.status}`);
    return res;
  } catch {
    console.log(`[ASSETS] Error serving path: ${path}`);
    // Asset fetch errors bubble so Cloudflare still reports them
    return c.text('Internal Server Error', 500);
  }
});

export default app;
