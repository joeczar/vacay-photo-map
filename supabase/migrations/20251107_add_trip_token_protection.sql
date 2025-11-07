-- Add trip token protection
-- This migration adds the access_token_hash column to support private trip sharing

-- Add access_token_hash column to trips table
ALTER TABLE trips
ADD COLUMN access_token_hash TEXT;

-- Add comment for documentation
COMMENT ON COLUMN trips.access_token_hash IS 'Bcrypt hash of the 3-word access token for private trips. NULL for public trips.';

-- Verify the column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'trips'
    AND column_name = 'access_token_hash'
  ) THEN
    RAISE EXCEPTION 'Migration failed: access_token_hash column not added';
  END IF;
END $$;
