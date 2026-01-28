import postgres from "postgres";

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return url;
};

const getSslConfig = () => {
  const useSsl =
    process.env.DATABASE_SSL === "1" ||
    process.env.DATABASE_SSL?.toLowerCase() === "true";

  if (!useSsl) {
    return false;
  }

  // Defaults to true for security (validates server certificate)
  // Set DATABASE_SSL_REJECT_UNAUTHORIZED=false only for local dev with self-signed certs
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.toLowerCase() !== "false";

  return { rejectUnauthorized };
};

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const getPoolSize = () => parsePositiveInt(process.env.DATABASE_POOL_SIZE, 10);

// Note: postgres.js uses seconds for idle_timeout
const getIdleTimeout = () =>
  parsePositiveInt(process.env.DATABASE_IDLE_TIMEOUT_S, 30);

// Connection attempt timeout in seconds
const getConnectTimeout = () =>
  parsePositiveInt(process.env.DATABASE_CONNECT_TIMEOUT_S, 30);

// Max connection lifetime in seconds (recycle connections periodically)
const getMaxLifetime = () =>
  parsePositiveInt(process.env.DATABASE_MAX_LIFETIME_S, 1800);

let client: ReturnType<typeof postgres> | null = null;

export const getDbClient = () => {
  if (!client) {
    client = postgres(getDatabaseUrl(), {
      ssl: getSslConfig(),
      max: getPoolSize(),
      idle_timeout: getIdleTimeout(),
      connect_timeout: getConnectTimeout(),
      max_lifetime: getMaxLifetime(),
      onnotice: (notice) => {
        console.log("[DB] Notice:", notice.message);
      },
    });
  }

  return client;
};

export const pingDatabase = async () => {
  const db = getDbClient();
  const result = await db`select now() as now`;
  return (result[0] as { now: string } | undefined)?.now;
};

export const connectWithRetry = async (
  maxRetries: number = 5,
  initialDelay: number = 5000,
): Promise<void> => {
  const maxDelay = 60000; // 60 seconds
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DB] Connection attempt ${attempt}/${maxRetries}...`);
      await pingDatabase();
      console.log("[DB] Connection successful");
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[DB] Connection attempt ${attempt} failed: ${errorMessage}`,
      );

      if (attempt === maxRetries) {
        console.error("[DB] Max retries reached, giving up");
        throw new Error(
          `Failed to connect to database after ${maxRetries} attempts: ${errorMessage}`,
        );
      }

      const currentDelay = Math.min(delay, maxDelay);
      console.log(`[DB] Retrying in ${currentDelay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      delay *= 2; // Exponential backoff
    }
  }
};

export const closeDbClient = async () => {
  stopConnectionHealthCheck();
  if (client) {
    await client.end();
    client = null;
  }
};

// =============================================================================
// Connection Health Monitoring
// =============================================================================

let healthCheckInterval: Timer | null = null;
let consecutiveHealthCheckFailures = 0;
const MAX_CONSECUTIVE_HEALTH_FAILURES = 5;

export const startConnectionHealthCheck = (intervalMs = 60_000) => {
  if (healthCheckInterval) return;

  console.log(
    `[DB] Starting connection health check (interval: ${intervalMs / 1000}s)`,
  );

  consecutiveHealthCheckFailures = 0;

  healthCheckInterval = setInterval(async () => {
    try {
      const start = Date.now();
      await pingDatabase();
      const duration = Date.now() - start;
      console.log(`[DB] Health check OK (${duration}ms)`);
      consecutiveHealthCheckFailures = 0; // Reset on success
    } catch (error) {
      consecutiveHealthCheckFailures++;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[DB] Health check FAILED (${consecutiveHealthCheckFailures}/${MAX_CONSECUTIVE_HEALTH_FAILURES}): ${message}`,
      );

      if (consecutiveHealthCheckFailures >= MAX_CONSECUTIVE_HEALTH_FAILURES) {
        console.error(
          "[DB] CRITICAL: Max consecutive health check failures reached - database connection may be dead",
        );
        // The /health/ready endpoint will return 503, alerting monitoring systems
        // Application continues running to allow recovery when DB comes back
      }
    }
  }, intervalMs);

  // Allow process to exit gracefully without explicit cleanup
  healthCheckInterval.unref();
};

export const stopConnectionHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    consecutiveHealthCheckFailures = 0;
    console.log("[DB] Stopped connection health check");
  }
};

// =============================================================================
// Query Retry Wrapper for Transient Errors
// =============================================================================

// PostgreSQL error codes for transient/recoverable errors
const TRANSIENT_ERROR_CODES = [
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "40001", // serialization_failure (retry recommended)
  "40P01", // deadlock_detected (retry recommended)
];

// Network-level error patterns that indicate transient issues
const TRANSIENT_ERROR_PATTERNS = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "Connection terminated unexpectedly",
  "connection pool exhausted",
];

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorObj = error as { code?: string; message?: string };

  // Check PostgreSQL error codes
  if (errorObj.code && TRANSIENT_ERROR_CODES.includes(errorObj.code)) {
    return true;
  }

  // Check error message for network-level issues
  if (typeof errorObj.message === "string") {
    return TRANSIENT_ERROR_PATTERNS.some((pattern) =>
      errorObj.message!.includes(pattern),
    );
  }

  return false;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 100,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientError(error) || attempt === maxRetries) {
        throw error;
      }

      const errorCode =
        error && typeof error === "object" && "code" in error
          ? (error as { code: string }).code
          : "unknown";

      console.warn(
        `[DB] Transient error (${errorCode}), retry ${attempt}/${maxRetries}`,
      );

      // Exponential backoff: 100ms, 200ms, 400ms...
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
