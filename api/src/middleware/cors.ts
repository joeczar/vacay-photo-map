import { cors } from "hono/cors";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;

    // Allow Vercel preview deployments (restricted to this project)
    const vercelPreviewRegex = /^https:\/\/vacay-photo-map-.*\.vercel\.app$/;
    if (vercelPreviewRegex.test(origin)) return origin;

    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
  credentials: true,
});
