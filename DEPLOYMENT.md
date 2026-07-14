# Deployment

ImageCDN uses the same runtime contract on a VPS, in Docker, and on Flux:

- Bun `1.2.18`
- HTTP on `HOST`/`PORT` (defaults to `0.0.0.0:3000`)
- PostgreSQL supplied through `DATABASE_URL`
- `bun run start:deploy` applies migrations, then starts the server
- `/health` checks the process; `/ready` also checks PostgreSQL

## Required configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL |
| `ADMIN_TOKEN` | Protects the admin panel |
| `PUBLIC_URL` | Public HTTPS origin, used for local-storage image URLs |
| `STORAGE_PROVIDER` | `local` or `s3` |

For local storage, set `UPLOAD_DIR` to a persistent mounted directory. For S3,
set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`; set
`S3_PUBLIC_BASE_URL` when public object URLs differ from the API endpoint.

## Flux Deploy with Git

Flux Deploy with Git runs the repository through Orbit. Register the web
component with these values:

| Flux setting | Value |
| --- | --- |
| Docker image | `runonflux/orbit:latest` |
| `GIT_REPO_URL` | HTTPS URL of this repository |
| `GIT_BRANCH` | Branch to deploy, such as `main` |
| `APP_PORT` | `3000` |
| `BUN_VERSION` | `1.2.18` |
| `BUILD_COMMAND` | `bun install --frozen-lockfile` |
| `RUN_COMMAND` | `bun run start:deploy` |
| `HEALTH_CHECK_PATH` | `/ready` |

Expose application port `3000`. Expose Orbit's webhook port `9001` only when
using GitHub webhook deployments; polling deployments do not need it publicly
exposed. Set `POLLING_INTERVAL=300` for five-minute repository polling if
desired.

Add application variables in Flux rather than committing an `.env` file:

```dotenv
HOST=0.0.0.0
PORT=3000
PUBLIC_URL=https://your-app.app.runonflux.io
DATABASE_URL=postgresql://USER:PASSWORD@POSTGRES_HOST:5432/imagecdn
ADMIN_TOKEN=generate-a-long-random-value
MAX_FILE_SIZE_MB=25
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://your-s3-compatible-endpoint
S3_REGION=auto
S3_BUCKET=imagecdn
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_BASE_URL=https://cdn.example.com
```

### PostgreSQL on Flux

Deploy PostgreSQL as a separate Flux database application/component, with its
data directory on persistent storage. Use the host, port, database, username,
and password assigned to that deployment to construct `DATABASE_URL` for the
web component. Do not use `localhost`: inside Orbit it refers to the ImageCDN
container, not the PostgreSQL deployment.

The app does not require a Flux-specific database adapter. A Flux-hosted
PostgreSQL instance, a managed PostgreSQL provider, and a PostgreSQL server on
your VPS all work through the same URL. Include provider-required TLS query
parameters in the URL, such as `?sslmode=require`.

`start:deploy` runs checked-in Drizzle migrations before accepting traffic.
Migration attempts are protected by a PostgreSQL advisory lock so multiple
Flux replicas can start concurrently without migrating in parallel.

### Storage on Flux

Use S3-compatible object storage for a replicated Flux deployment. A local
volume belongs to an individual node and is not a shared image store across
replicas. Local storage is suitable only for a single instance with a durable
volume mounted at the configured `UPLOAD_DIR`.

## Docker on a VPS

The included Compose stack runs ImageCDN and PostgreSQL with persistent named
volumes. Create an `.env` file containing at least:

```dotenv
PUBLIC_URL=https://images.example.com
ADMIN_TOKEN=generate-a-long-random-value
POSTGRES_PASSWORD=generate-a-different-random-value
```

Then start it:

```bash
docker compose up -d --build
docker compose ps
```

The default port mapping is `3000:3000`. Put Caddy, nginx, or another TLS
reverse proxy in front of it. Back up both the `postgres-data` and `uploads`
volumes when using local image storage.

To use external PostgreSQL or S3 on a VPS, run the image directly and supply
the same environment variables used by Flux:

```bash
docker build -t imagecdn .
docker run -d --name imagecdn --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v imagecdn-uploads:/data/uploads \
  imagecdn
