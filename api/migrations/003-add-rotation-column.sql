-- 003-add-rotation-column.sql
-- Add rotation column for photo orientation
-- Related: Issue #137

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'rotation'
  ) THEN
    ALTER TABLE photos
      ADD COLUMN rotation INTEGER DEFAULT 0 NOT NULL,
      ADD CONSTRAINT photos_rotation_check CHECK (rotation IN (0, 90, 180, 270));
  END IF;
END $$;
