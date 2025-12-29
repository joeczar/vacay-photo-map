# Hosting Options Report: Self-Hosted vs Managed Services

**Date:** December 2025
**Status:** Research Complete

## Executive Summary

This report analyzes the current self-hosted architecture for vacay-photo-map and evaluates when and why to consider hosted alternatives. The current setup works well for personal/small-scale use, but has clear scaling and reliability limitations.

**Current Cost:** ~$0/month (excluding electricity/internet)
**Recommended Entry Point for Managed:** ~$30-50/month for basic hosting

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CURRENT DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   CLOUDFLARE EDGE                    SELF-HOSTED (Surface Book 2)       │
│   ┌──────────────────┐               ┌────────────────────────────┐     │
│   │ Cloudflare R2    │               │ Docker Compose             │     │
│   │ (Image Storage)  │               │ ├─ PostgreSQL 15           │     │
│   │                  │               │ ├─ Bun/Hono API            │     │
│   │ Image Worker     │◄──────────────┤ ├─ Watchtower              │     │
│   │ (Transformations)│               │ └─ Uptime Kuma             │     │
│   └──────────────────┘               └────────────────────────────┘     │
│                                                   ▲                      │
│   VERCEL                                          │                      │
│   ┌──────────────────┐               ┌────────────┴───────────────┐     │
│   │ Frontend (Vue)   │───────────────│ Cloudflare Tunnel          │     │
│   │ photos.joeczar   │               │ (Public Access)            │     │
│   └──────────────────┘               └────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components Breakdown

| Component | Current | Technology | Status |
|-----------|---------|------------|--------|
| **Frontend** | Vercel | Vue/Vite | ✅ Already managed |
| **Images** | Cloudflare | R2 + Workers | ✅ Already managed |
| **API** | Self-hosted | Bun + Hono | 🔶 Self-managed |
| **Database** | Self-hosted | PostgreSQL 15 | 🔶 Self-managed |
| **Monitoring** | Self-hosted | Uptime Kuma | 🔶 Self-managed |

---

## Self-Hosted Constraints

### 1. Reliability & Availability

| Constraint | Impact | Severity |
|------------|--------|----------|
| **Single point of failure** | Laptop failure = complete outage | 🔴 High |
| **No automatic failover** | Manual intervention required | 🔴 High |
| **Home internet dependency** | ISP outages affect availability | 🟡 Medium |
| **Power outages** | No UPS mentioned = downtime | 🟡 Medium |

**Estimated uptime:** ~99% (roughly 3.5 days downtime/year)
**Managed service typical uptime:** 99.9%+ (under 9 hours downtime/year)

### 2. Scalability

| Constraint | Current Limit | Workaround |
|------------|---------------|------------|
| **CPU** | Laptop CPU (shared with dev) | None without new hardware |
| **Memory** | Laptop RAM (shared) | None without new hardware |
| **Concurrent connections** | ~100-500 depending on query complexity | Connection pooling (already configured) |
| **Storage** | Laptop SSD + external | Add drives, but single-node |

### 3. Operational Burden

| Task | Frequency | Time/Effort |
|------|-----------|-------------|
| OS updates | Monthly | 30 min |
| Docker updates | Monthly | 15 min |
| Database backups | Should be daily | Setup + verify |
| Disk monitoring | Ongoing | Automated alerts needed |
| Security patches | As needed | Variable |
| SSL/Tunnel issues | Occasional | Debugging time |

### 4. Data Safety

| Risk | Current Mitigation | Gap |
|------|-------------------|-----|
| **Disk failure** | None visible | No backups configured |
| **Accidental deletion** | None | No point-in-time recovery |
| **Ransomware/corruption** | None | No off-site backups |

**Recommendation:** At minimum, add automated backups to R2 or another cloud storage.

---

## When to Consider Managed Hosting

### Trigger Points

| Trigger | Description | Urgency |
|---------|-------------|---------|
| **User growth** | More than ~10-20 concurrent users | 🟡 Plan ahead |
| **Revenue generation** | App generates income | 🔴 Immediate |
| **Sleep quality** | Worrying about uptime | 🟡 Quality of life |
| **Travel/absence** | Can't monitor for extended periods | 🟡 Medium |
| **Reliability needs** | Users depend on the app | 🔴 High |
| **Compliance** | GDPR, data protection needs | 🔴 High |

### Cost-Benefit Analysis

**Current self-hosted cost:** ~$0/month (excluding electricity)
**Break-even question:** Is your time worth more than ~$30-50/month?

---

## Hosted Database Options

### Comparison Matrix

| Provider | Entry Price | Free Tier | Best For |
|----------|-------------|-----------|----------|
| **Neon** | $19/mo | 1 DB, 24/7 | Serverless, scale-to-zero, branching |
| **Supabase** | $25/mo | Limited (pauses) | Full platform (auth, realtime, storage) |
| **Railway** | ~$15/mo | $5 credit | Simplicity, fast deploys |
| **Render** | $7/mo | 30-day free DB | Budget-conscious, simple UI |
| **Fly.io Managed** | $38/mo | None | Global distribution, HA |
| **Fly.io Unmanaged** | ~$2/mo | None | Budget, self-manage |
| **DigitalOcean** | $15/mo | None | Reliable, good support |
| **Cloudflare D1** | Usage-based | Yes | SQLite-based, read-heavy apps |