```

## Bun Directly on a VPS

```bash
bun install --frozen-lockfile
bun run start:deploy
```

Use systemd or another process supervisor in production. If local storage is
selected, set `UPLOAD_DIR` to an absolute persistent path and ensure the
service user can write to it.

## Updating

For all deployment targets, the update sequence is:

```bash
bun install --frozen-lockfile
bun run start:deploy
```

Commit generated files under `src/db/migrations/` whenever the schema changes.
Never use `drizzle-kit push` as the production deployment mechanism.

## PgBouncer connection pooling

The app connects with `prepare: false` (required for PgBouncer transaction
pooling mode). Point `DATABASE_URL` at PgBouncer instead of PostgreSQL directly.

With a 5-connection PostgreSQL limit across 3 Flux instances, the math without
a pooler is impossible: 3 instances × `DB_POOL_MAX=10` = 30 attempted
connections. With PgBouncer:

```
Flux instances (3 × DB_POOL_MAX=20 = 60 app connections)
       ↓
  PgBouncer  (DEFAULT_POOL_SIZE=4 server connections)
       ↓
  PostgreSQL (5 connection limit, 1 reserved for admin/migrations)
```

### Flux deployment

Deploy PgBouncer as a separate Flux application in transaction pooling mode.
Set these env vars:

```dotenv
DB_HOST=<postgres-flux-hostname>
DB_PORT=5432
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=imagecdn
POOL_MODE=transaction
MAX_CLIENT_CONN=100
DEFAULT_POOL_SIZE=4
AUTH_TYPE=scram-sha-256
```

Then set each ImageCDN instance's `DATABASE_URL` to the PgBouncer host/port
(default PgBouncer port is `6432`) and raise `DB_POOL_MAX` to `20`:

```dotenv
DATABASE_URL=postgresql://user:password@pgbouncer-host:6432/imagecdn
DB_POOL_MAX=20
```

### Docker Compose (local/VPS)

The included `compose.yaml` adds PgBouncer automatically. The app connects to
`pgbouncer:6432`; PgBouncer holds at most `PGBOUNCER_POOL_SIZE` (default `4`)
server connections to PostgreSQL. No extra configuration is needed.

## Multi-region setup

The three Flux instances (`na1`, `eu1`, `eu2`) share a single PostgreSQL database
but each stores images locally. `PUBLIC_URL` on each instance is its own domain,
and is recorded as `storage_origin` on every image at upload time. The delivery
route (`/i/:slug/:variant`) reads `storage_origin` and redirects there, so a
request hitting `eu1` for an image uploaded on `na1` still redirects the client
correctly to `na1`.

### Instance env vars

Each Flux instance needs its own `PUBLIC_URL`:

| Instance | `PUBLIC_URL` |
| --- | --- |
| na1 | `https://na1.frogcdn.com` |
| eu1 | `https://eu1.frogcdn.com` |
| eu2 | `https://eu2.frogcdn.com` |

### Geo-routing endpoint

`GET /api/region` on the main gateway domain (`image.app.runonflux.io`) reads
the Cloudflare `CF-IPCountry` request header and returns the nearest regional
upload URL. Americas traffic routes to `na1`; everything else routes to `eu1`.

The gateway domain optionally overrides the regional URLs via env:

```dotenv
REGION_NA1_URL=https://na1.frogcdn.com
REGION_EU1_URL=https://eu1.frogcdn.com
REGION_EU2_URL=https://eu2.frogcdn.com
```

### Upload flow

```
client → GET https://image.app.runonflux.io/api/region
       ← { "upload_url": "https://na1.frogcdn.com/api/upload" }

client → POST https://na1.frogcdn.com/api/upload  (file lands on na1)
       ← { "image": { "slug": "abc123", ... } }

client → GET  https://eu1.frogcdn.com/i/abc123/thumb
       ← 302  https://na1.frogcdn.com/files/images/abc123/thumb.webp
```

Any instance can answer metadata and delivery requests. Only the instance that
holds the file needs to serve it.

### Existing images (pre-migration)

Images uploaded before this change have `storage_origin = NULL`. Delivery falls
back to `storage.publicUrl()` — the current instance's `PUBLIC_URL`. If an image
was uploaded on a now-different-domain instance, those old images will need to be
re-uploaded or manually backfilled with the correct `storage_origin`.
