# Vacay Photo Map

An interactive web application for viewing vacation photos on a map with timeline visualization. Share trips via token-protected links with WebAuthn/passkey-secured admin upload capabilities.

## Features

- **Interactive Map View**: View photos plotted on an interactive Leaflet map
- **Timeline Visualization**: Chronological photo timeline with playback mode
- **EXIF Extraction**: Automatic GPS and timestamp extraction from photos
- **Trip Protection**: Share trips with secure token-protected links
- **WebAuthn Authentication**: Passwordless authentication using passkeys/biometrics
- **Cloud Storage**: Images stored in Cloudflare R2 (S3-compatible) with local filesystem fallback
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark Mode**: Full dark mode support with smooth transitions
- **Draft Management**: Save and resume trip uploads with draft functionality

## Tech Stack

- **Frontend**: Vue 3 (Composition API), TypeScript, Vite
- **UI Components**: shadcn-vue (New York style, Slate theme)
- **Styling**: TailwindCSS with CSS variables
- **State Management**: Pinia
- **Map**: Leaflet + @vue-leaflet/vue-leaflet
- **Backend**: Bun + Hono API
- **Database**: PostgreSQL 15+ with postgres.js
- **Storage**: Cloudflare R2 (with local filesystem fallback)
- **Authentication**: WebAuthn/Passkeys (@simplewebauthn) + JWT (jose)
- **Image Processing**: Sharp (thumbnails and optimization)
- **Hosting**: Netlify (frontend), self-hosted (API)

## Project Structure

```
vacay-photo-map/
├── app/                          # Vue frontend application
│   ├── src/
│   │   ├── components/          # Vue components
│   │   ├── views/               # Page views
│   │   ├── stores/              # Pinia stores
│   │   ├── composables/         # Composition API composables
│   │   ├── utils/               # Utility functions
│   │   ├── router/              # Vue Router configuration
│   │   ├── lib/                 # External service clients
│   │   └── assets/              # Static assets & styles
│   ├── public/                  # Public static files
│   └── package.json
├── api/                          # Self-hosted Bun/Hono API
│   ├── src/
│   │   ├── db/                  # Database client & schema
│   │   ├── middleware/          # Auth middleware
│   │   ├── routes/              # API routes
│   │   └── utils/               # JWT, password helpers
│   ├── scripts/                 # Migration & seed scripts
│   └── README.md                # API documentation
├── netlify/
│   └── functions/               # Netlify serverless functions
├── .github/
│   └── workflows/               # GitHub Actions
└── package.json                 # Root package.json
```

## Prerequisites

- **Bun** >= 1.0 (for API runtime)
- **Node.js** >= 20.0.0 (for frontend build)
- **pnpm** >= 9.15.0 (install with `corepack enable` or `npm install -g pnpm`)
- **Docker** & Docker Compose (for local Postgres)
- **PostgreSQL** 15+ (if not using Docker)
- **Cloudflare R2** account (optional - falls back to local storage)
- **Netlify** account (optional - for deployment)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/vacay-photo-map.git
cd vacay-photo-map
```

### 2. Install Dependencies

```bash
pnpm install
```

This will install dependencies for both the root workspace and the app.

### 3. Set Up Environment Variables

Copy the example environment files:

```bash
cp app/.env.example app/.env
cp api/.env.example api/.env
```

#### Frontend Configuration (`app/.env`)

**Local Development:**
```env
# API Backend
VITE_API_URL=http://localhost:4000

# Application Configuration
VITE_APP_URL=http://localhost:5173

# WebAuthn Configuration
VITE_WEBAUTHN_RP_NAME="Vacay Photo Map"
VITE_WEBAUTHN_RP_ID=localhost
```

**Dev Tunnel (Mobile/WebAuthn Testing):**
```env
# API Backend
VITE_API_URL=https://photos-dev-api.joeczar.com

# Application Configuration
VITE_APP_URL=https://photos-dev.joeczar.com

# WebAuthn Configuration
VITE_WEBAUTHN_RP_NAME="Vacay Photo Map"
VITE_WEBAUTHN_RP_ID=photos-dev.joeczar.com
```

#### API Configuration (`api/.env`)

**Local Development:**
```env
# Database (local Docker Compose default)
DATABASE_URL=postgresql://vacay:vacay@localhost:5433/vacay

