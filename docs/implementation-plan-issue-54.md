# Implementation Plan: Issue #54 - Create Bun + Hono API Server Scaffold

## Overview

| Field | Value |
|-------|-------|
| **Issue** | #54 - Create Bun + Hono API server scaffold |
| **Milestone** | Self-Hosted Migration |
| **Labels** | api, migration |
| **Branch** | `feature/issue-54-bun-hono-scaffold` |

## Context

This is the foundational issue for migrating from Supabase to a self-hosted API. It creates the basic server structure that all subsequent migration issues (#55-#62) will build upon.

### Migration Sequence

```
#54 Bun + Hono scaffold     <-- THIS ISSUE
#55 PostgreSQL schema
#56 Auth endpoints
#57 Trip endpoints
#58 JWT middleware
#59 Docker Compose
#60 API client
#61 useAuth composable
#62 database.ts update
```

---

## Prerequisites

- Bun runtime installed (verified: v1.3.4)
- pnpm workspace configured

---

## Commits

This implementation consists of **4 atomic commits**, each with testing before committing.

---

### Commit 1: Initialize Bun project with Hono dependency

**What:** Create the api directory, initialize Bun project, install Hono.

#### Files Created

**`api/package.json`**
```json
{
  "name": "vacay-photo-map-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

**`api/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "lib": ["ES2022"],
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**`api/.gitignore`**
```
node_modules/
.env
.env.local
.env.*.local
dist/
*.tsbuildinfo
bun.lockb
.DS_Store
```

#### Testing Before Commit

```bash
# From project root
cd api

# Install dependencies
bun install

# Verify Hono is installed
bun pm ls | grep hono
# Expected: hono@4.x.x

# Verify TypeScript config is valid
bunx tsc --noEmit
# Expected: No errors (nothing to compile yet)
```

#### Commit Message

```
chore(api): initialize Bun project with Hono

- Create api directory structure
- Configure package.json with dev/start/test scripts
- Set up TypeScript with Bun-specific settings
- Add .gitignore for api package

Part of #54
```

---

### Commit 2: Add health check endpoint with basic server

**What:** Create the main entry point and health check route.

#### Files Created

**`api/src/routes/health.ts`**
```typescript
import { Hono } from 'hono'

const health = new Hono()

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

health.get('/ready', (c) => {
  return c.json({
    status: 'ok',
    checks: {
      api: true,
    },
  })
})

export { health }
```

**`api/src/index.ts`**
```typescript
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { health } from './routes/health'

const app = new Hono()

// Middleware
app.use('*', logger())

// Routes
app.route('/health', health)

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Vacay Photo Map API',
    version: '1.0.0',
    docs: '/health for status',
  })
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json(
    { error: 'Internal Server Error', message: err.message },
    500
  )
})

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Server starting on port ${port}...`)

export default {
  port,
  fetch: app.fetch,
}
```

#### Testing Before Commit

```bash
# Start server (in one terminal)
cd api
bun run dev
# Expected: "Server starting on port 3000..."

# Test endpoints (in another terminal)
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","version":"1.0.0"}

curl http://localhost:3000/health/ready
# Expected: {"status":"ok","checks":{"api":true}}

curl http://localhost:3000/
# Expected: {"name":"Vacay Photo Map API",...}

curl http://localhost:3000/nonexistent
# Expected: {"error":"Not Found"}

# Stop server (Ctrl+C)

# Type check
bun run type-check
# Expected: No errors
```

#### Commit Message

```
feat(api): add health check endpoint with basic server

- Create Hono app entry point with logger middleware
- Add /health endpoint returning status and timestamp
- Add /health/ready endpoint for readiness probes
- Add 404 and error handlers

