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
