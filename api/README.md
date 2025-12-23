# Vacay Photo Map API

Self-hosted Bun + Hono API server for Vacay Photo Map with WebAuthn authentication and Cloudflare R2 storage.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) 1.0+
- **Framework**: [Hono](https://hono.dev/) 4.x
- **Database**: PostgreSQL 15+ with [postgres.js](https://github.com/porsager/postgres)
- **Auth**: WebAuthn/Passkeys ([@simplewebauthn/server](https://simplewebauthn.dev/)) + JWT (jose)
- **Storage**: Cloudflare R2 (S3-compatible) with local filesystem fallback
- **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) for thumbnails
- **Testing**: Bun test runner with coverage support

## Prerequisites

- Bun >= 1.0
- Docker & Docker Compose (for local Postgres)
- PostgreSQL 15+ (if not using Docker)

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Start Postgres
docker compose up -d postgres

# 3. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# 4. Run migrations
bun run scripts/migrate.ts

# 5. Seed sample data
bun run scripts/seed.ts

# 6. Start the server
bun run dev
```

API available at `http://localhost:3000`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin |
| `DATABASE_URL` | - | PostgreSQL connection string (required) |
| `DATABASE_SSL` | `false` | Enable SSL for database connection |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Validate server certificate (set `false` only for self-signed certs in dev) |
| `DATABASE_POOL_SIZE` | `10` | Connection pool size |
| `DATABASE_IDLE_TIMEOUT_MS` | `10000` | Idle connection timeout |
| `JWT_SECRET` | - | JWT signing secret (min 32 bytes, required) |
| `JWT_EXPIRATION` | `1h` | Token expiration (e.g., `1h`, `7d`, `30m`) |
| `SEED_ADMIN_EMAIL` | `admin@example.com` | Admin email for seeding |
| `SEED_ADMIN_NAME` | `Admin User` | Admin display name |
| `R2_ACCOUNT_ID` | - | Cloudflare account ID (optional) |
| `R2_ACCESS_KEY_ID` | - | R2 access key (optional) |
| `R2_SECRET_ACCESS_KEY` | - | R2 secret key (optional) |
| `R2_BUCKET_NAME` | - | R2 bucket name (optional) |
| `PHOTOS_DIR` | `/data/photos` | Local storage fallback directory |
| `TRUSTED_PROXY` | `false` | Enable if behind reverse proxy (production only) |

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

## Database

### Docker Compose (Recommended)

```bash
# Start Postgres
docker compose up -d postgres

# Check status
docker compose ps

# View logs
docker compose logs postgres

# Stop (keeps data)
docker compose down

# Stop and delete data
docker compose down -v
```

Default connection: `postgresql://vacay:vacay@localhost:5432/vacay`

### Migrations

The migration script applies `src/db/schema.sql` to the database:

```bash
# With .env configured
bun run scripts/migrate.ts

# Or with inline DATABASE_URL
DATABASE_URL=postgresql://vacay:vacay@localhost:5432/vacay bun run scripts/migrate.ts
```

**Security**: The migration script validates that only DDL statements (CREATE, ALTER, DROP, etc.) are executed, preventing accidental DML injection.

### Seeding

The seed script creates an admin user and sample trip:

```bash
# With .env configured
bun run scripts/seed.ts

# With custom credentials
SEED_ADMIN_EMAIL=me@example.com SEED_ADMIN_PASSWORD=supersecret bun run scripts/seed.ts
```

**Security**: The seed script validates:
- Password minimum length (8 characters)
- Blocks default credentials in production (`NODE_ENV=production`)
- bcrypt rounds within safe range (10-20)

### Schema

```
user_profiles     # User accounts
├── id            # UUID primary key
├── email         # Unique, indexed
├── webauthn_user_id  # WebAuthn user identifier
├── display_name
├── is_admin
└── timestamps

authenticators    # WebAuthn credentials (passkeys)
├── credential_id # Primary key (base64url)
├── user_id       # FK to user_profiles
├── public_key    # COSE public key
├── counter       # Signature counter (replay protection)
├── transports    # Preferred authenticator transports
├── created_at
└── last_used_at

trips             # Photo trips/albums
├── id            # UUID primary key
├── slug          # Unique URL slug, indexed
├── title
├── description
├── cover_photo_url
├── is_public     # Public/private visibility
├── access_token_hash  # Bcrypt-hashed token for private trips
└── timestamps

photos            # Individual photos
├── id            # UUID primary key
├── trip_id       # FK to trips, indexed
├── cloudinary_public_id  # R2 key (legacy name)
├── url           # Photo URL (/api/photos/:key)
├── thumbnail_url # Thumbnail URL
├── latitude/longitude  # GPS coordinates from EXIF
├── taken_at      # Timestamp from EXIF, indexed
├── caption       # Photo caption from EXIF
├── album         # Album name from EXIF
└── created_at
```

**Notes:**
- Photos are stored in Cloudflare R2 if configured, otherwise local filesystem
- `cloudinary_public_id` is actually the R2 object key (naming kept for backwards compatibility)
- One user can have multiple passkeys (multiple authenticators per user_id)

## Available Scripts

From the `api/` directory:

| Script | Description |
|--------|-------------|
| `bun run dev` | Start dev server with watch mode |
| `bun run start` | Start production server |
| `bun test` | Run tests |
| `bun run type-check` | TypeScript type checking |
| `bun run scripts/migrate.ts` | Apply database schema |
| `bun run scripts/seed.ts` | Seed sample data |

From the root directory:

| Script | Description |
|--------|-------------|
| `pnpm dev:api` | Start API dev server |
| `pnpm migrate:api` | Run migrations |
| `pnpm seed:api` | Seed database |

## API Endpoints

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/ready` | GET | Readiness check (includes database) |

```bash
# Health check
curl http://localhost:3000/health

# Readiness (checks database)
curl http://localhost:3000/health/ready
```

### Auth

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register/options` | POST | - | Start WebAuthn registration |
| `/api/auth/register/verify` | POST | - | Complete registration |
| `/api/auth/login/options` | POST | - | Start WebAuthn login |
| `/api/auth/login/verify` | POST | - | Complete login, returns JWT |
| `/api/auth/logout` | POST | - | Logout (client-side) |
| `/api/auth/me` | GET | JWT | Get current user |
| `/api/auth/passkeys` | GET | JWT | List user's passkeys |
| `/api/auth/passkeys/options` | POST | JWT | Start adding new passkey |
| `/api/auth/passkeys/verify` | POST | JWT | Complete adding passkey |
| `/api/auth/passkeys/:id` | DELETE | JWT | Remove a passkey |

### Trips

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/trips` | GET | JWT (optional) | List all trips (public + admin's private) |
| `/api/trips/:slug` | GET | Optional | Get trip by slug (token for private) |
| `/api/trips` | POST | Admin JWT | Create trip (or draft) |
| `/api/trips/:id` | PATCH | Admin JWT | Update trip |
| `/api/trips/:id` | DELETE | Admin JWT | Delete trip (cascade deletes photos) |
| `/api/trips/:id/protection` | PATCH | Admin JWT | Update protection settings |
| `/api/trips/:id/photos` | POST | Admin JWT | Add photos to existing trip |

### Photos

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/photos/:key` | GET | - | Serve photo from R2 or local storage |
| `/api/photos/:photoId` | DELETE | Admin JWT | Delete single photo |

### Upload

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/upload` | POST | Admin JWT | Upload photos (multipart/form-data) |

#### Access Control for Private Trips

When fetching a trip by slug (`GET /api/trips/:slug`):
1. **Public trips**: Returned to anyone
2. **Private trips**: Require one of:
   - Admin JWT in Authorization header
   - Valid `?token=xxx` query parameter

```bash
# Public trip - no auth needed
curl http://localhost:3000/api/trips/amsterdam-2024

# Private trip with token
curl "http://localhost:3000/api/trips/secret-trip?token=mytoken"

# Private trip with admin JWT
curl -H "Authorization: Bearer $JWT" http://localhost:3000/api/trips/secret-trip
```

#### Protection Endpoint

Update a trip's privacy settings:

```bash
# Make trip private with token
curl -X PATCH http://localhost:3000/api/trips/:id/protection \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"isPublic": false, "token": "secrettoken123"}'

# Make trip public (clears token)
curl -X PATCH http://localhost:3000/api/trips/:id/protection \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"isPublic": true}'
```

## Project Structure

```
api/
├── src/
│   ├── db/
│   │   ├── client.ts      # Database client with pooling
│   │   ├── schema.sql     # PostgreSQL schema
│   │   └── seed.sql       # SQL seed (use seed.ts instead)
│   ├── middleware/
│   │   └── auth.ts        # JWT auth middleware
│   ├── routes/
│   │   └── health.ts      # Health check endpoints
│   ├── types/
│   │   └── auth.ts        # Auth type definitions
│   ├── utils/
│   │   ├── jwt.ts         # JWT sign/verify helpers
│   │   └── password.ts    # bcrypt helpers
│   └── index.ts           # Server entry point
├── scripts/
│   ├── migrate.ts         # Migration runner
│   └── seed.ts            # Seed runner
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific file
bun test src/middleware/auth.test.ts
```

## Storage

### Cloudflare R2

Photos are stored in Cloudflare R2 (S3-compatible object storage) when configured:

1. **Setup**: Configure R2 credentials in `.env` (see environment variables)
2. **Upload**: Sharp processes images → thumbnail generated → both uploaded to R2
3. **Serving**: Photos served via `/api/photos/:key` endpoint
4. **Deletion**: Photos deleted from R2 when trip/photo is deleted

### Local Filesystem Fallback

If R2 is not configured, photos are stored locally:

- **Directory**: `PHOTOS_DIR` (default: `/data/photos`)
- **Structure**: `{tripId}/{filename}.jpg` and `{tripId}/thumb_{filename}.jpg`
- **Serving**: Photos served from local filesystem via `/api/photos/:key`

The API automatically detects R2 availability and falls back to local storage.

## Security

- **WebAuthn/Passkeys**: Industry-standard passwordless authentication
- **JWT**: HS256 signing with configurable expiration
- **Trip Tokens**: Bcrypt-hashed access tokens for private trip sharing
- **Rate Limiting**: Protection against brute force and abuse
- **RLS Policies**: Row-level security on trips and photos tables
- **Migrations**: DDL-only validation prevents SQL injection
- **Error Logging**: Sanitized to avoid leaking connection details
- **CORS**: Restricted to configured frontend origin
- **Trusted Proxy**: Production-only setting for IP forwarding behind reverse proxies

## Troubleshooting

### Database connection refused

```bash
# Check if Postgres is running
docker compose ps

# Check logs
docker compose logs postgres

# Restart
docker compose restart postgres
```

### Migration fails

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test connection
docker compose exec postgres psql -U vacay -c "SELECT 1"
```

### Seed fails with password error

The seed script requires passwords of at least 8 characters:

```bash
SEED_ADMIN_PASSWORD=longerpassword bun run scripts/seed.ts
```

## Related Issues

- [#55](https://github.com/joeczar/vacay-photo-map/issues/55) - PostgreSQL schema (this)
- [#56](https://github.com/joeczar/vacay-photo-map/issues/56) - Auth endpoints
- [#57](https://github.com/joeczar/vacay-photo-map/issues/57) - Trip endpoints
- [#58](https://github.com/joeczar/vacay-photo-map/issues/58) - JWT middleware
- [#59](https://github.com/joeczar/vacay-photo-map/issues/59) - Docker Compose
