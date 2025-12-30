-- 002-add-password-hash.sql
-- Add password_hash column for password authentication
-- Related: Issue #227 (password auth), Issue #229 (migration fix)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN password_hash TEXT;
  END IF;
END $$;

-- Set NOT NULL constraint after column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'password_hash'
      AND is_nullable = 'YES'
  ) THEN
    UPDATE user_profiles SET password_hash = '' WHERE password_hash IS NULL;
    ALTER TABLE user_profiles ALTER COLUMN password_hash SET NOT NULL;
  END IF;
END $$;
