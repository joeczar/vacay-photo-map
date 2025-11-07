# Database Migrations

This directory contains SQL migration files for the Vacay Photo Map database.

## How to Apply Migrations

1. **Log into Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar

3. **Run the Migration**
   - Click "New Query"
   - Copy the contents of the migration file
   - Paste into the editor
   - Click "Run" or press Cmd/Ctrl + Enter

4. **Verify Success**
   - Check the output panel for any errors
   - The migration includes verification checks

## Migration Files

### `20251107_add_trip_token_protection.sql`
**Status:** Ready to apply
**Purpose:** Adds `access_token_hash` column to support private trip token protection

**Changes:**
- Adds `access_token_hash TEXT` column to trips table (nullable)
- Existing trips remain unaffected (column defaults to NULL)
- Enables token-based access control for private trips

**Safe to Run:** Yes - This is an additive change that doesn't affect existing data

## Notes

- Migrations are numbered by date: `YYYYMMDD_description.sql`
- Always review the migration before running
- Existing trips will work without any changes (token protection is opt-in)
- RLS policies remain unchanged for this migration
