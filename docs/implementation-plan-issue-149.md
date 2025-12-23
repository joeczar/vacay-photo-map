# Implementation Plan: Add Frontend Build to CI/CD Pipeline

**Issue:** #149
**Branch:** `feature/issue-149-frontend-cicd`
**Complexity:** Medium
**Total Commits:** 5

## Overview

Automate frontend deployment using the same containerized pattern as the API: build Docker image in GitHub Actions → push to GHCR → Watchtower auto-deploys. This eliminates manual SSH builds and provides atomic deploys with rollback capability.

## Prerequisites

- [ ] API CI/CD working (`.github/workflows/build-and-push.yml`)
- [ ] Watchtower monitoring `vacay-api` container
- [ ] External `proxy` network exists
- [ ] GHCR authentication working

## Architecture

### Components
- `app/Dockerfile` - Multi-stage build (node → nginx static server)
- `app/nginx.conf` - SPA routing, gzip compression, security headers
- `.github/workflows/build-and-push-frontend.yml` - CI workflow for frontend
- `docker-compose.prod.yml` - Add frontend service + update Watchtower
- `docs/DEPLOYMENT.md` - Updated deployment documentation

### Data Flow
```
Push to main (app/**) → GitHub Actions → Build image → Push to GHCR
                                                           ↓
                        Watchtower (5 min poll) → Pull → Restart frontend container
                                                           ↓
                                        Serve static files via nginx (port 80)
```

### Container Strategy
- **Build stage:** Node 20 + pnpm to build Vite app
- **Runtime stage:** nginx:alpine serving static files from `app/dist/`
- **Size:** ~25MB runtime image (vs ~1.2GB build image)
- **Monitoring:** Watchtower watches both `vacay-api` and `vacay-frontend`

## Atomic Commits

Each commit is a reviewable unit. Implementer completes one commit, returns diff for review, then proceeds to next.

---

### Commit 1: Create frontend Dockerfile with multi-stage build
**Type:** feat
**Scope:** app
**Files:**
- `app/Dockerfile` - Create

**Changes:**
- Create multi-stage Dockerfile:
  - **Build stage:** Use `node:20-alpine`, install pnpm, copy package files, install dependencies, copy source, run `pnpm build`
  - **Runtime stage:** Use `nginx:alpine`, copy built files from build stage to `/usr/share/nginx/html`
  - Expose port 80
  - Add healthcheck for nginx
- Follow pattern from `api/Dockerfile` (alpine base, multi-stage, healthcheck)

**Example Structure:**
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
# Copy package files
COPY package.json pnpm-lock.yaml ./
# Install dependencies
RUN pnpm install --frozen-lockfile
# Copy source and build
COPY . .
RUN pnpm build

# Stage 2: Runtime
FROM nginx:alpine
# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy nginx config (added in next commit)
COPY nginx.conf /etc/nginx/nginx.conf
# Expose port
EXPOSE 80
# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
```

**Acceptance Criteria:**
- [ ] Dockerfile builds successfully: `docker build -t test-frontend ./app`
- [ ] Built image size < 50MB
- [ ] Image contains `/usr/share/nginx/html/index.html`
- [ ] No node_modules in runtime image

---

### Commit 2: Add nginx configuration for SPA routing
**Type:** feat
**Scope:** app
**Files:**
- `app/nginx.conf` - Create

**Changes:**
- Create nginx configuration with:
  - SPA fallback: All routes serve `index.html` (Vue Router handles routing)
  - Gzip compression for static assets
  - Cache headers for assets vs HTML
  - Security headers (X-Frame-Options, X-Content-Type-Options)
  - Proper MIME types
- Listen on port 80
- Server static files from `/usr/share/nginx/html`

**Example Structure:**
```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # No cache for HTML
        location ~* \.html$ {
            add_header Cache-Control "no-cache";
        }

        # SPA fallback - all routes serve index.html
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Nginx config syntax valid: `docker run --rm -v $(pwd)/app/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t`
- [ ] Test container serves index.html: `docker run -p 8080:80 test-frontend` → curl http://localhost:8080
- [ ] SPA routing works: curl http://localhost:8080/trips returns index.html (not 404)
- [ ] Gzip enabled in response headers

---

### Commit 3: Create GitHub Actions workflow for frontend builds
**Type:** feat
**Scope:** ci
**Files:**
- `.github/workflows/build-and-push-frontend.yml` - Create

**Changes:**
- Create workflow mirroring `build-and-push.yml` structure:
  - Trigger on push to `main` with paths: `app/**`, `.github/workflows/build-and-push-frontend.yml`
  - Job: `build-and-push-frontend`
  - Steps:
    1. Checkout code
    2. Set up Docker Buildx
    3. Login to GHCR with `GITHUB_TOKEN`
    4. Build and push with tags: `frontend:latest`, `frontend:${{ github.sha }}`
    5. Use build cache for faster builds
  - Context: `./app` (not root)
  - Image name: `ghcr.io/${{ github.repository }}/frontend`

**Acceptance Criteria:**
- [ ] Workflow syntax valid (commit will trigger workflow check)
- [ ] Path triggers only on `app/**` changes (not API changes)
- [ ] Uses same permissions as API workflow (`contents: read`, `packages: write`)
- [ ] Build cache configuration matches API pattern

---

### Commit 4: Update docker-compose.prod.yml to add frontend service
**Type:** feat
**Scope:** docker
**Files:**
- `docker-compose.prod.yml` - Modify

**Changes:**
- Add `frontend` service after `api`:
  - Image: `ghcr.io/joeczar/vacay-photo-map/frontend:latest`
  - Container name: `vacay-frontend`
  - Restart: `unless-stopped`
  - Networks: `proxy` only (no database access needed)
  - No volumes needed (static files in image)
  - No env_file needed (build-time environment variables baked into build)
