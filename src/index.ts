// POST /api/login - Send magic link
app.post('/api/login', async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: 'Email required' }, 400);

  const token = await jwt.sign(
    { email, type: 'login', exp: Math.floor(Date.now() / 1000) + 3600 },
    c.env.JWT_SECRET
  );

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'no-reply@yourdomain.com', // Change to your verified sender
    to: email,
    subject: 'Your Login Link',
    html: `<p>Click <a href="https://grok-hello-user.zellen.workers.dev/?token=${token}">here to log in</a>.</p>`,
  });

  return c.json({ success: true });
});

// GET /api/verify - Accept magic link / invitation
app.get('/api/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Missing token' }, 400);

  let payload;
  try {
    if (!(await jwt.verify(token, c.env.JWT_SECRET))) throw new Error();
    payload = jwt.decode(token).payload;
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Existing user logic + role assignment for invitations (same as before)
  // ... (reuse your previous /api/verify logic here)

  const sessionToken = await jwt.sign({ id: user.id, email: user.email }, c.env.JWT_SECRET);
  return c.json({ token: sessionToken });
});

// GET /api/me - Return current user + roles (used by app.js)
app.get('/api/me', async (c) => {
  const user = c.get('user');
  const fullUser = await getUserWithRoles(c.env.DB, user.id);
  return c.json(fullUser);
});