-- Migration: Drop legacy WebAuthn columns from user_profiles
-- Problem: Production database still has webauthn_user_id as NOT NULL
-- but the code no longer uses WebAuthn (replaced with password auth in #228)

-- Drop webauthn_user_id column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'webauthn_user_id'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN webauthn_user_id;
  END IF;
END $$;

-- Also drop authenticators table if it exists (WebAuthn credential storage)
DROP TABLE IF EXISTS authenticators CASCADE;
