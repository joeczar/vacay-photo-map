-- 004-add-description-column.sql
-- Add description column for photo details
-- Related: Issue #137

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE photos ADD COLUMN description TEXT;
  END IF;
END $$;
