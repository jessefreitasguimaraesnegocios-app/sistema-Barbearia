import type { SupabaseClient } from '@supabase/supabase-js';
import type { Professional, Product, Service, Shop } from '../../types';
import {
  flattenShopFinanceProvisionInShopRow,
  mapPartnerProductsFromRows,
  mapPartnerProfessionalsFromRows,
  mapPartnerServicesFromRows,
  mapPartnerShopFromBundle,
  mergePartnerShopScalarRow,
} from './mapPartnerShop';
import { mapClientCatalogRow } from './mapClientCatalogShop';
import { mapAdminShopRow } from './mapAdminShopRow';

export const SHOPS_SELECT_PARTNER_SINGLE =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, cnpj_cpf, email, phone, pix_key, split_percent, split_percent_sandbox, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, updated_at, shop_finance_provision(finance_provision_status, finance_provision_last_error)';

export const PROFESSIONALS_SELECT_PARTNER =
  'id, shop_id, name, specialty, avatar, email, phone, cpf_cnpj, birth_date, asaas_account_id, asaas_wallet_id, asaas_environment, split_percent, split_percent_sandbox, user_id, junior_price_percent';

/** Colunas usadas por `mapPartnerShopFromBundle` — evita `select('*')` (menos egress). */
export const SERVICES_SELECT_PARTNER_BUNDLE =
  'id, shop_id, name, description, price, duration';

export const PRODUCTS_SELECT_PARTNER_BUNDLE =
  'id, shop_id, name, description, price, promo_price, category, image, stock, catalog_item_id';

/**
 * Catálogo cliente (home/lista): só colunas de `shops` — profissionais vêm num segundo
 * `.in('shop_id', ids)` em `fetchClientCatalog*` (menos egress que embed PostgREST por loja).
 */
export const SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS =
  'id, updated_at, created_at, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes';

export const PROFESSIONALS_SELECT_CLIENT_CATALOG_LIST =
  'id, shop_id, name, specialty, avatar, junior_price_percent';

export const SERVICES_SELECT_CLIENT_CATALOG_DETAIL =
  'id, name, description, price, duration';

export const PRODUCTS_SELECT_CLIENT_CATALOG_DETAIL =
  'id, name, description, price, promo_price, category, image, stock, catalog_item_id';

/** @deprecated Usar `SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS` + batch em `professionals`. Mantido alias para leitores legados. */
export const SHOPS_SELECT_CLIENT_CATALOG_LIST = SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS;

/**
 * Catálogo cliente (detalhe): só colunas de `shops` — `fetchClientCatalogShopDetailById` faz
 * `services` / `professionals` / `products` em paralelo (evita um único JSON PostgREST enorme).
 */
export const SHOPS_SELECT_CLIENT_CATALOG_DETAIL = SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS;

/** Compat legado: catálogo da home/lista. */
export const SHOPS_SELECT_CLIENT_CATALOG = SHOPS_SELECT_CLIENT_CATALOG_LIST;

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

const CLIENT_CATALOG_PRO_SHOP_CHUNK = 80;

/** Agrupa linhas de `professionals` por `shop_id` e ordena por nome dentro de cada loja. */
function groupProfessionalsByShopId(
  rows: Record<string, unknown>[]
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const sid = r.shop_id != null ? String(r.shop_id) : '';
    if (!sid) continue;
    const list = map.get(sid) ?? [];
    list.push(r);
    map.set(sid, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'));
  }
  return map;
}

