import { Hono } from "hono";
import { getDbClient } from "../db/client";
import { requireAdmin } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import { toSectionResponse } from "./trips";

// =============================================================================
// Database Types
// =============================================================================

interface DbSection {
  id: string;
  trip_id: string;
  title: string;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Validation Helpers
// =============================================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 200;

function isValidTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH;
}

// Check if error is a unique constraint violation
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

// =============================================================================
// Routes
// =============================================================================

const sections = new Hono<AuthEnv>();

// =============================================================================
// GET /api/trips/:tripId/sections - List sections for a trip
// =============================================================================
sections.get("/trips/:tripId/sections", requireAdmin, async (c) => {
  const tripId = c.req.param("tripId");
  const db = getDbClient();

  // Validate UUID format
  if (!UUID_REGEX.test(tripId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Check if trip exists
  const tripResults = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `;

  if (tripResults.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Get all sections for this trip
  const sectionResults = await db<DbSection[]>`
    SELECT id, trip_id, title, order_index, created_at, updated_at
    FROM sections
    WHERE trip_id = ${tripId}
    ORDER BY order_index ASC
  `;

  return c.json({
    sections: sectionResults.map(toSectionResponse),
  });
});

// =============================================================================
// POST /api/trips/:tripId/sections - Create a section
// =============================================================================
sections.post("/trips/:tripId/sections", requireAdmin, async (c) => {
  const tripId = c.req.param("tripId");
  const body = await c.req.json<{
    title: string;
    orderIndex: number;
  }>();

  const { title, orderIndex } = body;

  // Validate UUID format
  if (!UUID_REGEX.test(tripId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Validate title
  if (!isValidTitle(title)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Title is required and must be ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400,
    );
  }

  // Validate orderIndex
  if (orderIndex < 0) {
    return c.json(
      {
        error: "Bad Request",
        message: "Order index must be non-negative.",
      },
      400,
    );
  }

  const db = getDbClient();

  // Check if trip exists
  const tripResults = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `;

  if (tripResults.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Insert section
  try {
    const [section] = await db<DbSection[]>`
      INSERT INTO sections (trip_id, title, order_index)
      VALUES (${tripId}, ${title.trim()}, ${orderIndex})
      RETURNING id, trip_id, title, order_index, created_at, updated_at
    `;

    return c.json(toSectionResponse(section), 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        {
          error: "Conflict",
          message: "A section with this order already exists for this trip",
        },
        409,
      );
    }
    throw error;
  }
});

// =============================================================================
// PATCH /api/sections/:id - Update a section
// =============================================================================
sections.patch("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    orderIndex?: number;
  }>();

  const { title, orderIndex } = body;

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid section ID format." },
      400,
    );
  }

  // Validate at least one field provided
  if (title === undefined && orderIndex === undefined) {
    return c.json(
      {
        error: "Bad Request",
        message: "At least one field (title or orderIndex) must be provided.",
      },
      400,
    );
  }

  // Validate title if provided
  if (title !== undefined && !isValidTitle(title)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Title is required and must be ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400,
    );
  }

  // Validate orderIndex if provided
  if (orderIndex !== undefined && orderIndex < 0) {
    return c.json(
      {
        error: "Bad Request",
        message: "Order index must be non-negative.",
      },
      400,
    );
  }

  const db = getDbClient();

  // Check if section exists
  const existingSection = await db<DbSection[]>`
    SELECT id FROM sections WHERE id = ${id}
  `;

  if (existingSection.length === 0) {
    return c.json({ error: "Not Found", message: "Section not found" }, 404);
  }

  // Build dynamic update - only update provided fields
  const updates: Record<string, unknown> = {};
  if (title !== undefined) {
    updates.title = title.trim();
  }
  if (orderIndex !== undefined) {
    updates.order_index = orderIndex;
  }

  // Update section
  try {
    const [section] = await db<DbSection[]>`
      UPDATE sections
      SET ${db(updates)}
      WHERE id = ${id}
      RETURNING id, trip_id, title, order_index, created_at, updated_at
    `;

    return c.json(toSectionResponse(section), 200);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        {
          error: "Conflict",
          message: "A section with this order already exists for this trip",
        },
        409,
      );
    }
    throw error;
  }
});

// =============================================================================
// DELETE /api/sections/:id - Delete a section
// =============================================================================
sections.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid section ID format." },
      400,
    );
  }

  const db = getDbClient();

  // Delete section
  const deletedSection = await db<{ id: string }[]>`
    DELETE FROM sections WHERE id = ${id} RETURNING id
  `;

  if (deletedSection.length === 0) {
    return c.json({ error: "Not Found", message: "Section not found" }, 404);
  }

  // Return 204 No Content on success
  return c.body(null, 204);
});

export { sections };
