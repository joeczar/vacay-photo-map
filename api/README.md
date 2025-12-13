# Vacay Photo Map API

Self-hosted Bun + Hono API server for Vacay Photo Map.

> **Migration Note**: This API replaces Supabase for self-hosted deployments. The schema intentionally diverges from the Supabase version - see [Schema Differences](#schema-differences).

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **Database**: PostgreSQL 15+ with [postgres.js](https://github.com/porsager/postgres)
- **Auth**: JWT (jose) + bcrypt password hashing
- **Testing**: Bun test runner

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
| `DATABASE_POOL_SIZE` | `10` | Connection pool size |
| `DATABASE_IDLE_TIMEOUT_MS` | `10000` | Idle connection timeout |
| `JWT_SECRET` | - | JWT signing secret (min 32 bytes, required) |
| `JWT_EXPIRATION` | `1h` | Token expiration (e.g., `1h`, `7d`, `30m`) |
| `BCRYPT_SALT_ROUNDS` | `14` | Password hashing rounds (10-20) |
| `SEED_ADMIN_EMAIL` | `admin@example.com` | Admin email for seeding |
| `SEED_ADMIN_PASSWORD` | `admin123` | Admin password for seeding (min 8 chars) |
| `SEED_ADMIN_NAME` | `Admin User` | Admin display name |

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
user_profiles     # Users with email/password auth
├── id            # UUID primary key
├── email         # Unique, indexed
├── password_hash # bcrypt hash
├── display_name
├── is_admin
└── timestamps

trips             # Photo trips/albums
├── id            # UUID primary key
├── slug          # Unique URL slug, indexed
├── title
├── description
├── cover_photo_url
├── is_public     # RLS visibility
├── access_token_hash  # For protected sharing
└── timestamps

photos            # Individual photos
├── id            # UUID primary key
├── trip_id       # FK to trips, indexed
├── cloudinary_public_id
├── url
├── thumbnail_url
├── latitude/longitude
├── taken_at      # Indexed, compound index with trip_id
├── caption
├── album
└── created_at
```

### Schema Differences

This schema differs from the Supabase-hosted version:

| Feature | Self-Hosted | Supabase |
|---------|-------------|----------|
| Auth | `user_profiles.password_hash` | Supabase Auth service |
| User ID | `user_profiles.id` (UUID) | `auth.users.id` |
| RLS | Permissive for dev | User-based policies |

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

### Auth (Coming - Issue #56)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Login, returns JWT |
| `/auth/logout` | POST | Logout (client-side) |
| `/auth/me` | GET | Get current user |

### Trips (Coming - Issue #57)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/trips` | GET | List public trips |
| `/trips/:slug` | GET | Get trip by slug |
| `/trips` | POST | Create trip (auth required) |
| `/trips/:id` | PUT | Update trip (auth required) |
| `/trips/:id` | DELETE | Delete trip (admin only) |

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

## Security

- **JWT**: HS256 signing with configurable expiration
- **Passwords**: bcrypt with configurable rounds (default: 14)
- **Migrations**: DDL-only validation prevents SQL injection
- **Seeding**: Password strength validation, production guards
- **Error Logging**: Sanitized to avoid leaking connection details
- **RLS**: Row-level security enabled (permissive for dev - tighten for prod)

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