async function fetchClientCatalogProfessionalsForShopIds(
  client: SupabaseClient,
  shopIds: string[]
): Promise<Map<string, Record<string, unknown>[]>> {
  const unique = [...new Set(shopIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const merged: Record<string, unknown>[] = [];
  for (let i = 0; i < unique.length; i += CLIENT_CATALOG_PRO_SHOP_CHUNK) {
    const chunk = unique.slice(i, i + CLIENT_CATALOG_PRO_SHOP_CHUNK);
    const { data, error } = await client
      .from('professionals')
      .select(PROFESSIONALS_SELECT_CLIENT_CATALOG_LIST)
      .in('shop_id', chunk);
    if (error) throw error;
    if (data?.length) merged.push(...(data as Record<string, unknown>[]));
  }
  return groupProfessionalsByShopId(merged);
}

function sortClientCatalogChildrenByName(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'));
}

function buildClientCatalogEntries(
  shopRows: Record<string, unknown>[],
  professionalsByShopId: Map<string, Record<string, unknown>[]>
): ClientCatalogEntry[] {
  return shopRows.map((row) => {
    const id = String(row.id);
    const pros = professionalsByShopId.get(id) ?? [];
    return mapClientCatalogEntry({ ...row, professionals: pros });
  });
}

/**
 * Lista admin sem `asaas_runtime_mode` — use se a migration `20260419120000_shop_asaas_runtime_mode_override`
 * ainda não foi aplicada no projeto (PostgREST 400 ao pedir coluna inexistente).
 */
export const SHOPS_SELECT_ADMIN_CORE =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, asaas_customer_id, asaas_platform_subscription_id, cnpj_cpf, email, phone, pix_key, created_at, split_percent, split_percent_sandbox, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, shop_finance_provision(finance_provision_status, finance_provision_last_error)';

export const SHOPS_SELECT_ADMIN = `${SHOPS_SELECT_ADMIN_CORE},asaas_runtime_mode`;

function isMissingAsaasRuntimeModeColumnError(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''} ${error.code ?? ''}`;
  if (!/asaas_runtime_mode/i.test(blob)) return false;
  return (
    /does not exist|schema cache|Could not find|column.*not found|42703|PGRST204/i.test(blob) ||
    error.code === 'PGRST204'
  );
}

/** Lista admin paginada por nome. */
export const ADMIN_SHOPS_PAGE_SIZE = 30;

export type AdminShopsAggregateStats = {
  totalShops: number;
  activeSubscriptions: number;
  mrrEstimate: number;
};

/** Uma linha leve por loja — totais do painel admin sem carregar `SHOPS_SELECT_ADMIN` inteiro para todas. */
export async function fetchAdminShopsAggregateStats(client: SupabaseClient): Promise<AdminShopsAggregateStats> {
  const { data, error } = await client.from('shops').select('subscription_active, subscription_amount');
  if (error || !data) {
    return { totalShops: 0, activeSubscriptions: 0, mrrEstimate: 0 };
  }
  if (!data.length) {
    return { totalShops: 0, activeSubscriptions: 0, mrrEstimate: 0 };
  }
  const rows = data as { subscription_active?: boolean; subscription_amount?: number | null }[];
  const activeSubscriptions = rows.filter((r) => r.subscription_active).length;
  const mrrEstimate = rows
    .filter((r) => r.subscription_active)
    .reduce((sum, r) => sum + (Number(r.subscription_amount) || 99), 0);
  return { totalShops: rows.length, activeSubscriptions, mrrEstimate };
}

export async function fetchShopsForAdminPage(
  client: SupabaseClient,
  from: number,
  to: number
): Promise<{ shops: Shop[]; hasMore: boolean }> {
  let res = await client
    .from('shops')
    .select(SHOPS_SELECT_ADMIN)
    .order('name', { ascending: true })
    .range(from, to);

  if (res.error && isMissingAsaasRuntimeModeColumnError(res.error)) {
    res = (await client
      .from('shops')
      .select(SHOPS_SELECT_ADMIN_CORE)
      .order('name', { ascending: true })
      .range(from, to)) as typeof res;
  }

  const { data, error } = res;
  if (error || !data?.length) return { shops: [], hasMore: false };
  const rows = data as Record<string, unknown>[];
  const hasMore = rows.length === to - from + 1;
  return {
    shops: rows.map((row) => mapAdminShopRow(row)),
    hasMore,
  };
}

export type FetchPartnerShopBundleResult =
  | { ok: true; shop: Shop }
  | { ok: false; error: string };

export async function fetchPartnerShopBundle(
  client: SupabaseClient,
  shopId: string
): Promise<FetchPartnerShopBundleResult> {
  const { data: shopRowRaw, error: shopErr } = await client
    .from('shops')
    .select(SHOPS_SELECT_PARTNER_SINGLE)
    .eq('id', shopId)
    .single();
  if (shopErr || !shopRowRaw) {
    return { ok: false, error: shopErr?.message ?? 'not_found' };
  }

  const shopRow = flattenShopFinanceProvisionInShopRow(shopRowRaw as Record<string, unknown>);

  const [servicesRes, professionalsRes, productsRes] = await Promise.all([
    client.from('services').select(SERVICES_SELECT_PARTNER_BUNDLE).eq('shop_id', shopId),
    client.from('professionals').select(PROFESSIONALS_SELECT_PARTNER).eq('shop_id', shopId),
    client.from('products').select(PRODUCTS_SELECT_PARTNER_BUNDLE).eq('shop_id', shopId),
  ]);

  const shop = mapPartnerShopFromBundle({
    ...shopRow,
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
    .select(SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS)
    .order('name', { ascending: true })
    .range(from, to);
  if (error) throw error;
  if (!data?.length) return [];
  const shopRows = data as Record<string, unknown>[];
  const ids = shopRows.map((r) => String(r.id));
  const prosByShop = await fetchClientCatalogProfessionalsForShopIds(client, ids);
  return buildClientCatalogEntries(shopRows, prosByShop);
}

/** Lojas alteradas desde o último sync (usa `shops.updated_at`, atualizado também por mudanças no catálogo filho). */
export async function fetchClientCatalogUpdatedSince(client: SupabaseClient, sinceIso: string): Promise<ClientCatalogEntry[]> {
  const { data, error } = await client
    .from('shops')
    .select(SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS)
    .gt('updated_at', sinceIso)
    .order('updated_at', { ascending: true });
  if (error) throw error;
  if (!data?.length) return [];
  const shopRows = data as Record<string, unknown>[];
  const ids = shopRows.map((r) => String(r.id));
  const prosByShop = await fetchClientCatalogProfessionalsForShopIds(client, ids);
  return buildClientCatalogEntries(shopRows, prosByShop);
}

const CLIENT_CATALOG_ID_PAGE_SIZE = 1000;

/** IDs de todas as lojas (só `id`) — leve; usado para podar cache/localStorage após deletes. */
export async function fetchClientCatalogShopIdsAll(client: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from('shops')
      .select('id')
      .order('name', { ascending: true })
      .range(from, from + CLIENT_CATALOG_ID_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data as { id: unknown }[]) ids.add(String(row.id));
    if (data.length < CLIENT_CATALOG_ID_PAGE_SIZE) break;
    from += CLIENT_CATALOG_ID_PAGE_SIZE;
  }
  return ids;
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
      .select(SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS)
      .in('id', chunk);
    if (error) throw error;
    if (data?.length) {
      const shopRows = data as Record<string, unknown>[];
      const prosByShop = await fetchClientCatalogProfessionalsForShopIds(
        client,
        shopRows.map((r) => String(r.id))
      );
      out.push(...buildClientCatalogEntries(shopRows, prosByShop));
    }
  }
  return out;
}

/** Carrega uma loja completa para a tela de detalhe do cliente (serviços + produtos). */
export async function fetchClientCatalogShopDetailById(
  client: SupabaseClient,
  shopId: string
): Promise<Shop | null> {
  const sid = shopId.trim();
  if (!sid) return null;

  const [shopRes, servicesRes, professionalsRes, productsRes] = await Promise.all([
    client.from('shops').select(SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS).eq('id', sid).maybeSingle(),
    client.from('services').select(SERVICES_SELECT_CLIENT_CATALOG_DETAIL).eq('shop_id', sid),
    client.from('professionals').select(PROFESSIONALS_SELECT_CLIENT_CATALOG_LIST).eq('shop_id', sid),
    client.from('products').select(PRODUCTS_SELECT_CLIENT_CATALOG_DETAIL).eq('shop_id', sid),
  ]);

  if (shopRes.error || !shopRes.data) return null;
  if (servicesRes.error) throw servicesRes.error;
  if (professionalsRes.error) throw professionalsRes.error;
  if (productsRes.error) throw productsRes.error;

  const merged = {
    ...(shopRes.data as Record<string, unknown>),
    services: sortClientCatalogChildrenByName((servicesRes.data ?? []) as Record<string, unknown>[]),
    professionals: sortClientCatalogChildrenByName((professionalsRes.data ?? []) as Record<string, unknown>[]),
    products: sortClientCatalogChildrenByName((productsRes.data ?? []) as Record<string, unknown>[]),
  };
  return mapClientCatalogRow(merged);
}

/** @deprecated Prefer `fetchShopsForAdminPage` + `fetchAdminShopsAggregateStats` (menos egress). */
export async function fetchShopsForAdmin(client: SupabaseClient): Promise<Shop[]> {
  const merged: Shop[] = [];
  let from = 0;
  for (;;) {
    const { shops, hasMore } = await fetchShopsForAdminPage(client, from, from + ADMIN_SHOPS_PAGE_SIZE - 1);
    if (!shops.length) break;
    merged.push(...shops);
    if (!hasMore) break;
    from += ADMIN_SHOPS_PAGE_SIZE;
  }
  return merged;
}

export async function fetchPartnerShopRowOnly(
  client: SupabaseClient,
  shopId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from('shops')
    .select(SHOPS_SELECT_PARTNER_SINGLE)
    .eq('id', shopId)
    .single();
  if (error || !data) return null;
  return flattenShopFinanceProvisionInShopRow(data as Record<string, unknown>);
}

export async function fetchPartnerServicesForShop(client: SupabaseClient, shopId: string): Promise<Service[]> {
  const { data, error } = await client.from('services').select(SERVICES_SELECT_PARTNER_BUNDLE).eq('shop_id', shopId);
  if (error || !data?.length) return [];
  return mapPartnerServicesFromRows(data as Record<string, unknown>[]);
}

export async function fetchPartnerProfessionalsForShop(
  client: SupabaseClient,
  shopId: string,
  shopSplit: number
): Promise<Professional[]> {
  const { data, error } = await client.from('professionals').select(PROFESSIONALS_SELECT_PARTNER).eq('shop_id', shopId);
  if (error || !data?.length) return [];
  return mapPartnerProfessionalsFromRows(data as Record<string, unknown>[], shopSplit);
}

export async function fetchPartnerProductsForShop(client: SupabaseClient, shopId: string): Promise<Product[]> {
  const { data, error } = await client.from('products').select(PRODUCTS_SELECT_PARTNER_BUNDLE).eq('shop_id', shopId);
  if (error || !data?.length) return [];
  return mapPartnerProductsFromRows(data as Record<string, unknown>[]);
}
