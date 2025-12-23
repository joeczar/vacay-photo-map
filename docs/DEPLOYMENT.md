# Deployment Guide

This guide covers deploying the Vacay Photo Map to a self-hosted server using Docker and GitHub Container Registry.

## Architecture

```
GitHub Actions (on push to main)
       │
       ├── Build API Docker image
       └── Push to ghcr.io/joeczar/vacay-photo-map/api:latest
              │
              ▼
Server (Surface Book 2)
       │
       ├── Watchtower polls ghcr.io every 5 minutes
       ├── Detects new image → pulls → restarts API container
       │
       └── Cloudflare Tunnel → Internet
```

## Prerequisites

- Docker and Docker Compose installed
- Cloudflare Tunnel configured (or other reverse proxy)
- GitHub account with access to the repository

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

### 3. Create Docker Compose Environment File

```bash
cp .env.production.example .env.production
# Edit with your PostgreSQL password
nano .env.production
```

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

# View logs
docker compose -f docker-compose.prod.yml logs -f api
```

## How Deployments Work

### Automatic (via Watchtower)

1. Push code to `main` branch
2. GitHub Actions builds new Docker image
3. Image pushed to `ghcr.io/joeczar/vacay-photo-map/api:latest`
4. Watchtower detects new image (polls every 5 minutes)
5. Watchtower pulls new image and restarts API container
6. Old image cleaned up automatically

### Manual Deployment

If you need to deploy immediately without waiting for Watchtower:

```bash
# Pull latest image
docker compose -f docker-compose.prod.yml pull api

# Restart with new image
docker compose -f docker-compose.prod.yml up -d api
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
# Go to: Actions → Build and Push API → select previous run → see image tag

# Pull specific version
docker pull ghcr.io/joeczar/vacay-photo-map/api:COMMIT_SHA

# Retag as latest (docker-compose uses :latest)
docker tag ghcr.io/joeczar/vacay-photo-map/api:COMMIT_SHA ghcr.io/joeczar/vacay-photo-map/api:latest

# Restart with the retagged image
docker compose -f docker-compose.prod.yml up -d api
```

## Security Notes

- Never commit `.env.production` files to git
- Rotate `JWT_SECRET` periodically
- Keep GitHub PAT secure and with minimal scope (`read:packages` only)
- Watchtower only restarts containers it's configured to watch (`vacay-api`)
