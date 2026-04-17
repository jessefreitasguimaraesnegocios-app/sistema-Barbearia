-- Bucket público para fotos da vitrine (URLs curtas na BD em vez de base64 gigante).
-- RLS: leitura para todos; escrita só dono da loja (primeiro segmento do path = shops.id).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-media',
  'shop-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "shop_media_public_read" ON storage.objects;
CREATE POLICY "shop_media_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-media');

DROP POLICY IF EXISTS "shop_media_owner_insert" ON storage.objects;
CREATE POLICY "shop_media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND s.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "shop_media_owner_update" ON storage.objects;
CREATE POLICY "shop_media_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND s.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "shop_media_owner_delete" ON storage.objects;
CREATE POLICY "shop_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND s.owner_id = auth.uid()
  )
);
