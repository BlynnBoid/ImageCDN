# ImageCDN

A fast, minimal image hosting API built with Bun + Hono. Focused purely on delivery performance — no frontend, just a lean backend with CDN-optimised headers.

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: PostgreSQL + Drizzle ORM
- **Image processing**: `Bun.image` (native, zero-dep)
- **Storage**: S3-compatible or configurable local storage

## Quick start

```bash
cp .env.example .env
# fill in DATABASE_URL and ADMIN_TOKEN at minimum

bun run db:migrate
bun run dev
```

For Flux Deploy with Git, Docker Compose, and direct VPS instructions, see
[`DEPLOYMENT.md`](DEPLOYMENT.md).

## API

Base URL: `{domain}/api`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/images` | — | Image gallery (`page`, `per_page`, `sort`) |
| GET | `/api/images/:id` | — | Single image metadata |
| DELETE | `/api/images/:id` | API key | Delete image |
| POST | `/api/upload` | API key | Upload image (file or URL) |
| POST | `/api/albums` | API key | Create album |
| GET | `/api/albums/:id` | — | Album + images (`page`, `per_page`) |
| PATCH | `/api/albums/:id` | API key | Update album |
| GET | `/api/users/:username/albums` | — | User's albums |

### Upload — file
```
POST /api/upload
Authorization: Bearer {api_key}
Content-Type: multipart/form-data

file=<image>
album_id=<encoded_id>   (optional)
```

### Upload — URL
```json
POST /api/upload
Authorization: Bearer {api_key}

{ "url": "https://example.com/photo.jpg", "album_id": "acf8kE" }
```

## Image delivery

```
GET /i/:slug/original
GET /i/:slug/medium     (max 600×800, WebP)
GET /i/:slug/thumb      (max 240×320, WebP)
```

Redirects to the storage URL with `Cache-Control: public, max-age=31536000, immutable` and `Cache-Tag` headers for Cloudflare purging.

## Admin panel

Visit `/admin` — protected by `ADMIN_TOKEN` env var. Lets you create users, generate API keys, and view stats.

## Environment

See `.env.example` for all variables. Choose `STORAGE_PROVIDER=local` with a
persistent `UPLOAD_DIR`, or `STORAGE_PROVIDER=s3` with all required S3 values.

## Commands

```bash
bun run dev          # hot reload
bun run start        # production
bun run start:deploy # migrate, then start (deployments)
bun run typecheck    # TypeScript validation
bun run db:generate  # generate migration from schema changes
bun run db:migrate   # apply migrations
bun run db:studio    # Drizzle Studio (DB browser)
```