# JWT Configuration
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_EXPIRATION=1h

# WebAuthn Configuration
RP_ID=localhost
RP_NAME=Vacay Photo Map
RP_ORIGIN=http://localhost:5173

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

**Dev Tunnel (Mobile/WebAuthn Testing):**
```env
# Database (same as local dev)
DATABASE_URL=postgresql://vacay:vacay@localhost:5433/vacay

# JWT Configuration
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_EXPIRATION=1h

# WebAuthn Configuration (must match frontend)
RP_ID=photos-dev.joeczar.com
RP_NAME=Vacay Photo Map
RP_ORIGIN=https://photos-dev.joeczar.com

# Frontend URL (for CORS)
FRONTEND_URL=https://photos-dev.joeczar.com
```

**Optional (Cloudflare R2):**
```env
# Cloudflare R2 Storage (optional - falls back to local filesystem)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=vacay-photos
```

If R2 is not configured, photos will be stored locally in `/data/photos` (or `PHOTOS_DIR` if set).

For complete environment variable documentation, see [api/README.md](./api/README.md).

### 4. Start the Database

Using Docker Compose (recommended):

```bash
docker compose -p vacay-dev up -d postgres
```

This starts PostgreSQL 15 with the default credentials from `.env.example`.

**Important:** Always use the `-p vacay-dev` project name to avoid conflicts with production Docker Compose stacks.

**Port Configuration:**
- Development database: `localhost:5433` (avoids conflicts with existing PostgreSQL installations)
- Production database: `5432` (standard PostgreSQL port)
- API development server: `localhost:4000` (avoids conflicts with production API on port 3000)

**Custom configuration:** Copy `.env.docker.example` to `.env.docker` and run:
```bash
docker compose -p vacay-dev --env-file .env.docker up -d postgres
```

> **Warning:** Postgres credentials are set at first volume creation. To change credentials, you must delete the volume: `docker compose -p vacay-dev down -v` (this deletes all data).

### 5. Initialize the Database

```bash
# Run migrations (creates schema)
pnpm migrate:api

# Seed sample data (creates admin user)
pnpm seed:api
```

Default admin credentials:
- **Email**: `admin@example.com`
- **Passkey**: Register your device on first login

### 6. Set Up Cloudflare R2 (Optional)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2
2. Create a bucket (e.g., `vacay-photos`)
3. Go to **Manage R2 API Tokens** → Create API Token
4. Copy credentials to `api/.env`
5. Restart API server

If R2 is not configured, photos will be stored locally.

### 7. Run the Development Servers

**Option 1: Local Development (default):**
```bash
pnpm dev         # Frontend (localhost:5173)
pnpm dev:api     # API (localhost:4000) - in separate terminal
```

Access the app at `http://localhost:5173`

**Option 2: Dev Tunnel (Mobile/WebAuthn Testing):**
```bash
# Same commands, but access via public URLs
pnpm dev         # Frontend
pnpm dev:api     # API
```

Access the app at `https://photos-dev.joeczar.com` (requires Cloudflare Tunnel setup)

**Benefits of dev tunnel:**
- Test WebAuthn/passkeys on real mobile devices
- Test on different networks
- Share preview with others
- Same development database as local mode

**Option 3: Run everything with Docker:**
```bash
pnpm dev:docker  # Starts Postgres, frontend, and API
```

## Available Scripts

The following `pnpm` scripts are available from the repository root, grouped by area.

### Frontend

- `pnpm dev` - Start frontend dev server (localhost:5173)
- `pnpm build` - Build frontend for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Lint and fix code with ESLint
- `pnpm lint:check` - Check lint without fixing
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting
- `pnpm test` - Run frontend tests (Vitest)
- `pnpm type-check` - TypeScript type checking

### API (`pnpm` commands from root)

- `pnpm dev:api` - Start API dev server with watch mode
- `pnpm test:api` - Run API tests (Bun test)
- `pnpm type-check:api` - TypeScript type checking for API
- `pnpm migrate:api` - Run database migrations
- `pnpm seed:api` - Seed database with sample data

### Combined

- `pnpm dev:docker` - Start Postgres, frontend, and API together
- `pnpm check:all` - Run all checks (type-check, lint, format)

## Development Workflow

See [docs/PROJECT_ROADMAP.md](./docs/PROJECT_ROADMAP.md) for the development roadmap and GitHub project board.

