import type { SupabaseClient } from '@supabase/supabase-js';
import { resizeImageFileToJpegDataUrl } from './imageResize';

export const SHOP_MEDIA_BUCKET = 'shop-media';

export type ShopMediaUploadKind = 'SHOP_PROFILE' | 'SHOP_BANNER' | 'PRO' | 'PRODUCT';

const RESIZE: Record<
  ShopMediaUploadKind,
  { maxWidth: number; maxHeight: number; quality: number }
> = {
  SHOP_PROFILE: { maxWidth: 512, maxHeight: 512, quality: 0.82 },
  SHOP_BANNER: { maxWidth: 1600, maxHeight: 560, quality: 0.82 },
  PRO: { maxWidth: 400, maxHeight: 400, quality: 0.85 },
  PRODUCT: { maxWidth: 960, maxHeight: 960, quality: 0.82 },
};

function objectPath(shopId: string, kind: ShopMediaUploadKind, entityId?: string): string | null {
  if (kind === 'SHOP_PROFILE') return `${shopId}/profile.jpg`;
  if (kind === 'SHOP_BANNER') return `${shopId}/banner.jpg`;
  if (!entityId || entityId.includes('/') || entityId.includes('..')) return null;
  if (kind === 'PRO') return `${shopId}/professionals/${entityId}.jpg`;
  return `${shopId}/products/${entityId}.jpg`;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function resizeShopMediaToDataUrl(
  kind: ShopMediaUploadKind,
  file: File
): Promise<{ dataUrl: string } | { error: string }> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'Arquivo muito grande (máx. 5 MB).' };
  }
  const resize = RESIZE[kind];
  const dataUrl = await resizeImageFileToJpegDataUrl(file, {
    ...resize,
    maxFileBytes: MAX_FILE_BYTES,
  });
  if (!dataUrl) {
    return { error: 'Não foi possível processar esta imagem. Use JPEG ou PNG.' };
  }
  return { dataUrl };
}

/**
 * Redimensiona, envia para Storage (`shop-media`) e devolve URL pública (com query `v=` para bust de cache).
 */
export async function uploadShopMediaAndGetPublicUrl(
  client: SupabaseClient,
  shopId: string,
  kind: ShopMediaUploadKind,
  file: File,
  entityId?: string
): Promise<{ publicUrl: string; dataUrl: string } | { error: string; dataUrl?: string }> {
  if (!shopId || shopId.includes('/') || shopId.includes('..')) {
    return { error: 'Loja inválida para envio da imagem.' };
  }
  if (kind === 'PRO' || kind === 'PRODUCT') {
    if (!entityId) return { error: 'Identificador do item em falta.' };
  }

  const path = objectPath(shopId, kind, entityId);
  if (!path) return { error: 'Caminho de armazenamento inválido.' };

  const resized = await resizeShopMediaToDataUrl(kind, file);
  if ('error' in resized) {
    return { error: resized.error };
  }
  const dataUrl = resized.dataUrl;

  const blob = await fetch(dataUrl).then((r) => r.blob());
  const { error: upErr } = await client.storage.from(SHOP_MEDIA_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) {
    return {
      error: upErr.message || 'Falha ao enviar imagem. Verifique se o bucket shop-media existe no projeto.',
      dataUrl,
    };
  }

  const { data } = client.storage.from(SHOP_MEDIA_BUCKET).getPublicUrl(path);
  const base = data.publicUrl;
  const publicUrl = `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;
  return { publicUrl, dataUrl };
}
