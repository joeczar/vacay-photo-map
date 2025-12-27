# Deployment Guide

This guide covers deploying the Vacay Photo Map to a self-hosted server using Docker and GitHub Container Registry.

## Architecture

```
GitHub Actions (on push to main)
       │
       ├── Build API Docker image → ghcr.io/joeczar/vacay-photo-map/api:latest
       └── Build Frontend Docker image → ghcr.io/joeczar/vacay-photo-map/frontend:latest
              │
              ▼
Server (Surface Book 2)
       │
       ├── Watchtower polls ghcr.io every 5 minutes
       ├── Detects new images → pulls → restarts containers
       │   (monitors both vacay-api and vacay-frontend)
       │
       └── Cloudflare Tunnel → Internet
```

## Environment Overview

This project supports multiple environments. Each uses separate resources to prevent data conflicts.

| Environment | Compose File | Database | Network | Use Case |
|-------------|--------------|----------|---------|----------|
| **Production** | `docker-compose.prod.yml` | `vacay-postgres` (internal) | `internal` + `proxy` | Live app via ghcr.io images |
| **Development** | `docker-compose.dev.yml` | `vacay-postgres-dev:5433` | `default` | Hot-reload API from source |
| **Testing** | N/A (uses dev DB) | `vacay-postgres-dev:5433` | `default` | `pnpm test` |
| **CI** | GitHub Actions | Service container | N/A | Automated tests on PR |

### Running Environments

```bash
# Production (full stack from ghcr.io)
docker compose -p vacay-prod -f docker-compose.prod.yml --env-file .env.production up -d

# Development (hot-reload API + dev postgres)
docker compose -p vacay-dev -f docker-compose.dev.yml up -d

# Dev postgres only (for local `pnpm dev` or tests)
docker compose -p vacay-dev up -d postgres

# Run tests (requires dev postgres on port 5433)
cd api && bun test
```

### Running Prod and Dev Simultaneously

You can run both on the same machine:
- **Prod postgres** runs on `internal` network (not exposed to host)
- **Dev postgres** runs on port 5433 (exposed to host)
- Different networks prevent cross-contamination

```
┌─────────────────────────────────────────────────────────────┐
│                     Same Machine                             │
├─────────────────────────────┬───────────────────────────────┤
│ PRODUCTION                  │ DEVELOPMENT                   │
│ (internal network)          │ (default network)             │
├─────────────────────────────┼───────────────────────────────┤
│ vacay-postgres (5432)       │ vacay-postgres-dev (5433)     │
│ vacay-api                   │ vacay-api-dev (hot reload)    │
│ vacay-frontend              │ localhost:5173 (vite)         │
│ watchtower                  │                               │
└─────────────────────────────┴───────────────────────────────┘
```

### Common Issues

**API returns 500 / DNS error:**
- Cause: Mixing prod API with dev postgres (different networks)
- Fix: Start the full prod stack including `vacay-postgres`

**Port conflict on 5432:**
- Dev postgres uses port 5433 to avoid conflicts with any system postgres

## Prerequisites

- Docker and Docker Compose installed
- Cloudflare Tunnel configured (or other reverse proxy)
- GitHub account with access to the repository

### GitHub Repository Variables

For the frontend CI/CD to build with correct production URLs, configure these repository variables:

1. Go to GitHub → Repository Settings → Secrets and variables → Actions → Variables tab
2. Add the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Production API URL | `https://photos.joeczar.com` |
| `VITE_APP_URL` | Production frontend URL | `https://photos.joeczar.com` |
| `VITE_WEBAUTHN_RP_ID` | Domain for WebAuthn | `photos.joeczar.com` |
| `VITE_WEBAUTHN_RP_NAME` | Display name for passkeys | `Vacay Photo Map` |

**Note:** These are repository **variables** (not secrets) since they're not sensitive and will be embedded in the frontend JavaScript bundle.

## Initial Server Setup

### 1. Clone the Repository

```bash
git clone https://github.com/joeczar/vacay-photo-map.git
cd vacay-photo-map
```

