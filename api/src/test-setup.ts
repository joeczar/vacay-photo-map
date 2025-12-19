/**
 * Test Setup - Preloaded before all tests via bunfig.toml
 *
 * Loads environment variables from .env.test and validates required values.
 * This eliminates the need for hardcoded process.env assignments in test files.
 */

import { resolve } from "node:path";

const envTestPath = resolve(import.meta.dir, "../.env.test");
const envFile = Bun.file(envTestPath);

if (await envFile.exists()) {
  const content = await envFile.text();

  // Parse .env format (KEY=value lines)
  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    // Only set if not already set (allows CI to override)
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
} else {
  console.warn(
    "⚠️  Warning: .env.test not found. Copy from .env.test.example:\n" +
      "   cp .env.test.example .env.test",
  );
}

// Validate required environment variables
const required = ["JWT_SECRET", "DATABASE_URL", "RP_ID", "RP_ORIGIN"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required test environment variables: ${missing.join(", ")}\n` +
      "Ensure .env.test exists or set variables in CI.",
  );
}
