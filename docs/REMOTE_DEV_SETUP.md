# Remote Development Setup

This document covers two approaches for remote development and testing:

1. **Dev Tunnel** - Public HTTPS URLs for mobile/WebAuthn testing (recommended for most use cases)
2. **Tailscale + Production DB** - Direct database access for advanced development

## Option 1: Dev Tunnel (Cloudflare Tunnel)

**Use case:** Test on real mobile devices, WebAuthn/passkeys, different networks

**Requirements:**
- Cloudflare Tunnel (cloudflared) running on your server
- Local development servers running (frontend + API)

### Current Setup

The dev tunnel is already configured and routes traffic as follows:

| Service | Public URL | Local Target |
|---------|-----------|--------------|
| Frontend | `https://photos-dev.joeczar.com` | `localhost:5173` |
| API | `https://photos-dev-api.joeczar.com` | `localhost:4000` |

### How to Use

**1. Start local development servers:**
```bash
docker compose -p vacay-dev up -d postgres  # Start database
pnpm dev       # Frontend (localhost:5173)
pnpm dev:api   # API (localhost:4000)
```

**2. Access via public URLs:**
- Navigate to `https://photos-dev.joeczar.com`
- Test on mobile devices, tablets, or share with others
- WebAuthn/passkeys work correctly (requires HTTPS)

### Environment Configuration

Your environment files are already configured for dev tunnel mode:

**`app/.env`:**
```env
VITE_API_URL=https://photos-dev-api.joeczar.com
VITE_APP_URL=https://photos-dev.joeczar.com
VITE_WEBAUTHN_RP_ID=photos-dev.joeczar.com
```

**`api/.env`:**
```env
RP_ID=photos-dev.joeczar.com
RP_ORIGIN=https://photos-dev.joeczar.com
FRONTEND_URL=https://photos-dev.joeczar.com
```

### Switching to Local Development

To switch back to local-only development (without public URLs):

**`app/.env`:**
```env
VITE_API_URL=http://localhost:4000
VITE_APP_URL=http://localhost:5173
VITE_WEBAUTHN_RP_ID=localhost
```

**`api/.env`:**
```env
RP_ID=localhost
RP_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

### Cloudflare Tunnel Configuration

**Server configuration** (`/home/rd/server/cloudflared/config.yml`):
```yaml
ingress:
  - hostname: photos-dev.joeczar.com
    service: http://172.20.0.1:5173
  - hostname: photos-dev-api.joeczar.com
    service: http://172.20.0.1:4000
  # ... other routes
```

**Network Details:**
- Uses Docker proxy network gateway (`172.20.0.1`) to reach host machine
- Vite configured to accept connections from `photos-dev.joeczar.com`
- Same development database as local mode (no separate setup needed)

## Option 2: Tailscale + Production Database

**Use case:** Develop against production data, test migrations, advanced debugging

**Prerequisites:**
- Tailscale installed on both your server and development machine
- Your server running the vacay-photo-map production stack

## Steps Needed

### 1. Expose PostgreSQL on Tailscale Network

Edit your server's .env.production:

    POSTGRES_HOST=0.0.0.0

Then restart PostgreSQL:

    docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres

### 2. Get Connection Details

Run on your server:

    # Get Tailscale IP
    tailscale ip -4

    # Get PostgreSQL password (from your .env.production)
    grep POSTGRES_PASSWORD .env.production

### 3. Provide These Values

I'll need from you:

- Tailscale IP: 100.x.x.x
- PostgreSQL password: (from your .env.production)
- JWT_SECRET: (generate a new one for dev with: openssl rand -hex 32)

### 4. Security Considerations

- PostgreSQL will only be accessible via Tailscale (not public internet)
- Consider using Tailscale ACLs to restrict which devices can connect
- Use a separate JWT_SECRET for development if you don't want dev sessions valid in prod