### Detailed Recommendations

#### Option A: Neon (Recommended for Development)
**Price:** Free → $19/mo (Launch)

**Pros:**
- Scale-to-zero (pay nothing when idle)
- Database branching (perfect for testing)
- PostgreSQL-native
- Generous free tier for development

**Cons:**
- Compute-hours billing can be unpredictable
- Acquired by Databricks (May 2025) - future pricing uncertain

**Best for:** Variable workloads, development environments

#### Option B: Supabase (Recommended for Features)
**Price:** Free → $25/mo (Pro)

**Pros:**
- Full platform (auth, realtime, storage, edge functions)
- Could replace your current WebAuthn implementation
- Built-in Row Level Security (you already use RLS!)
- Dashboard for DB management

**Cons:**
- Higher price point
- Vendor lock-in risk
- Free tier pauses after inactivity

**Migration note:** You previously used Supabase (mentioned in schema.sql). This would be a return to that platform but self-managed auth version.

#### Option C: Railway (Recommended for Simplicity)
**Price:** $5/mo + usage (~$10-15 total for small DB)

**Pros:**
- Deploy DB with one click
- Same platform can host your API
- GitHub integration
- Simple, predictable pricing

**Cons:**
- Limited PostgreSQL extensions
- No scale-to-zero
- Apps stop when credit runs out

**Best for:** All-in-one simplicity

#### Option D: Cloudflare D1 (Not Recommended)
**Why not:**
- SQLite-based, not PostgreSQL
- Would require schema rewrite
- Max 10GB per database
- Your schema uses PostgreSQL-specific features (pgcrypto, triggers)

---

## Hosted API/Backend Options

### Comparison Matrix

| Provider | Entry Price | Free Tier | Bun Support | Best For |
|----------|-------------|-----------|-------------|----------|
| **Railway** | $5/mo + usage | $5 credit | ✅ Native | Easy deploys, GitHub integration |
| **Fly.io** | Usage-based | $5 credit | ✅ Native | Global distribution, static IPs |
| **Render** | $7/mo | Limited | ✅ Via Docker | Budget-friendly, simple |
| **Cloudflare Workers** | Usage-based | Generous | ⚠️ Limited | Edge computing, existing CF stack |

### Detailed Recommendations

#### Option A: Railway (Recommended - Bundled with DB)
**Price:** ~$10-15/mo total (API + DB)

**Pros:**
- Deploy Bun + Hono natively
- Same platform as database
- Automatic deploys from GitHub
- Internal networking between services

**Cons:**
- No scale-to-zero for web services
- US regions primarily

**Setup:** One-click template exists for Bun + Hono

#### Option B: Fly.io (Recommended for Global)
**Price:** ~$5-15/mo

**Pros:**
- Multi-region deployment
- Static IPs (good for external services)
- microVM-based (lightweight)
- Excellent Bun support

**Cons:**
- More complex than Railway
- Need to manage Dockerfile
- Pricing can be confusing

#### Option C: Cloudflare Workers (Leverage Existing Stack)
**Price:** Usage-based (likely ~$5/mo for small app)

**Pros:**
- You already use Cloudflare (R2, Tunnel, Image Worker)
- Edge-first, global by default
- Free egress
- Can use Hyperdrive to connect to external PostgreSQL

**Cons:**
- Not full Node/Bun compatibility
- Sharp (image processing) won't work (but you have Image Worker)
- Would need code adaptation for Workers runtime
- Cold starts possible

**Note:** Your current API uses Sharp for image processing. This would need to be handled differently in Workers (your Image Worker already does transformations).

---

## Migration Scenarios

### Scenario 1: Minimal Change (Database Only)
**Move:** PostgreSQL → Neon/Supabase
**Keep:** Self-hosted API
**Cost:** ~$0-25/mo

**Benefits:**
- Automated backups
- Point-in-time recovery
- Professional monitoring
- Still control API server

**When:** Data safety is primary concern

### Scenario 2: Full Migration to Railway
**Move:** PostgreSQL + API → Railway
**Keep:** Vercel (frontend), Cloudflare (images)
**Cost:** ~$15-25/mo

**Benefits:**
- No server management
- Automatic deploys
- Single platform for backend

**When:** Want to eliminate server maintenance entirely

### Scenario 3: Cloudflare-First Architecture
**Move:** API → Cloudflare Workers, DB → External (Neon/Supabase)
**Keep:** Vercel (frontend), Cloudflare (images)
**Cost:** ~$20-45/mo

**Benefits:**
- Leverage existing Cloudflare investment
- Global edge performance
- Simplified networking

**When:** Performance and edge computing are priorities

### Scenario 4: Hybrid - Improve Self-Hosted
**Add:** Automated backups, monitoring alerts, UPS
**Keep:** Current architecture
**Cost:** ~$5-10/mo (backup storage)

