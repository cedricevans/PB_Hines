-- Run this after hines-family-schema.sql and hines-admin-workflow.sql
-- Requires cedric.evans@gmail.com to already exist in auth.users

select hines.promote_existing_user('cedric.evans@gmail.com', 'hines', 'owner', true);
