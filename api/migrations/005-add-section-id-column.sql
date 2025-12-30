-- 005-add-section-id-column.sql
-- Add section_id column to organize photos within trips
-- Related: Issue #137

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'section_id'
  ) THEN
    ALTER TABLE photos
      ADD COLUMN section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for section lookups
CREATE INDEX IF NOT EXISTS idx_photos_section_id ON photos(section_id);
