import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShopType } from '../../types';

export type ProductCatalogItemRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  defaultImage: string | null;
  sortOrder: number;
};

export type ProductCatalogCategoryRow = {
  id: string;
  shopType: ShopType;
  name: string;
  sortOrder: number;
  items: ProductCatalogItemRow[];
};

/**
 * Catálogo global (uma linha por produto “tipo”) filtrado pelo tipo da loja.
 * Duas queries para evitar ambiguidade de embed PostgREST.
 */
export async function fetchProductCatalogForShopType(
  client: SupabaseClient,
  shopType: ShopType
): Promise<ProductCatalogCategoryRow[]> {
  const { data: cats, error: cErr } = await client
    .from('product_catalog_categories')
    .select('id, shop_type, name, sort_order')
    .eq('shop_type', shopType)
    .order('sort_order', { ascending: true });

  if (cErr || !cats?.length) return [];

  const ids = cats.map((c) => String((c as { id: unknown }).id));
  const { data: items, error: iErr } = await client
    .from('product_catalog_items')
    .select('id, category_id, name, description, default_image, sort_order')
    .in('category_id', ids)
    .order('sort_order', { ascending: true });

  if (iErr) return [];

  const byCat = new Map<string, ProductCatalogItemRow[]>();
  for (const row of (items || []) as Record<string, unknown>[]) {
    const cid = String(row.category_id);
    const list = byCat.get(cid) ?? [];
    list.push({
      id: String(row.id),
      categoryId: cid,
      name: String(row.name),
      description: String(row.description || ''),
      defaultImage: row.default_image != null ? String(row.default_image) : null,
      sortOrder: Number(row.sort_order) || 0,
    });
    byCat.set(cid, list);
  }

  return (cats as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    shopType: (String(c.shop_type) as ShopType) || 'BARBER',
    name: String(c.name),
    sortOrder: Number(c.sort_order) || 0,
    items: byCat.get(String(c.id)) ?? [],
  }));
}
