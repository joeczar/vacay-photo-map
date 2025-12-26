# Monitoring Guide

Complete guide for setting up two-layer monitoring with UptimeRobot (external) and Uptime Kuma (self-hosted).

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [UptimeRobot Setup (Required)](#uptimerobot-setup-required)
- [Uptime Kuma Setup (Optional)](#uptime-kuma-setup-optional)
- [Health Endpoints Reference](#health-endpoints-reference)
- [Monitoring Best Practices](#monitoring-best-practices)
- [Testing & Verification](#testing--verification)
- [Troubleshooting](#troubleshooting)

## Overview

This application uses a two-layer monitoring strategy to ensure maximum uptime visibility and rapid incident response.

### Why Two Layers?

1. **External Monitoring (UptimeRobot)**: Monitors your application from outside your infrastructure. Continues to alert even if your entire server goes down.

2. **Self-Hosted Monitoring (Uptime Kuma)**: Runs on your server, monitors internal services, provides detailed status pages. More comprehensive but goes dark if server fails.

**Required**: UptimeRobot (external)
**Optional**: Uptime Kuma (self-hosted, for detailed internal monitoring)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     External Monitoring                     │
│                                                             │
│  ┌───────────────┐         HTTPS          ┌──────────────┐ │
│  │ UptimeRobot   │────────────────────────▶│  Frontend    │ │
│  │ (Cloud)       │                         │  photos.*    │ │
│  │               │         HTTPS           │              │ │
│  │ • 5min checks │────────────────────────▶│  API Health  │ │
│  │ • Email/SMS   │                         │  /api/health │ │
│  │ • Free tier   │                         └──────────────┘ │
│  └───────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ Alerts on failure
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                     Your Server                             │
│                             │                               │
│  ┌───────────────┐          │          ┌──────────────┐     │
│  │ Uptime Kuma   │──────────┴─────────▶│  API Service │     │
│  │ (Docker)      │      Internal       │  :3000       │     │
│  │               │      Monitors       │              │     │
│  │ • 1min checks │─────────────────────▶│  PostgreSQL  │     │
│  │ • TCP/HTTP    │      TCP :5432      │  :5432       │     │
│  │ • Status page │                     └──────────────┘     │
│  └───────────────┘                                          │
│        │                                                    │
│        └──────▶ Public Status Page (status.joeczar.com)    │
└─────────────────────────────────────────────────────────────┘
```

**Monitoring Flow:**
1. UptimeRobot checks public endpoints every 5 minutes
2. Uptime Kuma checks internal services every 1 minute
3. Both send alerts on failure (email, Discord, etc.)
4. UptimeRobot catches catastrophic failures (server down)
5. Uptime Kuma catches service-specific issues (DB down, API slow)

## UptimeRobot Setup (Required)

UptimeRobot provides external monitoring and continues to work even if your entire server goes offline.

### 1. Create Account

1. Visit [uptimerobot.com](https://uptimerobot.com)
2. Sign up for free account (50 monitors, 5-minute intervals)
3. Verify email address

### 2. Add Monitors

Create three monitors to cover all critical endpoints:

#### Monitor 1: Frontend Availability
- **Monitor Type**: HTTP(s)
- **Friendly Name**: VacayPhotoMap Frontend
- **URL**: `https://photos.joeczar.com`
- **Monitoring Interval**: 5 minutes
- **Alert Contacts**: (your email)

#### Monitor 2: API Health (Liveness)
- **Monitor Type**: HTTP(s)
- **Friendly Name**: VacayPhotoMap API Liveness
- **URL**: `https://photos.joeczar.com/api/health`
- **Monitoring Interval**: 5 minutes
- **Keyword Alert**: Look for `"status":"ok"` (optional but recommended)
- **Alert Contacts**: (your email)

#### Monitor 3: API Readiness (With DB Check)
- **Monitor Type**: HTTP(s)
- **Friendly Name**: VacayPhotoMap API Readiness
- **URL**: `https://photos.joeczar.com/api/health/ready`
- **Monitoring Interval**: 5 minutes
- **Keyword Alert**: Look for `"database":"connected"`
- **Alert Contacts**: (your email)

### 3. Configure Notifications

Set up multiple notification channels to ensure you're alerted promptly:

#### Email Notifications (Default)
- Already enabled with your account email
- Add additional emails in Settings > Alert Contacts

#### Discord Webhook (Recommended)
1. In your Discord server: Server Settings > Integrations > Webhooks
2. Create webhook, copy URL
3. UptimeRobot: Alert Contacts > Add > Webhook
4. Paste Discord webhook URL
5. Select "Send notification as JSON"
6. Template:
```json
{
  "content": "*monitorFriendlyName* is *monitorAlertType*\n*monitorURL*"
}
```

#### Mobile App (Optional)
1. Install UptimeRobot mobile app (iOS/Android)
2. Sign in with your account
3. Enable push notifications in app settings

### 4. Advanced Settings

For each monitor, configure:

- **Alert Threshold**: Alert after 2 consecutive failures
- **Retry Interval**: 1 minute (retry after initial failure)
- **Alert Delay**: 0 minutes (alert immediately after threshold)
- **Ignore SSL Errors**: Disabled (catch certificate issues)

### 5. Verify Setup

1. Dashboard should show all 3 monitors as "Up"
2. Test alert: In monitor settings, click "Test" button
3. Verify you receive email/Discord notification

## Uptime Kuma Setup (Optional)

Self-hosted monitoring with detailed status pages and internal service checks.

### 1. Deploy Uptime Kuma

Uptime Kuma is already configured in `docker-compose.prod.yml`:

```bash
cd /path/to/vacay-photo-map

# Start Uptime Kuma service
docker compose -f docker-compose.prod.yml up -d uptime-kuma

# Verify it's running
docker ps | grep uptime-kuma
docker logs uptime-kuma
```

Service runs on internal port `3001` (not exposed publicly by default).

### 2. Configure Cloudflare Tunnel (Public Access)

To access Uptime Kuma publicly as `status.joeczar.com`:

#### Option A: Via Cloudflare Dashboard
1. Go to Cloudflare Zero Trust > Access > Tunnels
2. Select your existing tunnel (or create new)
3. Add Public Hostname:
   - **Subdomain**: `status`
   - **Domain**: `joeczar.com`
   - **Service**: `http://uptime-kuma:3001`

#### Option B: Via cloudflared CLI
```bash
# Edit tunnel config
vim ~/.cloudflared/config.yml

# Add ingress rule BEFORE the catch-all:
ingress:
  - hostname: status.joeczar.com
    service: http://uptime-kuma:3001
  - hostname: photos.joeczar.com  # existing
    service: http://localhost:5173
  # ... other rules ...
  - service: http_status:404  # catch-all

# Restart tunnel
cloudflared tunnel restart
```

### 3. Initial Setup

1. Visit `https://status.joeczar.com` (or `http://localhost:3001` locally)
2. Create admin account:
   - **Username**: admin (or your preference)
   - **Password**: Use strong password (store in password manager)
3. Log in to dashboard

### 4. Add Monitors

Create monitors for internal services:

#### Monitor 1: API Health (Internal)
- **Monitor Type**: HTTP(s)
- **Friendly Name**: API Health
- **URL**: `http://vacay-api:3000/health`
- **Heartbeat Interval**: 60 seconds
- **Retries**: 3
- **Expected Status Code**: 200
- **Keyword**: `"status":"ok"`

#### Monitor 2: API Readiness (Internal)
- **Monitor Type**: HTTP(s)
- **Friendly Name**: API Ready (DB Check)
- **URL**: `http://vacay-api:3000/health/ready`
- **Heartbeat Interval**: 60 seconds
- **Retries**: 3
- **Expected Status Code**: 200
- **Keyword**: `"database":"connected"`

#### Monitor 3: PostgreSQL (TCP)
- **Monitor Type**: TCP Port
- **Friendly Name**: PostgreSQL Database
- **Hostname**: `postgres`
- **Port**: `5432`
- **Heartbeat Interval**: 60 seconds
- **Retries**: 3

### 5. Configure Notifications

#### Email (SMTP)
Settings > Notifications > Add:
- **Notification Type**: Email (SMTP)
- **SMTP Host**: (your email provider)
- **From Email**: noreply@joeczar.com
- **To Email**: your-email@example.com

#### Discord Webhook
Settings > Notifications > Add:
- **Notification Type**: Discord
- **Webhook URL**: (your Discord webhook)
- **Username**: Uptime Kuma

Apply notification to all monitors.

### 6. Create Public Status Page

1. Settings > Status Pages > Add Status Page
2. Configure:
   - **Title**: VacayPhotoMap Status
   - **Slug**: `status` (accessible at status.joeczar.com/status)
   - **Theme**: Auto (respects dark mode)
   - **Show Tags**: Yes
3. Add monitors to status page (drag to reorder)
4. Save and publish

Public status page now accessible at: `https://status.joeczar.com/status`

### 7. Maintenance Mode

To prevent false alerts during planned maintenance:

1. Settings > Maintenance
2. Add Maintenance Window:
   - **Title**: Planned Deployment
   - **Start Time**: (deployment start)
   - **Duration**: 30 minutes (adjust as needed)
   - **Affected Monitors**: Select all
3. Save

Monitors will show "Under Maintenance" instead of "Down" during window.

## Health Endpoints Reference

The API exposes two health check endpoints with different purposes:

### `/health` - Liveness Probe

**Purpose**: Checks if the API process is running.

**When to Use**: Container orchestration (Docker, Kubernetes) liveness checks.

**Success Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Failure**: No response (process crashed, container stopped).

**Monitoring Use**: Basic uptime checks, alerts on total API failure.

### `/health/ready` - Readiness Probe

**Purpose**: Checks if API can serve traffic (including database connectivity).

**When to Use**: Load balancer readiness checks, detailed monitoring.

**Success Response** (200 OK):
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Partial Failure** (503 Service Unavailable):
```json
{
  "status": "degraded",
  "database": "disconnected",
  "error": "Database connection failed",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Monitoring Use**: Catch database issues before users notice, trigger recovery procedures.

### Response Validation

Configure monitors to check:
- **Status Code**: 200 for healthy, 503 for degraded
- **Keyword**: `"status":"ok"` or `"database":"connected"`
- **Response Time**: Alert if > 5000ms (performance degradation)

## Monitoring Best Practices

### 1. Avoid Alert Fatigue

**Problem**: Too many false positives cause alert burnout.

**Solutions**:
- **Retry Before Alert**: Configure 2-3 retries (UptimeRobot: 2x5min = 10min down before alert)
- **Maintenance Windows**: Use maintenance mode during deployments
- **Reasonable Thresholds**: Don't alert on <1min outages (transient issues)
- **Keyword Validation**: Check response body, not just status code

### 2. Layered Alerting

**Critical Alerts** (immediate response):
- Frontend down (UptimeRobot)
- API /health down (UptimeRobot)
- Database down (Uptime Kuma)

**Warning Alerts** (investigate when available):
- Slow response times (>2s)
- SSL certificate expiring (<30 days)
- Disk space low

Configure different notification channels:
- **Critical**: SMS, phone call, Discord ping
- **Warning**: Email, Discord channel (no ping)

### 3. Maintenance Windows

**Before Deployment**:
```bash
# 1. Enable maintenance mode in Uptime Kuma
# (via UI: Settings > Maintenance > Add)

# 2. Or pause UptimeRobot monitors
# (via UI: Select monitors > Actions > Pause)

# 3. Deploy (rolling update - only recreates changed services)
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 4. Verify health
curl https://photos.joeczar.com/api/health

# 5. Re-enable monitors
```

### 4. Regular Testing

**Monthly**: Test alert delivery by intentionally stopping service:
```bash
docker stop vacay-api
# Wait for alert
docker start vacay-api
```

**Quarterly**: Review monitor configurations, update thresholds based on actual uptime patterns.

### 5. Status Page Transparency

Make status page public: `status.joeczar.com/status`

**Benefits**:
- Users check status before reporting issues
- Reduces support burden during known outages
- Builds trust through transparency

## Testing & Verification

### Test Alert Delivery

#### Test 1: API Failure
```bash
# Stop API container
docker stop vacay-api

# Expected results:
# - UptimeRobot: Alert within 5-10 minutes (after retries)
# - Uptime Kuma: Alert within 1-2 minutes
# - Both: Email/Discord notification received

# Restore service
docker start vacay-api

# Expected results:
# - Both monitors: "Up" notification received
```

#### Test 2: Database Failure
```bash
# Stop database container
docker stop vacay-postgres

# Expected results:
# - UptimeRobot /health/ready: Alert within 5-10 minutes (503 error)
# - Uptime Kuma PostgreSQL TCP: Alert within 1-2 minutes
# - API /health: Still responds (200) - liveness not affected

# Restore service
docker start vacay-postgres
```

#### Test 3: Complete Server Failure
```bash
# Simulate server crash (if you have test environment)
sudo systemctl stop docker

# Expected results:
# - UptimeRobot: All monitors down, alerts sent
# - Uptime Kuma: Silent (running on same server)
# - Status page: Inaccessible

# Restore
sudo systemctl start docker
docker compose -f docker-compose.prod.yml up -d
```

### Failure Scenarios Reference

| Scenario | UptimeRobot | Uptime Kuma | Recovery Action |
|----------|-------------|-------------|-----------------|
| **API container stopped** | Frontend OK, API Health DOWN | API monitors DOWN, DB OK | `docker start vacay-api` |
| **Database stopped** | Frontend OK, /health OK, /ready DOWN | DB TCP DOWN, API OK | `docker start vacay-postgres` |
| **Network issue** | All monitors DOWN | All monitors DOWN (if internet) | Check network/firewall |
| **Server crash** | All monitors DOWN | Silent (offline) | Restart server, check logs |
| **SSL cert expired** | SSL error alerts | Access error (if HTTPS) | Renew certificate |
| **Slow responses** | Timeout alerts | Ping spike alerts | Check API logs, resource usage |
| **Disk full** | May cause app crashes | Monitor app data issues | Clean up disk space |

### Verify Monitor Configuration

**UptimeRobot Checklist**:
- [ ] All 3 monitors created (Frontend, /health, /ready)
- [ ] 5-minute interval configured
- [ ] Email notifications enabled
- [ ] Discord webhook configured (if applicable)
- [ ] Test alert received successfully

**Uptime Kuma Checklist**:
- [ ] Container running (`docker ps`)
- [ ] Accessible via `status.joeczar.com`
- [ ] Internal monitors created (API, DB)
- [ ] Notifications configured
- [ ] Status page published
- [ ] Test alert received successfully

## Troubleshooting

### False Positives

**Symptom**: Monitor reports "Down" but service is accessible.

**Possible Causes**:
1. **Temporary network blip**: Check if single failure or pattern
2. **Monitor timeout too aggressive**: Increase timeout (UptimeRobot default: 30s)
3. **Rate limiting**: If checking too frequently from same IP
4. **Cloudflare challenge**: If using "I'm Under Attack" mode

**Solutions**:
- Increase retry count before alerting
- Check monitor response time trends (should be <1s normally)
- Verify service actually responded during alert time (check API logs)

### Alerts Not Received

**Symptom**: Service is down but no alert sent.

**Check**:
1. **UptimeRobot**:
   - Settings > Alert Contacts: Verify email/webhook configured
   - Monitor settings: "Alert When" = "Down" selected
   - Check spam folder for emails
2. **Uptime Kuma**:
   - Settings > Notifications: Test notification (Send Test button)
   - Monitor edit: Verify notification applied to monitor
   - Check Docker logs: `docker logs uptime-kuma`

### Uptime Kuma Not Accessible

**Symptom**: `status.joeczar.com` returns 502 or timeout.

**Debug Steps**:
```bash
# 1. Check if container running
docker ps | grep uptime-kuma

# 2. Check container logs
docker logs uptime-kuma --tail 50

# 3. Check if port responding locally
curl http://localhost:3001

# 4. Check Cloudflare Tunnel status
cloudflared tunnel info

# 5. Verify tunnel routing
cloudflared tunnel route dns show
```

**Common Fixes**:
- Restart container: `docker restart uptime-kuma`
- Restart Cloudflare tunnel: `cloudflared tunnel restart`
- Check firewall rules (should allow tunnel traffic)

### Database Connection Errors

**Symptom**: `/health/ready` returns 503 even though database is running.

**Check**:
```bash
# 1. Verify database is running
docker ps | grep postgres

# 2. Test database connection manually
docker exec -it vacay-postgres psql -U vacay -d vacay -c "SELECT 1;"

# 3. Check API logs for connection errors
docker logs vacay-api --tail 50 | grep -i "database\|postgres"

# 4. Verify DATABASE_URL environment variable
docker exec vacay-api env | grep DATABASE_URL
```

**Common Fixes**:
- Restart API to reset connection pool: `docker restart vacay-api`
- Check database credentials in `.env.production`
- Verify network connectivity: `docker network inspect proxy` (for API/frontend) or `docker network inspect vacay-photo-map_internal` (for database)

### High Response Times

**Symptom**: Monitors report slow responses (>2s).

**Investigate**:
```bash
# 1. Check API performance locally
time curl https://photos.joeczar.com/api/health

# 2. Check container resource usage
docker stats vacay-api postgres

# 3. Check database query performance (requires pg_stat_statements extension)
# Note: This extension is not enabled by default. To enable:
#   docker exec -it vacay-postgres psql -U vacay -d vacay -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
docker exec -it vacay-postgres psql -U vacay -d vacay \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# 4. Check disk I/O
iostat -x 1 5
```

**Common Fixes**:
- Add database indexes for slow queries
- Increase container CPU/memory limits
- Check for disk space issues: `df -h`
- Restart services during low-traffic period

### SSL Certificate Issues

**Symptom**: Monitor reports SSL errors.

**Check**:
```bash
# 1. Check certificate expiration
echo | openssl s_client -servername photos.joeczar.com -connect photos.joeczar.com:443 2>/dev/null | openssl x509 -noout -dates

# 2. Verify certificate chain
curl -vI https://photos.joeczar.com 2>&1 | grep "SSL certificate"
```

**Solutions**:
- Cloudflare manages certificates automatically (if proxied)
- If using custom cert: Renew via Let's Encrypt
- Check Cloudflare SSL/TLS settings: Full (strict) mode

---

## Next Steps

After setup:
1. **Week 1**: Monitor alerts, adjust thresholds if too sensitive
2. **Week 2**: Test recovery procedures during low-traffic period
3. **Month 1**: Review uptime reports, identify patterns
4. **Ongoing**: Keep monitoring tools updated, review quarterly

**Related Documentation**:
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment steps
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues and fixes

**Support**:
- UptimeRobot Docs: https://uptimerobot.com/help/
- Uptime Kuma GitHub: https://github.com/louislam/uptime-kuma
- Project Issues: https://github.com/joeczar/vacay-photo-map/issues
