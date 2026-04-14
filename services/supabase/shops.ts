import type { SupabaseClient } from '@supabase/supabase-js';
import type { Shop } from '../../types';
import { mapPartnerShopFromBundle } from './mapPartnerShop';
import { mapClientCatalogRow } from './mapClientCatalogShop';
import { mapAdminShopRow } from './mapAdminShopRow';

export const SHOPS_SELECT_PARTNER_SINGLE =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, cnpj_cpf, email, phone, pix_key, split_percent, split_percent_sandbox, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, finance_provision_status, finance_provision_last_error, updated_at';

export const PROFESSIONALS_SELECT_PARTNER =
  'id, shop_id, name, specialty, avatar, email, phone, cpf_cnpj, birth_date, asaas_account_id, asaas_wallet_id, asaas_environment, split_percent, split_percent_sandbox, user_id';

export const SHOPS_SELECT_CLIENT_CATALOG =
  'id, updated_at, created_at, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, cnpj_cpf, email, phone, pix_key, split_percent, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, services(id, name, description, price, duration), professionals(id, name, specialty, avatar), products(id, name, description, price, promo_price, category, image, stock)';

/** Tamanho de página para catálogo público (evita um único payload gigante). */
export const CLIENT_CATALOG_PAGE_SIZE = 80;

export type ClientCatalogEntry = { shop: Shop; rowUpdatedAt: string };

function mapClientCatalogEntry(row: Record<string, unknown>): ClientCatalogEntry {
  return {
    shop: mapClientCatalogRow(row),
    rowUpdatedAt:
      row.updated_at != null
        ? String(row.updated_at)
        : row.created_at != null
          ? String(row.created_at)
          : new Date().toISOString(),
  };
}

export const SHOPS_SELECT_ADMIN =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, asaas_customer_id, asaas_platform_subscription_id, cnpj_cpf, email, phone, pix_key, created_at, split_percent, split_percent_sandbox, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, finance_provision_status, finance_provision_last_error';

export type FetchPartnerShopBundleResult =
  | { ok: true; shop: Shop }
  | { ok: false; error: string };

export async function fetchPartnerShopBundle(
  client: SupabaseClient,
  shopId: string
): Promise<FetchPartnerShopBundleResult> {
  const { data: shopRow, error: shopErr } = await client
    .from('shops')
    .select(SHOPS_SELECT_PARTNER_SINGLE)
    .eq('id', shopId)
    .single();
  if (shopErr || !shopRow) {
    return { ok: false, error: shopErr?.message ?? 'not_found' };
  }

  const [servicesRes, professionalsRes, productsRes] = await Promise.all([
    client.from('services').select('*').eq('shop_id', shopId),
    client.from('professionals').select(PROFESSIONALS_SELECT_PARTNER).eq('shop_id', shopId),
    client.from('products').select('*').eq('shop_id', shopId),
  ]);

  const shop = mapPartnerShopFromBundle({
    ...(shopRow as Record<string, unknown>),
    services: servicesRes.data || [],
    professionals: professionalsRes.data || [],
    products: productsRes.data || [],
  });
  return { ok: true, shop };
}

export async function fetchShopsForClientCatalog(client: SupabaseClient): Promise<Shop[]> {
  const entries = await fetchClientCatalogAllPages(client);
  return entries.map((e) => e.shop);
}

/** Carrega o catálogo em páginas (nome ASC) — adequado a milhares de lojas. */
export async function fetchClientCatalogAllPages(client: SupabaseClient): Promise<ClientCatalogEntry[]> {
  const merged: ClientCatalogEntry[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchClientCatalogPage(client, from, from + CLIENT_CATALOG_PAGE_SIZE - 1);
    if (!page.length) break;
    merged.push(...page);
    if (page.length < CLIENT_CATALOG_PAGE_SIZE) break;
    from += CLIENT_CATALOG_PAGE_SIZE;
  }
  return merged;
}

export async function fetchClientCatalogPage(
  client: SupabaseClient,
  from: number,
  to: number
): Promise<ClientCatalogEntry[]> {
  const { data, error } = await client
    .from('shops')
    .select(SHOPS_SELECT_CLIENT_CATALOG)
    .order('name', { ascending: true })
    .range(from, to);
  if (error) throw error;
  if (!data?.length) return [];
  return data.map((row) => mapClientCatalogEntry(row as Record<string, unknown>));
}

/** Lojas alteradas desde o último sync (usa `shops.updated_at`, atualizado também por mudanças no catálogo filho). */
export async function fetchClientCatalogUpdatedSince(client: SupabaseClient, sinceIso: string): Promise<ClientCatalogEntry[]> {
  const { data, error } = await client
    .from('shops')
    .select(SHOPS_SELECT_CLIENT_CATALOG)
    .gt('updated_at', sinceIso)
    .order('updated_at', { ascending: true });
  if (error) throw error;
  if (!data?.length) return [];
  return data.map((row) => mapClientCatalogEntry(row as Record<string, unknown>));
}

const CLIENT_CATALOG_BY_ID_CHUNK = 40;

/** Refetch de lojas por id (Realtime): evita buraco do sync só com `gt(updated_at, maxGlobal)` quando outra loja tem carimbo mais recente. */
export async function fetchClientCatalogByShopIds(
  client: SupabaseClient,
  shopIds: string[]
): Promise<ClientCatalogEntry[]> {
  const unique = [...new Set(shopIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const out: ClientCatalogEntry[] = [];
  for (let i = 0; i < unique.length; i += CLIENT_CATALOG_BY_ID_CHUNK) {
    const chunk = unique.slice(i, i + CLIENT_CATALOG_BY_ID_CHUNK);
    const { data, error } = await client
      .from('shops')
      .select(SHOPS_SELECT_CLIENT_CATALOG)
      .in('id', chunk);
    if (error) throw error;
    if (data?.length) {
      out.push(...data.map((row) => mapClientCatalogEntry(row as Record<string, unknown>)));
    }
  }
  return out;
}

export async function fetchShopsForAdmin(client: SupabaseClient): Promise<Shop[]> {
  const { data } = await client.from('shops').select(SHOPS_SELECT_ADMIN);
  if (!data?.length) return [];
  return data.map((row) => mapAdminShopRow(row as Record<string, unknown>));
}
