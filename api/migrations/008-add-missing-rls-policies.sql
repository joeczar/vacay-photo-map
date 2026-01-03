-- Migration: Add missing RLS policies for invites and related tables
-- Problem: invites, invite_trip_access, trip_access tables have RLS enabled
-- but only INSERT policies. SELECT and UPDATE operations fail silently or error.

-- =============================================================================
-- SELECT Policies
-- =============================================================================
-- Allow the API user to SELECT from all auth-related tables

-- Invites SELECT (needed for validating invite codes during registration)
DROP POLICY IF EXISTS "Allow selects from API user for invites" ON invites;
CREATE POLICY "Allow selects from API user for invites"
  ON invites FOR SELECT
  USING (current_user = 'vacay');

-- Invite trip access SELECT (needed for granting trip access during registration)
DROP POLICY IF EXISTS "Allow selects from API user for invite_trip_access" ON invite_trip_access;
CREATE POLICY "Allow selects from API user for invite_trip_access"
  ON invite_trip_access FOR SELECT
  USING (current_user = 'vacay');

-- Trip access SELECT (needed for checking user permissions)
DROP POLICY IF EXISTS "Allow selects from API user for trip_access" ON trip_access;
CREATE POLICY "Allow selects from API user for trip_access"
  ON trip_access FOR SELECT
  USING (current_user = 'vacay');

-- =============================================================================
-- UPDATE Policies
-- =============================================================================
-- Allow the API user to UPDATE invites (needed to mark invites as used)

DROP POLICY IF EXISTS "Allow updates from API user for invites" ON invites;
CREATE POLICY "Allow updates from API user for invites"
  ON invites FOR UPDATE
  USING (current_user = 'vacay')
  WITH CHECK (current_user = 'vacay');

-- =============================================================================
-- DELETE Policies
-- =============================================================================
-- Allow the API user to DELETE from trip_access (needed for revoking access)

DROP POLICY IF EXISTS "Allow deletes from API user for trip_access" ON trip_access;
CREATE POLICY "Allow deletes from API user for trip_access"
  ON trip_access FOR DELETE
  USING (current_user = 'vacay');

-- Allow the API user to DELETE from invites (needed for revoking invites)
DROP POLICY IF EXISTS "Allow deletes from API user for invites" ON invites;
CREATE POLICY "Allow deletes from API user for invites"
  ON invites FOR DELETE
  USING (current_user = 'vacay');
