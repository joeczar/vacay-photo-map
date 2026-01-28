import { Hono } from "hono";
import { logger } from "hono/logger";
import { corsMiddleware } from "./middleware/cors";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { trips } from "./routes/trips";
import { upload } from "./routes/upload";
import { invites } from "./routes/invites";
import { tripAccess } from "./routes/trip-access";
import { connectWithRetry, startConnectionHealthCheck } from "./db/client";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", corsMiddleware);

// Routes
app.route("/health", health);
app.route("/api/auth", auth);
app.route("/api/trips", trips);
app.route("/api/invites", invites);
app.route("/api", tripAccess);
app.route("/api", upload);

// Root
app.get("/", (c) => {
  return c.json({
    name: "Vacay Photo Map API",
    version: "1.0.0",
    docs: "/health for status",
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      ...(process.env.NODE_ENV !== "production" && { message: err.message }),
    },
    500,
  );
});

const port = parseInt(process.env.PORT || "3000", 10);

// Startup validation
async function startServer() {
  console.log("Server starting...");
  console.log("Connecting to database...");

  try {
    await connectWithRetry();

    // Start periodic health check (every 60 seconds)
    startConnectionHealthCheck(60_000);

    console.log(`Server ready on port ${port}`);
  } catch (error) {
    console.error(
      "Failed to connect to database:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

// Start server with database validation
startServer();

// Export app for testing
export { app };

export default {
  port,
  fetch: app.fetch,
};
