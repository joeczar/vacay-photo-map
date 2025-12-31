-- 008-drop-webauthn-column.sql
-- Clean up deprecated WebAuthn column from user_profiles
-- This column was left over from the WebAuthn-to-password auth migration
-- Created: 2025-12-31

-- Drop the unique constraint first (if it exists)
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_webauthn_user_id_key;

-- Drop the column (if it exists)
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS webauthn_user_id;
