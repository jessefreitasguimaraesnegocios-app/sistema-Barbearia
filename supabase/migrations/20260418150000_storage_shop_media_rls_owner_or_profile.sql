-- Ajusta RLS do bucket shop-media para aceitar:
-- 1) dono da loja (shops.owner_id = auth.uid())
-- 2) utilizador vinculado ao perfil da loja (profiles.shop_id = shops.id)
-- Isso corrige cenários onde o dono opera com login de equipe/role vinculada.

DROP POLICY IF EXISTS "shop_media_owner_insert" ON storage.objects;
CREATE POLICY "shop_media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND (
        s.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.shop_id = s.id
            AND p.role IN ('admin', 'barbearia', 'profissional')
        )
      )
  )
);

DROP POLICY IF EXISTS "shop_media_owner_update" ON storage.objects;
CREATE POLICY "shop_media_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND (
        s.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.shop_id = s.id
            AND p.role IN ('admin', 'barbearia', 'profissional')
        )
      )
  )
)
WITH CHECK (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND (
        s.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.shop_id = s.id
            AND p.role IN ('admin', 'barbearia', 'profissional')
        )
      )
  )
);

DROP POLICY IF EXISTS "shop_media_owner_delete" ON storage.objects;
CREATE POLICY "shop_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shop-media'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = split_part(name, '/', 1)
      AND (
        s.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.shop_id = s.id
            AND p.role IN ('admin', 'barbearia', 'profissional')
        )
      )
  )
);
