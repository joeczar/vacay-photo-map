-- 007-set-storage-key-not-null.sql
-- Ensure storage_key has NOT NULL constraint
-- Related: Issue #202

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'storage_key'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE photos ALTER COLUMN storage_key SET NOT NULL;
  END IF;
END $$;
