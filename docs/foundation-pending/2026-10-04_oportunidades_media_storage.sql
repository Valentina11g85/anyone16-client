-- Oportunidades — private Storage for listing photos and portfolio files.
-- Pending: run in Foundation (SQL editor). The client already uploads to this bucket.
-- Paths: <author_profile_id>/<listing_id>/<photos|portfolio>/<file>

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-listing-media', 'service-listing-media', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Upload only inside your own profile folder.
DROP POLICY IF EXISTS service_listing_media_insert ON storage.objects;
CREATE POLICY service_listing_media_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-listing-media'
  AND (storage.foldername(name))[1] = public.current_profile_id()::text
);

-- Read: the author, or anyone who can already see the listing under service_listings RLS.
DROP POLICY IF EXISTS service_listing_media_select ON storage.objects;
CREATE POLICY service_listing_media_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-listing-media'
  AND (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    OR EXISTS (
      SELECT 1 FROM public.service_listings l
      WHERE l.id::text = (storage.foldername(name))[2]
        AND l.profile_id::text = (storage.foldername(name))[1]
    )
  )
);

-- Delete only your own files.
DROP POLICY IF EXISTS service_listing_media_delete ON storage.objects;
CREATE POLICY service_listing_media_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'service-listing-media'
  AND (storage.foldername(name))[1] = public.current_profile_id()::text
);