### 2. Create Production Environment Files

**CRITICAL: Password Synchronization Required**

You need TWO separate environment files with the SAME database password:

#### Step 2a: Generate a Strong Password

```bash
# Generate a secure password (save this for the next steps)
openssl rand -base64 32
```

#### Step 2b: Create Root Environment File

The root `.env.production` is loaded by Docker Compose via env_file directive:

```bash
cp .env.production.example .env.production
nano .env.production
```

Set `POSTGRES_PASSWORD` to your generated password:
```bash
POSTGRES_PASSWORD=your_strong_password_here
```

#### Step 2c: Create API Environment File

```bash
cp api/.env.production.example api/.env.production
nano api/.env.production
```

**CRITICAL:** Use the SAME password in `DATABASE_URL`:
```bash
# If your password is: abc123xyz
# Then DATABASE_URL should be:
DATABASE_URL=postgresql://vacay:abc123xyz@postgres:5432/vacay
```

**Common Mistakes:**
- Using `${POSTGRES_PASSWORD}` in DATABASE_URL (env_file doesn't support substitution)
- Using different passwords in the two files
- Leaving placeholder text like `REPLACE_WITH_STRONG_PASSWORD`

Other key values to configure in `api/.env.production`:
- `JWT_SECRET` - Generate with `openssl rand -hex 32`
- `RP_ID` / `RP_ORIGIN` - Your production domain
- R2 credentials (optional)

### 4. Authenticate with GitHub Container Registry

Create a GitHub Personal Access Token (PAT):
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create token with `read:packages` scope
3. Save the token securely

Login to ghcr.io on your server:
```bash
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### 5. Create External Network

```bash
docker network create proxy
```

### 6. Start Services

```bash
# The --env-file flag is optional (docker-compose.prod.yml includes env_file directive)
docker compose -p vacay-prod -f docker-compose.prod.yml up -d

# Alternatively, you can still use --env-file explicitly:
docker compose -p vacay-prod -f docker-compose.prod.yml --env-file .env.production up -d
```

### 7. Verify Deployment

```bash
# Check container status
docker compose -p vacay-prod -f docker-compose.prod.yml ps

# Check API health
curl http://localhost:3000/health

# Check database connectivity
curl http://localhost:3000/health/ready

# Check frontend health
curl http://localhost:80/health

# View logs
docker compose -p vacay-prod -f docker-compose.prod.yml logs -f api
```

## Environment Variable Loading

The production deployment uses Docker Compose's `env_file` directive to load environment variables:

**How it works:**
1. Root `.env.production` is loaded via `env_file` directive in docker-compose.prod.yml
2. Variables (like `POSTGRES_PASSWORD`) are available to the postgres service
3. API service mounts `api/.env.production` into the container
4. Both files must contain the SAME database password (in different formats)

**File Structure:**
```
.env.production              # Docker Compose environment
  └─ POSTGRES_PASSWORD=xyz   # Used by postgres service

api/.env.production          # API runtime environment
  └─ DATABASE_URL=postgresql://vacay:xyz@...
                                         ^^^
                                    MUST MATCH
```

**Why two files?**
- Docker Compose needs `POSTGRES_PASSWORD` to initialize the database
- The API needs the full `DATABASE_URL` connection string
- Docker's env_file doesn't support variable substitution, so you can't reference `${POSTGRES_PASSWORD}`
- Therefore, the password must be written literally in both places

## How Deployments Work

### Automatic (via Watchtower)

1. Push code to `main` branch
2. GitHub Actions builds Docker images:
   - Changes in `api/**` trigger API build → `ghcr.io/joeczar/vacay-photo-map/api:latest`
   - Changes in `app/**` trigger frontend build → `ghcr.io/joeczar/vacay-photo-map/frontend:latest`
3. Watchtower detects new images (polls every 5 minutes)
4. Watchtower pulls new images and restarts affected containers
5. Old images cleaned up automatically

**Note:** Frontend and API deploy independently based on path triggers. Watchtower monitors both `vacay-api` and `vacay-frontend` containers.

### Manual Deployment

If you need to deploy immediately without waiting for Watchtower:

```bash
# Pull latest API image
docker compose -p vacay-prod -f docker-compose.prod.yml pull api

# Restart API with new image
docker compose -p vacay-prod -f docker-compose.prod.yml up -d api

# Pull latest frontend image
docker compose -p vacay-prod -f docker-compose.prod.yml pull frontend

# Restart frontend with new image
docker compose -p vacay-prod -f docker-compose.prod.yml up -d frontend
```

## Monitoring

### Health Endpoints

- `GET /health` - Basic health check (always returns 200 if API is running)
- `GET /health/ready` - Readiness check (verifies database connection)

### Logs

```bash
# All services
docker compose -p vacay-prod -f docker-compose.prod.yml logs -f

# API only
docker compose -p vacay-prod -f docker-compose.prod.yml logs -f api

# Watchtower (deployment logs)
docker compose -p vacay-prod -f docker-compose.prod.yml logs -f watchtower
```

### Container Status

```bash
docker compose -p vacay-prod -f docker-compose.prod.yml ps
```

## Troubleshooting

### API Won't Start

1. Check logs: `docker compose -p vacay-prod -f docker-compose.prod.yml logs api`
2. Verify database is healthy: `docker compose -p vacay-prod -f docker-compose.prod.yml ps postgres`
3. Check environment file exists: `ls -la api/.env.production`

### Watchtower Not Pulling New Images

1. Check Watchtower logs: `docker compose -p vacay-prod -f docker-compose.prod.yml logs watchtower`
2. Verify ghcr.io authentication: `docker pull ghcr.io/joeczar/vacay-photo-map/api:latest`
3. If auth fails, re-run: `echo PAT | docker login ghcr.io -u USERNAME --password-stdin`

### Database Connection Failed

1. Check PostgreSQL is running: `docker compose -p vacay-prod -f docker-compose.prod.yml ps postgres`
2. Verify DATABASE_URL in `api/.env.production`
3. **COMMON ISSUE: Password mismatch** - The password in `DATABASE_URL` must match `POSTGRES_PASSWORD` in root `.env.production`
   ```bash
   # Check root password
   grep POSTGRES_PASSWORD .env.production

   # Check API password (extract from DATABASE_URL)
   grep DATABASE_URL api/.env.production

   # They must match exactly
   ```
4. Ensure you're using the actual password, not `${POSTGRES_PASSWORD}` or a placeholder

### WebAuthn/Passkeys Not Working

1. Verify `RP_ID` matches your domain exactly (no protocol, no trailing slash)
2. Verify `RP_ORIGIN` includes protocol: `https://your-domain.com`
3. Ensure you're accessing via HTTPS (required for WebAuthn)

## Rollback

To rollback to a previous version:

```bash
# Find previous image SHA from GitHub Actions
# Go to: Actions → Build and Push API/Frontend → select previous run → see image tag

# Rollback API
docker pull ghcr.io/joeczar/vacay-photo-map/api:COMMIT_SHA
docker tag ghcr.io/joeczar/vacay-photo-map/api:COMMIT_SHA ghcr.io/joeczar/vacay-photo-map/api:latest
docker compose -p vacay-prod -f docker-compose.prod.yml up -d api

# Rollback Frontend
docker pull ghcr.io/joeczar/vacay-photo-map/frontend:COMMIT_SHA
docker tag ghcr.io/joeczar/vacay-photo-map/frontend:COMMIT_SHA ghcr.io/joeczar/vacay-photo-map/frontend:latest
docker compose -p vacay-prod -f docker-compose.prod.yml up -d frontend
```

## Security Notes

- Never commit `.env.production` files to git
- Rotate `JWT_SECRET` periodically
- Keep GitHub PAT secure and with minimal scope (`read:packages` only)
- Watchtower only restarts containers it's configured to watch (`vacay-api`, `vacay-frontend`)