- Update `watchtower` service:
  - Change command from `--interval 300 vacay-api` to `--interval 300 vacay-api vacay-frontend`
  - This makes Watchtower monitor both containers

**Example Structure:**
```yaml
  frontend:
    image: ghcr.io/joeczar/vacay-photo-map/frontend:latest
    container_name: vacay-frontend
    restart: unless-stopped
    networks:
      - proxy

  watchtower:
    # ... existing config ...
    command: --interval 300 vacay-api vacay-frontend
```

**Acceptance Criteria:**
- [ ] Compose file syntax valid: `docker compose -f docker-compose.prod.yml config`
- [ ] Frontend service defined correctly
- [ ] Watchtower monitors both services
- [ ] No unnecessary volumes or environment files

---

### Commit 5: Update deployment documentation
**Type:** docs
**Scope:** docs
**Files:**
- `docs/DEPLOYMENT.md` - Modify

**Changes:**
- Update "Architecture" diagram to include frontend flow
- Add frontend to "How Deployments Work" section:
  - Frontend changes trigger separate workflow
  - Frontend and API deploy independently
  - Both monitored by same Watchtower instance
- Update "Manual Deployment" section with frontend commands:
  ```bash
  # Pull latest frontend
  docker compose -f docker-compose.prod.yml pull frontend
  # Restart frontend
  docker compose -f docker-compose.prod.yml up -d frontend
  ```
- Update "Rollback" section with frontend rollback instructions
- Add note about reverse proxy configuration (Cloudflare Tunnel should route to `vacay-frontend:80`)
- Update "Monitoring" section with frontend health check: `http://localhost:80/`

**Acceptance Criteria:**
- [ ] Documentation accurately reflects new frontend deployment flow
- [ ] Manual deployment commands tested
- [ ] Rollback procedure includes frontend
- [ ] No broken links or formatting issues

---

## Testing Strategy

### Commit 1-2 (Local Docker Build)
- Build image locally
- Run container, verify nginx serves files
- Check image size
- Test SPA routing with curl

### Commit 3 (GitHub Actions)
- Workflow triggers on test push
- Image appears in GHCR
- Build cache works on second run

### Commit 4 (Docker Compose)
- Pull image from GHCR
- Start all services with compose
- Verify frontend container running
- Verify Watchtower monitoring both containers

### Commit 5 (Documentation)
- Follow manual deployment steps
- Verify all commands work
- Check all links render correctly

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Frontend image builds in GitHub Actions
- [ ] Image pushed to GHCR successfully
- [ ] Watchtower pulls and restarts frontend on new image
- [ ] Frontend accessible via reverse proxy
- [ ] SPA routing works (direct navigation to `/trips` doesn't 404)
- [ ] Static assets served with correct headers
- [ ] Manual deployment commands work
- [ ] Documentation complete and accurate

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Build time too long in CI | Use Docker build cache (already in workflow), cache restored from GHCR |
| Image size too large | Multi-stage build discards node_modules, only ships nginx + static files (~25MB) |
| Environment variables not available at runtime | Build-time env vars (VITE_*) baked into build, no runtime env needed |
| Watchtower pulls both images simultaneously | Watchtower handles this gracefully, restarts containers independently |
| Reverse proxy not configured for frontend | Document in DEPLOYMENT.md, requires manual Cloudflare Tunnel update |
| SPA routing breaks (404s on refresh) | nginx.conf handles with `try_files $uri $uri/ /index.html` |

## Open Questions

### Reverse Proxy Configuration
**Question:** Does the Cloudflare Tunnel currently route to a specific container, or does it route to the host?

**Context:** The reverse proxy needs to route HTTP requests to `vacay-frontend:80` (container) instead of a static file directory. If the tunnel is currently configured for static files, it will need to be updated.

**Recommendation:** If uncertain, document the change needed in DEPLOYMENT.md and test on the server after deployment. Typical Cloudflare Tunnel config routes to `http://vacay-frontend:80` via the `proxy` network.

### Build-time Environment Variables
**Question:** Are there any Vite environment variables (VITE_*) that need to be passed during the Docker build?

**Context:** The current setup uses `app/.env` for local dev (VITE_API_URL, etc.). For production builds in CI, these need to be passed as `--build-arg` in the GitHub Actions workflow.

**Current approach:** Assuming defaults in `vite.config.ts` are sufficient, or that production values are hardcoded. If not, add `--build-arg VITE_API_URL=https://api.your-domain.com` to the Docker build step in the workflow.

**Verification needed:** Check if `app/.env` has production values that need to be baked into the build.

---

## Implementation Notes

### Why Option 2 (Containerized) Over Option 1 (rsync)
1. **Consistency:** Matches API deployment pattern
2. **No SSH secrets:** Uses existing GITHUB_TOKEN
3. **Atomic deploys:** Container restarts are atomic, no partial file copies
4. **Rollback:** Can rollback to specific image SHA
5. **Watchtower integration:** No additional deployment tooling needed

### Dockerfile Best Practices
- Multi-stage build to minimize runtime image size
- Alpine base images for smaller footprint
- Frozen lockfile for reproducible builds
- Healthcheck for container orchestration
- Non-root user where possible (nginx runs as nginx user by default)

### GitHub Actions Optimization
- Path-based triggers prevent unnecessary builds
- Build cache reduces build time from ~3 min to ~30 sec on cache hit
- Tagging with both `:latest` and `:${{ github.sha }}` enables rollback
- Same permissions model as API workflow