Part of #54
```

---

### Commit 3: Add CORS middleware

**What:** Configure CORS to allow frontend requests.

#### Files Created

**`api/src/middleware/cors.ts`**
```typescript
import { cors } from 'hono/cors'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return '*'
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    if (process.env.NODE_ENV === 'development') return origin
    return null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
})
```

#### Files Modified

**`api/src/index.ts`** (add import and middleware)
```typescript
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { corsMiddleware } from './middleware/cors'
import { health } from './routes/health'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', corsMiddleware)

// ... rest unchanged
```

#### Testing Before Commit

```bash
# Start server
cd api
bun run dev

# Test CORS headers with allowed origin
curl -H "Origin: http://localhost:5173" -v http://localhost:3000/health 2>&1 | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: http://localhost:5173

# Test OPTIONS preflight
curl -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -v http://localhost:3000/health 2>&1 | grep -i "access-control"
# Expected: Multiple Access-Control-* headers

# Stop server

# Type check
bun run type-check
# Expected: No errors
```

#### Commit Message

```
feat(api): add CORS middleware for frontend access

- Create CORS middleware with configurable origins
- Allow localhost dev servers by default
- Support FRONTEND_URL env var for production
- Include credentials support for auth headers

Part of #54
```

---

### Commit 4: Add environment template and integrate with workspace

**What:** Create .env.example and update root workspace configuration.

#### Files Created

**`api/.env.example`**
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Database (for #55)
# DATABASE_URL=postgresql://vacay:vacay@localhost:5432/vacay

# JWT Configuration (for #56, #58)
# JWT_SECRET=your-secret-key-at-least-32-characters
# JWT_EXPIRES_IN=7d
```

#### Files Modified

**`pnpm-workspace.yaml`**
```yaml
packages:
  - 'app'
  - 'api'
```

**`package.json`** (root - add scripts)
```json
{
  "scripts": {
    "dev": "pnpm --filter vacay-photo-map-app dev",
    "dev:api": "pnpm --filter vacay-photo-map-api dev",
    "build": "pnpm --filter vacay-photo-map-app build",
    "preview": "pnpm --filter vacay-photo-map-app preview",
    "lint": "pnpm --filter vacay-photo-map-app lint",
    "format": "pnpm --filter vacay-photo-map-app format",
    "test": "pnpm --filter vacay-photo-map-app test",
    "test:api": "pnpm --filter vacay-photo-map-api test",
    "type-check": "pnpm --filter vacay-photo-map-app type-check",
    "type-check:api": "pnpm --filter vacay-photo-map-api type-check"
  }
}
```

#### Testing Before Commit

```bash
# From project root
pnpm install
# Expected: Installs api package dependencies

# Start API from root
pnpm run dev:api
# Expected: Server starts on port 3000

# Test health endpoint
curl http://localhost:3000/health
# Expected: {"status":"ok",...}

# Stop server

# Run type check from root
pnpm run type-check:api
# Expected: No errors

# Verify workspace includes api
pnpm ls --filter vacay-photo-map-api
# Expected: Shows api package info
```

#### Commit Message

```
feat(api): add env template and workspace integration

- Create .env.example with documented variables
- Add api package to pnpm workspace
- Add root scripts for API development
- Complete API scaffold setup

Closes #54
```

---

## Summary

| Commit | Description | Key Tests |
|--------|-------------|-----------|
| 1 | Initialize Bun + Hono | `bun install`, `tsc --noEmit` |
| 2 | Health check endpoint | `curl /health`, `curl /health/ready` |
| 3 | CORS middleware | CORS headers present |
| 4 | Workspace integration | `pnpm run dev:api` from root |

---

## Acceptance Criteria Checklist

After all commits:

- [ ] `bun run dev` starts server on port 3000
- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] CORS allows frontend origin (localhost:5173)
- [ ] TypeScript compiles without errors
- [ ] `pnpm run dev:api` works from project root

---

## Final Directory Structure

```
api/
├── src/
│   ├── index.ts
│   ├── middleware/
│   │   └── cors.ts
│   └── routes/
│       └── health.ts
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```
