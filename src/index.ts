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

// Global logging middleware for all API requests
api.use('*', async (c, next) => {
  console.log(`[REQUEST] Method: ${c.req.method}, Path: ${c.req.path}, Headers: ${JSON.stringify(c.req.header())}`);
  await next();
  const res = c.res;
  console.log(`[RESPONSE] Status: ${res.status}, Path: ${c.req.path}`);
  if (res.headers.get('Content-Type')?.includes('application/json')) {
    // Clone and log body if JSON (avoid consuming stream)
    const clonedRes = res.clone();
    clonedRes.json().then(body => {
      console.log(`[RESPONSE BODY] ${JSON.stringify(body)}`);
    }).catch(err => {
      console.error(`[LOG ERROR] Failed to log response body: ${err.message}`);
    });
  }
});

// Apply auth middleware after logging; it skips login/verify but protects everything else (including /me)
api.use('*', authMiddleware);

// Auth routes
api.route('/', auth);

// Mount other routers
api.route('/', orgs);
api.route('/', teams);

// Mount API to app
app.route('/api', api);

// Static assets fallback with logging
app.get('*', async (c) => {
  console.log(`[STATIC REQUEST] Path: ${c.req.path}`);
  try {
    const res = await c.env.ASSETS.fetch(c.req);
    console.log(`[STATIC RESPONSE] Status: ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[STATIC ERROR] Failed to fetch asset: ${err.message}, Stack: ${err.stack}`);
    return c.text('Internal Server Error', 500);
  }
});

export default app;
