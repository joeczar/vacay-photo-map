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
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (optional) | `your-cloud-name` |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary preset (optional) | `your-preset` |

**Note:** These are repository **variables** (not secrets) since they're not sensitive and will be embedded in the frontend JavaScript bundle.

## Initial Server Setup

### 1. Clone the Repository

```bash
git clone https://github.com/joeczar/vacay-photo-map.git
cd vacay-photo-map
```

### 2. Create Production Environment File

```bash
cp api/.env.production.example api/.env.production
# Edit with your production values
nano api/.env.production
```

Key values to configure:
- `DATABASE_URL` - Use a strong password
- `JWT_SECRET` - Generate with `openssl rand -hex 32`
- `RP_ID` / `RP_ORIGIN` - Your production domain
- R2 credentials (optional)

### 3. Create Root Environment File (for Docker Compose)

The root `.env.production` provides `POSTGRES_PASSWORD` for Docker Compose:

```bash
cp .env.production.example .env.production
# Edit with your PostgreSQL password
nano .env.production
```

**Note:** This is separate from `api/.env.production` - you need both files.

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
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 7. Verify Deployment

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Check API health
curl http://localhost:3000/health

# Check database connectivity
curl http://localhost:3000/health/ready

# Check frontend health
curl http://localhost:80/health

# View logs
docker compose -f docker-compose.prod.yml logs -f api
```

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
docker compose -f docker-compose.prod.yml pull api

# Restart API with new image
docker compose -f docker-compose.prod.yml up -d api

# Pull latest frontend image
docker compose -f docker-compose.prod.yml pull frontend

# Restart frontend with new image
docker compose -f docker-compose.prod.yml up -d frontend
```

## Monitoring

### Health Endpoints

- `GET /health` - Basic health check (always returns 200 if API is running)
- `GET /health/ready` - Readiness check (verifies database connection)

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# API only
docker compose -f docker-compose.prod.yml logs -f api

# Watchtower (deployment logs)
docker compose -f docker-compose.prod.yml logs -f watchtower
```

### Container Status

```bash
docker compose -f docker-compose.prod.yml ps
```

## Troubleshooting

### API Won't Start

1. Check logs: `docker compose -f docker-compose.prod.yml logs api`
2. Verify database is healthy: `docker compose -f docker-compose.prod.yml ps postgres`
3. Check environment file exists: `ls -la api/.env.production`

### Watchtower Not Pulling New Images

1. Check Watchtower logs: `docker compose -f docker-compose.prod.yml logs watchtower`
2. Verify ghcr.io authentication: `docker pull ghcr.io/joeczar/vacay-photo-map/api:latest`
3. If auth fails, re-run: `echo PAT | docker login ghcr.io -u USERNAME --password-stdin`

### Database Connection Failed

1. Check PostgreSQL is running: `docker compose -f docker-compose.prod.yml ps postgres`
2. Verify DATABASE_URL in `api/.env.production`
3. Check password matches in `.env.production` (POSTGRES_PASSWORD)

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
docker compose -f docker-compose.prod.yml up -d api

# Rollback Frontend
docker pull ghcr.io/joeczar/vacay-photo-map/frontend:COMMIT_SHA
docker tag ghcr.io/joeczar/vacay-photo-map/frontend:COMMIT_SHA ghcr.io/joeczar/vacay-photo-map/frontend:latest
docker compose -f docker-compose.prod.yml up -d frontend
```

## Security Notes

- Never commit `.env.production` files to git
- Rotate `JWT_SECRET` periodically
- Keep GitHub PAT secure and with minimal scope (`read:packages` only)
- Watchtower only restarts containers it's configured to watch (`vacay-api`, `vacay-frontend`)
