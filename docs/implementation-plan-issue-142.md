# Implementation Plan: Uptime Monitoring Setup

**Issue:** #142
**Branch:** `feature/issue-142-uptime-monitoring`
**Complexity:** Simple
**Total Commits:** 2

## Overview

Set up two-layer monitoring for production deployment: external monitoring (UptimeRobot) to detect server outages, and optional self-hosted dashboard (Uptime Kuma) for detailed internal metrics.

**What's Already Done:**
- Health endpoints fully implemented (`/health` and `/health/ready`)
- Database readiness check with proper 503 responses
- Docker HEALTHCHECK configured in Dockerfile
- Comprehensive test coverage for health endpoints

**What Needs to Be Done:**
1. Add Uptime Kuma service to docker-compose.prod.yml (optional self-hosted layer)
2. Create documentation for UptimeRobot setup (required external monitoring)

## Prerequisites

- [ ] Production deployment running at photos.joeczar.com
- [ ] Cloudflare Tunnel configured for routing
- [ ] Access to UptimeRobot account (free tier)

## Architecture

### Current Health Endpoints

**GET /health** - Basic liveness check
```json
{
  "status": "ok",
  "timestamp": "2025-12-23T14:00:00Z",
  "version": "1.0.0"
}
```

**GET /health/ready** - Readiness check with DB validation
```json
{
  "status": "ok", // or "degraded"
  "checks": {
    "api": true,
    "database": true // false if DB unreachable
  }
}
```
Returns 503 if database is unreachable.

### Two-Layer Monitoring Strategy

| Layer | Purpose | Survives Server Outage? |
|-------|---------|------------------------|
| **External** (UptimeRobot) | Detect complete outages | ✅ Yes - alerts you |
| **Self-hosted** (Uptime Kuma) | Internal metrics, status page | ❌ No - also goes down |

**Why Both?**
- External monitoring is **critical** - if Surface Book crashes, only external service can alert you
- Self-hosted provides **visibility** - nice dashboard, internal service monitoring, public status page

### Monitoring Flow

```
UptimeRobot (external) → https://photos.joeczar.com/api/health
                       → https://photos.joeczar.com/api/health/ready
                       → Email/Discord/Push notification on failure

Uptime Kuma (internal) → http://vacay-api:3000/health
                       → postgres:5432 (direct DB check)
                       → Container health status
                       → Public status page at status.joeczar.com
```

## Atomic Commits

### Commit 1: Add Uptime Kuma service to production compose

**Type:** feat
**Scope:** ops
**Files:**
- `docker-compose.prod.yml` - Modify

**Changes:**
- Add `uptime-kuma` service with louislam/uptime-kuma:1 image
- Configure volume for persistent data (uptime-kuma-data)
- Connect to `proxy` network for Cloudflare Tunnel access
- Set restart policy to `unless-stopped`
- Add volume definition to volumes section

**Acceptance Criteria:**
- [ ] Uptime Kuma service defined with correct image
- [ ] Volume configured for data persistence
- [ ] Connected to proxy network for tunnel routing
- [ ] Service starts successfully: `docker compose -f docker-compose.prod.yml up -d uptime-kuma`
- [ ] Accessible via Cloudflare Tunnel on configured subdomain

**Deployment Note:**
After applying changes, configure Cloudflare Tunnel to route `status.joeczar.com` to `uptime-kuma:3001`.

---

### Commit 2: Add monitoring setup documentation

**Type:** docs
**Scope:** ops
**Files:**
- `docs/MONITORING.md` - Create

**Changes:**
- Document UptimeRobot setup (external monitoring)
  - Account creation steps
  - Monitor configuration for frontend, /api/health, /api/health/ready
  - Notification channel setup (email, Discord webhook, mobile app)
  - Testing alert notifications
- Document Uptime Kuma setup (self-hosted dashboard)
  - Initial login and admin account creation
  - Internal monitor configuration (API, postgres, containers)
  - Public status page creation
  - Cloudflare Tunnel routing configuration
- Document monitoring best practices
  - Alert fatigue prevention
  - Escalation policies
  - Maintenance window handling
- Add health endpoint reference
  - Existing /health and /health/ready endpoints
  - Expected responses and status codes
  - Docker HEALTHCHECK configuration

