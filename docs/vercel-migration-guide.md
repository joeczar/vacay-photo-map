# Vercel Migration Guide

Migration from Docker/nginx to Vercel for frontend hosting.

## Quick Start (CLI)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Link project (from repo root)
vercel link

# 4. Set environment variables
vercel env add VITE_API_URL
vercel env add VITE_APP_URL
vercel env add VITE_WEBAUTHN_RP_NAME
vercel env add VITE_WEBAUTHN_RP_ID
vercel env add VITE_CDN_URL

# 5. Deploy
vercel           # Preview
vercel --prod    # Production
```

## Environment Variables

Set these in Vercel dashboard or via CLI:

| Variable | Production Value |
|----------|------------------|
| `VITE_API_URL` | `https://photos.joeczar.com` |
| `VITE_APP_URL` | `https://photos.joeczar.com` |
| `VITE_WEBAUTHN_RP_NAME` | `Vacay Photo Map` |
| `VITE_WEBAUTHN_RP_ID` | `photos.joeczar.com` |
| `VITE_CDN_URL` | `https://images.joeczar.com` |

## Custom Domain Setup

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add domain: `photos.joeczar.com`
3. Update DNS records as instructed by Vercel
4. Wait for SSL certificate (automatic)

## Testing Checklist

### Preview Deployment
- [ ] Site loads on preview URL
- [ ] All routes work (SPA fallback)
- [ ] Images load from API
- [ ] Dark mode works
- [ ] No console errors

### Production Deployment
- [ ] Site loads on custom domain
- [ ] WebAuthn login works
- [ ] New user registration works
- [ ] Photo upload works
- [ ] Map displays correctly
- [ ] PWA install works (mobile)

## Rollback Procedure

If issues arise after DNS change:

```bash
# 1. On server - restart Docker frontend
docker compose -p vacay-prod -f docker-compose.prod.yml up -d frontend

# 2. Revert DNS to Cloudflare Tunnel
# Update A/CNAME record back to tunnel

# 3. Wait for DNS propagation (1-10 min)
```

## Reference

- Issue: #215
- Vercel Docs: https://vercel.com/docs
- Configuration: `vercel.json`
