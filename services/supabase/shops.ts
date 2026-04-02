import type { SupabaseClient } from '@supabase/supabase-js';
import type { Shop } from '../../types';
import { mapPartnerShopFromBundle } from './mapPartnerShop';
import { mapClientCatalogRow } from './mapClientCatalogShop';
import { mapAdminShopRow } from './mapAdminShopRow';

export const SHOPS_SELECT_PARTNER_SINGLE =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, cnpj_cpf, email, phone, pix_key, split_percent, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured';

export const PROFESSIONALS_SELECT_PARTNER =
  'id, shop_id, name, specialty, avatar, email, phone, cpf_cnpj, birth_date, asaas_account_id, asaas_wallet_id, asaas_environment, split_percent, user_id';

export const SHOPS_SELECT_CLIENT_CATALOG =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, cnpj_cpf, email, phone, pix_key, split_percent, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, services(id, name, description, price, duration), professionals(id, name, specialty, avatar), products(id, name, description, price, promo_price, category, image, stock)';

export const SHOPS_SELECT_ADMIN =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, asaas_customer_id, cnpj_cpf, email, phone, pix_key, created_at, split_percent, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, finance_provision_status, finance_provision_last_error';

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
  const { data } = await client.from('shops').select(SHOPS_SELECT_CLIENT_CATALOG);
  if (!data?.length) return [];
  return data.map((row) => mapClientCatalogRow(row as Record<string, unknown>));
}

export async function fetchShopsForAdmin(client: SupabaseClient): Promise<Shop[]> {
  const { data } = await client.from('shops').select(SHOPS_SELECT_ADMIN);
  if (!data?.length) return [];
  return data.map((row) => mapAdminShopRow(row as Record<string, unknown>));
}