## Deployment

### Frontend Deployment (Netlify)

The frontend is configured for Netlify deployment via `netlify.toml`.

**Environment Variables (Netlify Dashboard):**
```env
VITE_API_URL=https://your-api-domain.com
VITE_APP_URL=https://your-site.netlify.app
VITE_WEBAUTHN_RP_NAME=Vacay Photo Map
VITE_WEBAUTHN_RP_ID=your-domain.com
```

**Deploy:**
```bash
pnpm build
netlify deploy --prod --dir=app/dist
```

Or connect your GitHub repository to Netlify for automatic deployments on push to `main`.

### API Deployment (Self-Hosted)

The API is designed for self-hosted deployment on a VPS, cloud instance, or Docker container.

**Requirements:**
- Bun runtime
- PostgreSQL 15+ database
- (Optional) Cloudflare R2 for photo storage

**Environment Variables (Production):**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/vacay
DATABASE_SSL=true
JWT_SECRET=<secure-random-32-byte-hex>
RP_ID=your-domain.com
RP_NAME=Vacay Photo Map
RP_ORIGIN=https://your-frontend-domain.com
FRONTEND_URL=https://your-frontend-domain.com
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret>
R2_BUCKET_NAME=vacay-photos
TRUSTED_PROXY=true
```

**Deploy Steps:**
1. Set up PostgreSQL database
2. Run migrations: `pnpm migrate:api`
3. Seed admin user: `pnpm seed:api`
4. Start API: `bun run start`
5. Set up reverse proxy (nginx/Caddy) with SSL

See [api/README.md](./api/README.md) for detailed deployment instructions.

## Database Schema

Current schema (see [api/src/db/schema.sql](./api/src/db/schema.sql)):

**`user_profiles`** - User accounts
- WebAuthn-based authentication (passwordless)
- Admin flag for access control
- Email for identification

**`authenticators`** - WebAuthn credentials (passkeys)
- One user can have multiple passkeys
- Counter for replay attack prevention
- Transport preferences for device compatibility

**`trips`** - Photo albums/trips
- Unique slug for URL-friendly access
- Public/private visibility with optional token protection
- Cover photo and description

**`photos`** - Individual photos
- Links to trip, GPS coordinates, timestamps
- Stored in Cloudflare R2 or local filesystem
- Thumbnail URLs for optimized loading
- EXIF metadata (caption, album name)

**Planned:**
- `photo_comments` - Comments on photos
- `invites` - Admin invite system

## Security

- **WebAuthn/Passkeys**: Passwordless authentication using device biometrics
- **JWT**: HS256 signed tokens with configurable expiration
- **Trip Tokens**: Bcrypt-hashed access tokens for private trip sharing
- **RLS Policies**: Row-level security on trips and photos
- **Rate Limiting**: Protection against abuse (implemented in routes)
- **Migration Validation**: DDL-only checks prevent SQL injection
- **Error Sanitization**: Production logs don't expose sensitive details
- **CORS**: Configured to only allow frontend origin
- **Trusted Proxy**: Production-only setting for correct IP forwarding

## Testing

### Frontend Tests (Vitest)
```bash
pnpm test          # Run all frontend tests
pnpm test:watch    # Watch mode
```

### API Tests (Bun Test)
```bash
pnpm test:api      # Run all API tests
bun test --watch   # Watch mode (from api/ directory)
```

**Test Coverage:**
- Authentication endpoints (WebAuthn registration/login)
- Trip CRUD operations
- Photo upload and serving
- Access control and token validation
- Rate limiting
- Middleware and utilities

See [.claude/rules/testing.md](./.claude/rules/testing.md) for testing standards and best practices.

## Contributing

This is a personal project, but suggestions and bug reports are welcome via GitHub issues.

## Project Documentation

- [Project Roadmap](./docs/PROJECT_ROADMAP.md) - Development milestones and progress
- [API Documentation](./api/README.md) - Complete API reference
- [CLAUDE.md](./CLAUDE.md) - Development guidelines and patterns
- [Testing Standards](./.claude/rules/testing.md) - Test-writing guidelines

## License

MIT

## Support

For issues and questions, please open a GitHub issue.

---

**Last Updated**: December 23, 2025

Built with Vue 3, Bun, Hono, PostgreSQL, and Cloudflare R2