**Benefits:**
- No migration work
- Improved reliability
- Keep control

**When:** Current setup mostly works, just need safety nets

---

## Recommended Action Plan

### Immediate (This Week)
1. **Set up database backups** - Critical regardless of migration decision
   ```bash
   # Use the included backup script (see Appendix A for setup)
   ./scripts/backup-db.sh
   ```

2. **Document current resource usage** - Know your baseline
   ```bash
   docker stats --no-stream
   ```

### Short-Term (1-3 Months)
1. **Evaluate traffic patterns** - Are you hitting any limits?
2. **Try Neon or Supabase free tier** - Test migration path
3. **Set up monitoring alerts** - Know before users do

### When Ready to Migrate
1. **Start with database** - Lowest risk, highest impact
2. **Keep API self-hosted initially** - One change at a time
3. **Move API later** - Once DB migration is stable

---

## Cost Summary

| Configuration | Monthly Cost | Reliability | Maintenance |
|---------------|-------------|-------------|-------------|
| **Current (self-hosted)** | ~$0 | ~99% | High |
| **DB only managed (Neon)** | ~$0-19 | ~99.5% | Medium |
| **DB only managed (Supabase)** | ~$0-25 | ~99.5% | Medium |
| **Full Railway** | ~$15-25 | ~99.9% | Low |
| **Full Fly.io** | ~$20-40 | ~99.9% | Medium |
| **Cloudflare Workers + Neon** | ~$20-45 | ~99.9% | Low |

---

## Sources

- [PostgreSQL Hosting Pricing Comparison 2025](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/)
- [Neon vs Supabase Comparison](https://www.bytebase.com/blog/neon-vs-supabase/)
- [Railway Bun + Hono Deploy](https://railway.com/deploy/wOsrk0)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io Managed Postgres](https://fly.io/docs/mpg/)
- [Render Pricing](https://render.com/pricing)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Railway vs Fly.io vs Render Comparison](https://medium.com/ai-disruption/railway-vs-fly-io-vs-render-which-cloud-gives-you-the-best-roi-2e3305399e5b)
- [Best PostgreSQL Hosting Providers 2025](https://northflank.com/blog/best-postgresql-hosting-providers)

---

## Conclusion

Your current self-hosted setup is viable for personal use but has clear reliability and data safety gaps. The **highest priority** is adding automated backups, regardless of migration decisions.

When ready to migrate:
- **For simplicity:** Railway (API + DB together)
- **For features:** Supabase (familiar from before, full platform)
- **For flexibility:** Neon DB + self-hosted API (gradual migration)
- **For performance:** Cloudflare Workers + edge DB

The sweet spot for most solo developers is spending **$20-30/month** to eliminate server maintenance while keeping costs reasonable.

---

## Appendix A: Setting Up Automated Backups

A backup script is included at `scripts/backup-db.sh`. Here's how to set it up:

### Step 1: Create R2 Backup Bucket

1. Go to Cloudflare Dashboard → R2
2. Create a new bucket called `vacay-backups`
3. Note: This is separate from your photos bucket for better organization

### Step 2: Create R2 API Token

1. Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create token with **Object Read & Write** permissions
3. Scope it to the `vacay-backups` bucket only
4. Save the Access Key ID and Secret Access Key

### Step 3: Configure AWS CLI

```bash
# Install AWS CLI if not present
# macOS: brew install awscli
# Linux: sudo apt install awscli

# Configure R2 profile
aws configure --profile r2
# Access Key ID: [your R2 access key]
# Secret Access Key: [your R2 secret key]
# Region: auto
# Output format: json
```

### Step 4: Test the Backup Script

```bash
# Make sure R2_ACCOUNT_ID is set (or it will read from api/.env.production)
export R2_ACCOUNT_ID="your_cloudflare_account_id"

# Run a test backup
./scripts/backup-db.sh

# List backups to verify
./scripts/backup-db.sh --list
```

### Step 5: Set Up Cron Job

```bash
# Edit crontab
crontab -e

# Add daily backup at 3 AM with cleanup of old backups
0 3 * * * cd /path/to/vacay-photo-map && ./scripts/backup-db.sh --cleanup >> /var/log/vacay-backup.log 2>&1
```

### Restore a Backup

```bash
# List available backups
./scripts/backup-db.sh --list

# Download specific backup
aws s3 cp s3://vacay-backups/db-backups/vacay_20251229_030000.sql.gz ./restore.sql.gz \
  --profile r2 --endpoint-url https://YOUR_ACCOUNT.r2.cloudflarestorage.com

# Stop API, restore, restart
docker compose -p vacay-prod -f docker-compose.prod.yml stop api
gunzip -c restore.sql.gz | docker exec -i vacay-postgres psql -U vacay -d vacay
docker compose -p vacay-prod -f docker-compose.prod.yml start api
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `R2_ACCOUNT_ID` | from .env | Your Cloudflare account ID |
| `R2_BACKUP_BUCKET` | `vacay-backups` | R2 bucket for backups |
| `RETENTION_DAYS` | `30` | Days to keep old backups |
| `AWS_PROFILE` | `r2` | AWS CLI profile name |
