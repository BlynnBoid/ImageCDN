import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { eq, desc, sql, isNull } from 'drizzle-orm'
import { db } from '../db/client'
import { users, api_keys, images, albums } from '../db/schema'
import { adminAuth } from '../middleware/auth'
import { keyPrefix, keySecret } from '../lib/nanoid'
import { noCache } from '../middleware/cache'

export const adminRoutes = new Hono()

/* ── Login (unprotected) ───────────────────────────────────────────── */

adminRoutes.get('/login', (c) => {
  return c.html(layout('Login', `
    <form method="POST" action="/admin/login" class="card" style="max-width:360px;margin:4rem auto">
      <h2 style="margin-bottom:1.5rem">Admin Login</h2>
      <input type="password" name="token" placeholder="Admin token" class="input" required autofocus />
      <button type="submit" class="btn" style="margin-top:1rem;width:100%">Sign in</button>
    </form>
  `))
})

adminRoutes.post('/login', async (c) => {
  const form  = await c.req.formData()
  const token = form.get('token')?.toString() ?? ''

  if (token !== (process.env.ADMIN_TOKEN ?? '')) {
    noCache(c)
    return c.html(layout('Login', `
      <form method="POST" action="/admin/login" class="card" style="max-width:360px;margin:4rem auto">
        <h2 style="margin-bottom:1.5rem">Admin Login</h2>
        <p style="color:#f87171;margin-bottom:1rem">Invalid token</p>
        <input type="password" name="token" placeholder="Admin token" class="input" required autofocus />
        <button type="submit" class="btn" style="margin-top:1rem;width:100%">Sign in</button>
      </form>
    `), 401)
  }

  noCache(c)
  return new Response(null, {
    status: 302,
    headers: {
      'Location':   '/admin',
      'Set-Cookie': `admin_session=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict`,
    },
  })
})

/* ── Protected routes (all remaining /admin/* require auth) ─────────── */

adminRoutes.use('*', adminAuth)

// GET /admin — dashboard
adminRoutes.get('/', async (c) => {
  const [totalImages, totalAlbums, totalUsers, todayImages] = await Promise.all([
    db.select({ v: sql<number>`count(*)::int` }).from(images).where(isNull(images.deleted_at)).then(r => r[0]!.v),
    db.select({ v: sql<number>`count(*)::int` }).from(albums).then(r => r[0]!.v),
    db.select({ v: sql<number>`count(*)::int` }).from(users).then(r => r[0]!.v),
    db.select({ v: sql<number>`count(*)::int` })
      .from(images)
      .where(sql`${images.created_at} >= current_date AND ${images.deleted_at} IS NULL`)
      .then(r => r[0]!.v),
  ])

  return c.html(layout('Dashboard', `
    <h1>Dashboard</h1>
    <div class="stats">
      <div class="stat"><div class="stat-value">${totalImages.toLocaleString()}</div><div class="stat-label">Images</div></div>
      <div class="stat"><div class="stat-value">${totalAlbums.toLocaleString()}</div><div class="stat-label">Albums</div></div>
      <div class="stat"><div class="stat-value">${totalUsers.toLocaleString()}</div><div class="stat-label">Users</div></div>
      <div class="stat"><div class="stat-value">${todayImages.toLocaleString()}</div><div class="stat-label">Uploads today</div></div>
    </div>
    <div style="margin-top:2rem">
      <a href="/admin/users" class="btn">Manage Users</a>
    </div>
  `))
})

// GET /admin/users
adminRoutes.get('/users', async (c) => {
  const search = c.req.query('q') ?? ''
  const isHtmx = !!c.req.header('hx-request')

  const rows = await db
    .select({
      user:       users,
      imageCount: sql<number>`(select count(*) from images where user_id = ${users.id} and deleted_at is null)::int`,
      albumCount: sql<number>`(select count(*) from albums where user_id = ${users.id})::int`,
    })
    .from(users)
    .where(search ? sql`${users.username} ilike ${'%' + search + '%'}` : sql`true`)
    .orderBy(desc(users.created_at))
    .limit(50)

  const table = `
    <table>
      <thead><tr><th>Username</th><th>Display name</th><th>Images</th><th>Albums</th><th>Joined</th><th></th></tr></thead>
      <tbody>
        ${rows.map(({ user, imageCount, albumCount }) => `
          <tr>
            <td><strong>${esc(user.username)}</strong></td>
            <td>${esc(user.display_name ?? '—')}</td>
            <td>${imageCount}</td>
            <td>${albumCount}</td>
            <td>${user.created_at.toLocaleDateString()}</td>
            <td><a href="/admin/users/${user.id}" class="btn btn-sm">View</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `

  if (isHtmx) return c.html(table)

  return c.html(layout('Users', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
      <h1>Users</h1>
      <button class="btn" onclick="document.getElementById('create-user').style.display='block'">New User</button>
    </div>
    <div id="create-user" style="display:none;margin-bottom:1.5rem" class="card">
      <form method="POST" action="/admin/users">
        <h3 style="margin-bottom:1rem">Create user</h3>
        <div style="display:flex;gap:.5rem">
          <input type="text" name="username" placeholder="Username" class="input" required />
          <button type="submit" class="btn">Create</button>
        </div>
      </form>
    </div>
    <input
      class="input"
      placeholder="Search users…"
      style="margin-bottom:1rem;width:100%;max-width:400px"
      hx-get="/admin/users"
      hx-trigger="keyup changed delay:300ms"
      hx-target="#user-table"
      name="q"
      value="${esc(search)}"
    />
    <div id="user-table">${table}</div>
  `))
})