**Acceptance Criteria:**
- [ ] UptimeRobot setup fully documented with screenshots/examples
- [ ] Uptime Kuma configuration steps clear and actionable
- [ ] Alert notification testing procedures included
- [ ] Health endpoint behavior documented
- [ ] Cloudflare Tunnel routing instructions included

---

## Testing Strategy

### Manual Testing After Commit 1

1. **Deploy Uptime Kuma:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d uptime-kuma
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs uptime-kuma
   ```

2. **Verify service accessibility:**
   - Configure Cloudflare Tunnel route for status.joeczar.com → uptime-kuma:3001
   - Access https://status.joeczar.com
   - Complete initial setup (create admin account)

3. **Test health endpoints still work:**
   ```bash
   curl https://photos.joeczar.com/api/health
   curl https://photos.joeczar.com/api/health/ready
   ```

### External Monitoring Setup (Manual - After Commit 2)

Following documentation in `docs/MONITORING.md`:

1. **UptimeRobot Configuration:**
   - Create 3 monitors (frontend, /health, /health/ready)
   - Set check interval to 5 minutes (free tier)
   - Configure notification contacts (email + mobile app)
   - Test alert by stopping API container: `docker stop vacay-api`
   - Verify notification received within 5 minutes
   - Restart API: `docker start vacay-api`

2. **Uptime Kuma Configuration:**
   - Add HTTP monitor for https://photos.joeczar.com/api/health
   - Add HTTP monitor for https://photos.joeczar.com/api/health/ready
   - Add Docker container monitor for vacay-api
   - Add Docker container monitor for vacay-postgres
   - Create public status page
   - Test all monitors show "Up" status

### Failure Scenario Testing

Test each failure mode and verify alerting:

| Scenario | Expected Alert | Recovery |
|----------|---------------|----------|
| API container down | UptimeRobot alerts within 5 min | `docker start vacay-api` |
| Database unreachable | /health/ready returns 503 | Check postgres container |
| Full server down | UptimeRobot alerts (Kuma silent) | Restart server |
| Network issues | Both layers may alert | Check Cloudflare Tunnel |

## Verification Checklist

Before PR creation:
- [ ] Uptime Kuma service deployed and accessible
- [ ] UptimeRobot configured with 3 monitors
- [ ] Email notifications configured and tested
- [ ] Mobile app installed and receiving push notifications
- [ ] Uptime Kuma dashboard shows all services "Up"
- [ ] Public status page accessible at status.joeczar.com
- [ ] Documentation complete and accurate
- [ ] Alert notifications tested by stopping services

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Alert fatigue from false positives | Start with conservative thresholds (3 retries, 5-min intervals), tune based on experience |
| Uptime Kuma resource usage | Runs as lightweight container, monitors <10 services, minimal overhead |
| Missing alerts during maintenance | Document maintenance window procedure in MONITORING.md |
| Cloudflare Tunnel routing issues | Test tunnel config with curl before assuming service is down |

## Open Questions

None - health endpoints already exist and work correctly. This is purely ops/infrastructure setup.

## Post-Implementation Tasks (Not in PR)

**Manual steps after merge (documented in MONITORING.md):**

1. **UptimeRobot Setup:**
   - Create free account at uptimerobot.com
   - Add monitors using documented endpoints
   - Configure notification contacts
   - Install UptimeRobot mobile app
   - Test alerts by stopping API container

2. **Uptime Kuma Setup:**
   - Deploy service via docker compose
   - Configure Cloudflare Tunnel route: status.joeczar.com → uptime-kuma:3001
   - Create admin account (first login)
   - Add internal monitors (API, postgres, containers)
   - Create public status page
   - Share status page URL with team/users (optional)

3. **Ongoing Maintenance:**
   - Review alert history weekly
   - Adjust thresholds if false positives occur
   - Add new monitors as services are added
   - Update documentation with lessons learned

## Additional Context

**Why not Caddy/nginx reverse proxy?**
Production uses Cloudflare Tunnel for routing, which handles TLS termination and routing externally. Services expose ports directly to the tunnel connector.

**Why Uptime Kuma instead of alternatives?**
- Self-hosted (no data leaves infrastructure)
- Beautiful UI (better than Gatus/Healthchecks)
- Docker-native (monitors containers directly)
- Active development (regular updates)
- Public status page feature (shareable with users)

**Free tier limits:**
- UptimeRobot: 50 monitors, 5-min intervals, unlimited notifications
- Uptime Kuma: Self-hosted, unlimited everything (resource-limited only)
