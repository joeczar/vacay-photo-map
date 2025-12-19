# Testing Standards

**Applies to:** `**/*.test.ts`, `**/test-*.ts`

## Environment Variables in Tests

**NEVER hardcode environment variables in test files.**

### Violations (DO NOT DO THIS):

```typescript
// WRONG - Hardcoded secrets
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
```

### Correct Pattern:

```typescript
// CORRECT - No env setup needed
import { describe, it, expect } from 'bun:test'
import { getAdminAuthHeader } from '../test-helpers'

// Environment loaded automatically from .env.test via bunfig.toml preload
```

## Test Helpers

**Use shared test helpers instead of duplicating.**

Available in `src/test-helpers.ts`:
- `getAdminAuthHeader()` - Admin JWT token
- `getUserAuthHeader()` - Regular user JWT token
- `uniqueIp()` - Unique IP for rate limit tests
- `createRequestWithUniqueIp()` - Request with unique IP
- `createJpegFile()`, `createPngFile()`, `createWebpFile()` - Test files
- `createFormData()` - FormData with file

### Violations:

```typescript
// WRONG - Duplicating helper
async function getAdminAuthHeader() {
  const token = await signToken({ sub: 'admin', isAdmin: true })
  return { Authorization: `Bearer ${token}` }
}
```

### Correct Pattern:

```typescript
// CORRECT - Import shared helper
import { getAdminAuthHeader } from '../test-helpers'
```

## Configuration Files

- `.env.test` - Test environment variables (gitignored)
- `.env.test.example` - Template for developers
- `bunfig.toml` - Test runner config with preload
- `src/test-setup.ts` - Preloaded environment loader
- `src/test-helpers.ts` - Shared test utilities

## Running Tests

```bash
# Setup (one time)
cp .env.test.example .env.test

# Run tests
bun test

# Tests in CI
# GitHub Actions sets env vars directly, .env.test not needed
```

## Why This Matters

1. **Security**: Hardcoded secrets in code can leak in commits/PRs
2. **Consistency**: Single source of truth for test configuration
3. **Maintainability**: Change config once, not in 5+ files
4. **CI Compatibility**: Env vars work same locally and in CI

## When Writing Tests

1. Import helpers from `test-helpers.ts`
2. Never set `process.env.*` in test files
3. Use `.env.test` for local configuration
4. Add new helpers to `test-helpers.ts` if reusable across files
