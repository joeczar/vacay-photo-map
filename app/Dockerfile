# Multi-stage Dockerfile for production frontend deployment
# Build context must be the monorepo root (not ./app)

# Stage 1: Builder - install dependencies and build
FROM node:20-alpine AS builder

RUN corepack enable
WORKDIR /app

# Copy workspace config first (for layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY app/package.json ./app/

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy app source
COPY app ./app

# Build-time environment variables for Vite
ARG VITE_API_URL
ARG VITE_APP_URL
ARG VITE_WEBAUTHN_RP_NAME
ARG VITE_WEBAUTHN_RP_ID
ARG VITE_CDN_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_WEBAUTHN_RP_NAME=$VITE_WEBAUTHN_RP_NAME
ENV VITE_WEBAUTHN_RP_ID=$VITE_WEBAUTHN_RP_ID
ENV VITE_CDN_URL=$VITE_CDN_URL

# Build the application
WORKDIR /app/app
RUN pnpm build

# Stage 2: Runtime - minimal production image with nginx
FROM nginx:alpine

# Install wget for health check
RUN apk add --no-cache wget

# Copy built files from builder
COPY --from=builder /app/app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY app/nginx.conf /etc/nginx/nginx.conf

# Expose HTTP port
EXPOSE 80

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