// POST /admin/users
adminRoutes.post('/users', async (c) => {
  const form     = await c.req.formData()
  const username = form.get('username')?.toString().trim() ?? ''

  if (!username) return c.json({ error: 'Username required' }, 422)

  try {
    await db.insert(users).values({ username })
  } catch {
    return c.html('<p style="color:#f87171">Username already taken</p>', 409)
  }

  noCache(c)
  return new Response(null, { status: 302, headers: { Location: '/admin/users' } })
})

// GET /admin/users/:id
adminRoutes.get('/users/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.notFound()

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) return c.notFound()

  const keys = await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.user_id, id))
    .orderBy(desc(api_keys.created_at))

  // Show newly generated key once if redirected here after creation
  const newKey = c.req.query('new_key')
  const newKeyHtml = newKey ? `
    <div class="key-display">
      <strong style="color:#22c55e">New API key — copy it now, it won't be shown again:</strong><br/>
      <code style="margin-top:.5rem;display:block">${esc(newKey)}</code>
    </div>
  ` : ''

  return c.html(layout(`User: ${esc(user.username)}`, `
    <a href="/admin/users" style="color:#9ca3af;font-size:.875rem">← Users</a>
    <h1 style="margin-top:.5rem">${esc(user.username)}</h1>
    <p style="color:#9ca3af">${esc(user.display_name ?? 'No display name')} · Joined ${user.created_at.toLocaleDateString()}</p>

    <h2 style="margin-top:2rem;margin-bottom:1rem">API Keys</h2>
    <form method="POST" action="/admin/users/${id}/keys" style="margin-bottom:1.5rem;display:flex;gap:.5rem">
      <input type="text" name="label" placeholder="Key label (optional)" class="input" />
      <button type="submit" class="btn">Generate Key</button>
    </form>
    ${newKeyHtml}
    <table>
      <thead><tr><th>Prefix</th><th>Label</th><th>Last used</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${keys.map(k => `
          <tr id="key-${k.id}">
            <td><code>${esc(k.prefix)}…</code></td>
            <td>${esc(k.label ?? '—')}</td>
            <td>${k.last_used_at ? k.last_used_at.toLocaleDateString() : 'Never'}</td>
            <td>${k.created_at.toLocaleDateString()}</td>
            <td>
              <button
                class="btn btn-danger btn-sm"
                hx-delete="/admin/keys/${k.id}"
                hx-target="#key-${k.id}"
                hx-swap="outerHTML"
                hx-confirm="Revoke this key?"
              >Revoke</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `))
})

// POST /admin/users/:id/keys
adminRoutes.post('/users/:id/keys', async (c) => {
  const userId = parseInt(c.req.param('id'))
  if (isNaN(userId)) return c.notFound()

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.notFound()

  const form  = await c.req.formData()
  const label = form.get('label')?.toString().trim() || null

  const prefix  = keyPrefix()
  const secret  = keySecret()
  const fullKey = `${prefix}.${secret}`
  const hash    = createHash('sha256').update(fullKey).digest('hex')

  await db.insert(api_keys).values({ user_id: userId, prefix, hash, label })

  noCache(c)
  return new Response(null, {
    status: 302,
    headers: { Location: `/admin/users/${userId}?new_key=${encodeURIComponent(fullKey)}` },
  })
})

// DELETE /admin/keys/:id
adminRoutes.delete('/keys/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  await db.delete(api_keys).where(eq(api_keys.id, id))

  noCache(c)
  // htmx replaces the row with empty content
  return c.html(`<tr id="key-${id}" style="display:none"></tr>`)
})

/* ── Helpers ─────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — ImageCDN</title>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" defer></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --border: #2a2a2a;
      --text: #e0e0e0; --muted: #9ca3af; --accent: #3b82f6;
      --danger: #ef4444;
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; font-size: .9375rem; line-height: 1.5; }
    h1 { font-size: 1.5rem; font-weight: 600; }
    h2 { font-size: 1.125rem; font-weight: 600; }
    h3 { font-size: 1rem; font-weight: 600; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: .5rem; padding: 1.25rem; }
    .input { background: var(--bg); border: 1px solid var(--border); border-radius: .375rem; color: var(--text); padding: .5rem .75rem; font-size: .9375rem; outline: none; }
    .input:focus { border-color: var(--accent); }
    .btn { display: inline-block; background: var(--accent); color: #fff; border: none; border-radius: .375rem; padding: .5rem 1rem; font-size: .875rem; cursor: pointer; font-weight: 500; text-decoration: none; }
    .btn:hover { opacity: .88; text-decoration: none; }
    .btn-sm { padding: .25rem .625rem; font-size: .8125rem; }
    .btn-danger { background: var(--danger); }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: .5rem; padding: 1.25rem; }
    .stat-value { font-size: 2rem; font-weight: 700; }
    .stat-label { color: var(--muted); font-size: .875rem; margin-top: .25rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: .625rem .75rem; border-bottom: 1px solid var(--border); font-size: .875rem; }
    th { color: var(--muted); font-weight: 500; }
    tr:last-child td { border-bottom: none; }
    code { background: var(--surface); padding: .125rem .375rem; border-radius: .25rem; font-size: .8125rem; font-family: monospace; }
    .key-display { background: var(--surface); border: 1px solid #22c55e; border-radius: .5rem; padding: 1rem; margin-bottom: 1.25rem; }
  </style>
</head>
<body>
  <nav style="display:flex;align-items:center;gap:1.5rem;margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid var(--border)">
    <span style="font-weight:700;font-size:1.125rem">ImageCDN</span>
    <a href="/admin">Dashboard</a>
    <a href="/admin/users">Users</a>
    <a href="/admin/login" style="margin-left:auto;color:var(--muted);font-size:.875rem">Sign out</a>
  </nav>
  <div style="max-width:1100px">
    ${body}
  </div>
</body>
</html>`
}
