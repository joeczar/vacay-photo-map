# Server Setup for Remote Development

Goal: Enable the Claude Code environment to connect to your server's PostgreSQL database for full development and testing.

## Prerequisites

- Tailscale installed on both your server and the remote environment (or another VPN/network solution)
- Your server running the vacay-photo-map stack

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
