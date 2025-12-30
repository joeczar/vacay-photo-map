# Multi-stage Dockerfile for production API deployment
# Stage 1: Builder - install dependencies
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock* ./

# Install dependencies with frozen lockfile for reproducibility
RUN bun install --frozen-lockfile

# Copy application source
COPY src ./src
COPY tsconfig.json ./

# Stage 2: Runtime - minimal production image
FROM oven/bun:1.3-alpine

# Install wget for health check (must be before USER bun)
RUN apk add --no-cache wget

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Copy migration scripts and migrations directory (needed at runtime for auto-migrations)
COPY scripts ./scripts
COPY migrations ./migrations

# Copy and make entrypoint executable (must be before USER bun)
COPY docker-entrypoint.sh ./
RUN chmod 755 docker-entrypoint.sh

# Run as non-root user for security
USER bun

# Expose API port
EXPOSE 3000

# Health check endpoint - uses /health/ready to verify database connectivity
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/ready || exit 1

# Start with entrypoint that runs migrations first
CMD ["./docker-entrypoint.sh"]
