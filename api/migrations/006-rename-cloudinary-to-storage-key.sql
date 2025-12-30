-- 006-rename-cloudinary-to-storage-key.sql
-- Rename cloudinary_public_id to storage_key (migration from Cloudinary to R2)
-- Related: Issue #202

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'cloudinary_public_id'
  ) THEN
    ALTER TABLE photos RENAME COLUMN cloudinary_public_id TO storage_key;
  END IF;
END $$;
