-- Fix RLS policies to allow DELETE operations on trips and photos
-- Run this in Supabase SQL Editor: https://nahvpdhrwqvzbbnjasdg.supabase.co

-- Enable RLS on tables (if not already enabled)
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Enable read access for all users" ON trips;
DROP POLICY IF EXISTS "Enable insert access for all users" ON trips;
DROP POLICY IF EXISTS "Enable update access for all users" ON trips;
DROP POLICY IF EXISTS "Enable delete access for all users" ON trips;

DROP POLICY IF EXISTS "Enable read access for all users" ON photos;
DROP POLICY IF EXISTS "Enable insert access for all users" ON photos;
DROP POLICY IF EXISTS "Enable update access for all users" ON photos;
DROP POLICY IF EXISTS "Enable delete access for all users" ON photos;

-- Create permissive policies for trips table
-- (For now, allowing all operations. In production, you'd restrict by user auth)
CREATE POLICY "Enable read access for all users" ON trips
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON trips
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON trips
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON trips
    FOR DELETE USING (true);

-- Create permissive policies for photos table
CREATE POLICY "Enable read access for all users" ON photos
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON photos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON photos
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON photos
    FOR DELETE USING (true);

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('trips', 'photos')
ORDER BY tablename, policyname;
