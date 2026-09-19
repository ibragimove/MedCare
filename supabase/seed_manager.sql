-- Create demo manager account via Supabase Auth API
-- Run this in the Supabase SQL Editor

-- Option 1: Use Dashboard → Authentication → Users → Add user
-- Email: menejer@demo.uz, Password: Demo1234!, Metadata: {"role": "manager", "full_name": "Aziz Menejer"}

-- Option 2: Insert directly (adjust user ID as needed)
-- Note: passwords are managed by Supabase auth, so use Dashboard UI for actual account creation
-- After creating the user, the profile will be created by the trigger (if it exists)
-- or insert manually:

-- INSERT INTO profiles (id, role, full_name) VALUES
--   ('UUID_FROM_AUTH_USERS', 'manager', 'Aziz Menejer')
-- ON CONFLICT (id) DO UPDATE SET role = 'manager', full_name = 'Aziz Menejer';

-- To create the user via SQL (requires knowing the encrypted password format):
-- Use the Supabase Dashboard → Authentication → Users → Invite / Add user instead.

SELECT 'Create menejer@demo.uz via Auth Dashboard with role=manager in metadata' AS note;
