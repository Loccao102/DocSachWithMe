-- Run this in Supabase SQL Editor if the private books bucket already exists.
-- New projects should use supabase/schema.sql instead.
update storage.buckets
set allowed_mime_types = array['application/pdf','application/json','application/epub+zip']
where id='books';
