# ImageCDN — cURL Reference

Framework: **Hono** on **Bun**. Base URL: `http://localhost:3000` (override with `PORT`).

## Setup

```bash
export BASE_URL="http://localhost:3000"
export API_KEY="prefix.secret"        # generated in the admin panel
export ADMIN_TOKEN="your-admin-token"  # value of ADMIN_TOKEN env var
```

Auth schemes:
- **API key** — `Authorization: Bearer <prefix>.<secret>` or `X-API-Key: <prefix>.<secret>`
- **Admin** — `Authorization: Bearer <ADMIN_TOKEN>` or cookie `admin_session=<ADMIN_TOKEN>`

---

## Health & Files

```bash
# Health check
curl "$BASE_URL/health"

# Serve a local file (LocalStorage mode only); <key> is the storage key
curl "$BASE_URL/files/<key>"
```

---

## Delivery (`/i`)

```bash
# Redirect (302) to the storage public URL for a variant.
# variant must be: original | medium | thumb
curl -L "$BASE_URL/i/<slug>/original"
curl -L "$BASE_URL/i/<slug>/medium"
curl -L "$BASE_URL/i/<slug>/thumb"
```

---

## Images (`/api/images`)

```bash
# List images (public)
curl "$BASE_URL/api/images?page=1&per_page=20&sort=created_at"   # sort: created_at | size_bytes

# Get a single image (public)
curl "$BASE_URL/api/images/<encoded_id>"

# Delete an image (API key; must own it) — soft delete
curl -X DELETE "$BASE_URL/api/images/<encoded_id>" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Albums (`/api/albums`)

```bash
# Create an album (API key)
curl -X POST "$BASE_URL/api/albums" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Album","description":"optional","visibility":"public"}'  # visibility: public | private

# Get an album with its images (public)
curl "$BASE_URL/api/albums/<encoded_id>?page=1&per_page=20&sort=created_at"  # sort: created_at | images_count

# Update an album (API key; must own it) — all fields optional
curl -X PATCH "$BASE_URL/api/albums/<encoded_id>" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"New Title","description":"updated","visibility":"private"}'
```

---

## Upload (`/api/upload`) — API key required

```bash
# Multipart file upload (max 25 MB by default; album_id optional)
curl -X POST "$BASE_URL/api/upload" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@./path/to/image.jpg" \
  -F "album_id=<album_slug>"

# Upload from a URL (JSON); url must resolve to image/* content
curl -X POST "$BASE_URL/api/upload" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/photo.png","album_id":"<album_slug>"}'
```

---

## Users (`/api/users`)

```bash
# List a user's albums (public)
curl "$BASE_URL/api/users/<username>/albums?page=1&per_page=20"
```

---

## Admin (`/admin`) — returns HTML (htmx)

```bash
# Login form (no auth)
curl "$BASE_URL/admin/login"

# Login: sets admin_session cookie, 302 -> /admin
curl -i -X POST "$BASE_URL/admin/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$ADMIN_TOKEN"

# Dashboard
curl "$BASE_URL/admin" -H "Authorization: Bearer $ADMIN_TOKEN"

# List/search users (q optional)
curl "$BASE_URL/admin/users?q=alice" -H "Authorization: Bearer $ADMIN_TOKEN"

# Create a user
curl -X POST "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=alice"

# Get a user + their API keys (id is integer; new_key optional)
curl "$BASE_URL/admin/users/1" -H "Authorization: Bearer $ADMIN_TOKEN"

# Generate an API key for a user (label optional) — 302 to user page with new_key
curl -i -X POST "$BASE_URL/admin/users/1/keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "label=my-laptop"

# Revoke an API key (id is integer)
curl -X DELETE "$BASE_URL/admin/keys/1" -H "Authorization: Bearer $ADMIN_TOKEN"
```
