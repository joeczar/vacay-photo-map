import type { getDbClient } from "./client";

/**
 * Create a postgres-migrations compatible client adapter
 *
 * The library expects node-postgres (pg) client interface, but we use postgres.js
 * This adapter maps our client's methods to the expected interface.
 *
 * postgres-migrations may pass queries in two formats:
 * 1. Object format: { text: '...', values: [...] }
 * 2. String format: sql, values
 *
 * @param db - The postgres.js client from getDbClient()
 * @returns An adapter object with a query() method compatible with postgres-migrations
 */
export function createMigrationClient(db: ReturnType<typeof getDbClient>) {
  return {
    query: async (
      sql: string | { text: string; values?: unknown[] },
      values?: unknown[],
    ) => {
      let queryText: string;
      let queryValues: unknown[] | undefined;

      if (typeof sql === "object" && sql !== null && "text" in sql) {
        // Query object format: { text: '...', values: [...] }
        queryText = sql.text;
        queryValues = sql.values;
      } else {
        // String format
        queryText = sql as string;
        queryValues = values;
      }

      // postgres-migrations may pass empty array [] instead of undefined
      // postgres.js treats empty array differently than no params
      const result =
        queryValues && queryValues.length > 0
          ? await db.unsafe(queryText, queryValues as any[])
          : await db.unsafe(queryText);
      return {
        rows: result,
        rowCount: result.length,
      };
    },
  };
}
