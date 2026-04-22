import type { Professional, Product, Service, Shop } from '../../types';
import { juniorPricePercentFromDb } from '../../lib/juniorServicePrice';
import { formatDbTime, normalizeSplitPercent } from './_format';

/** Achata embed PostgREST `shop_finance_provision(...)` para o shape esperado pelos mappers. */
export function flattenShopFinanceProvisionInShopRow(row: Record<string, unknown>): Record<string, unknown> {
  const emb = row.shop_finance_provision;
  const first = Array.isArray(emb)
    ? (emb[0] as Record<string, unknown> | undefined)
    : (emb as Record<string, unknown> | undefined);
  if (!first) return row;
  const { shop_finance_provision: _removed, ...rest } = row;
  return {
    ...rest,
    finance_provision_status: first.finance_provision_status,
    finance_provision_last_error: first.finance_provision_last_error,
  };
}

function dedupeByKey<T extends Record<string, unknown>>(arr: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function mapPartnerServicesFromRows(rawServices: Record<string, unknown>[]): Service[] {
  return dedupeByKey(rawServices, (s) => `${s.name}|${Number(s.price)}|${Number(s.duration)}`).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ''),
    price: Number(s.price),
    duration: Number(s.duration),
  }));
}

export function mapPartnerProfessionalsFromRows(
  rawProfessionals: Record<string, unknown>[],
  shopSplit: number
): Professional[] {
  return dedupeByKey(rawProfessionals, (p) => `${String(p.name || '').trim()}|${String(p.specialty || '').trim()}`).map(
    (p) => ({
      id: String(p.id),
      name: String(p.name),
      specialty: String(p.specialty || ''),
      avatar: String(p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(String(p.name))}`),
      email: String(p.email || ''),
      phone: String(p.phone || ''),
      cpfCnpj: String(p.cpf_cnpj || ''),
      birthDate: String(p.birth_date || ''),
      asaasAccountId: p.asaas_account_id != null ? String(p.asaas_account_id) : undefined,
      asaasWalletId: p.asaas_wallet_id != null ? String(p.asaas_wallet_id) : undefined,
      asaasEnvironment: p.asaas_environment as 'sandbox' | 'production' | undefined,
      splitPercent: normalizeSplitPercent(p.split_percent, shopSplit),
      splitPercentSandbox: p.split_percent_sandbox != null ? Number(p.split_percent_sandbox) : null,
      authUserId: (p.user_id as string | null | undefined) ?? null,
      juniorPricePercent: juniorPricePercentFromDb(p.junior_price_percent),
    })
  );
}

export function mapPartnerProductsFromRows(rawProducts: Record<string, unknown>[]): Product[] {
  return dedupeByKey(rawProducts, (p) => {
    const cid = p.catalog_item_id != null ? String(p.catalog_item_id).trim() : '';
    if (cid) return `cid:${cid}`;
    return `${String(p.name || '').trim()}|${Number(p.price)}|${String(p.category || 'Geral').trim()}`;
  }).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    description: String(p.description || ''),
    price: Number(p.price),
    promoPrice: p.promo_price != null ? Number(p.promo_price) : undefined,
    category: String(p.category || 'Geral'),
    image: String(
      p.image || 'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=1974'
    ),
    stock: Number(p.stock) || 0,
    catalogItemId: p.catalog_item_id != null ? String(p.catalog_item_id) : null,
  }));
}

/** Atualiza só metadados da loja (linha `shops`); mantém `services` / `professionals` / `products` de `prev`. */
export function mergePartnerShopScalarRow(prev: Shop, d: Record<string, unknown>): Shop {
  const shopSplit = d.split_percent != null ? Number(d.split_percent) : prev.splitPercent ?? 95;
  const shopSplitSandbox =
    d.split_percent_sandbox != null ? Number(d.split_percent_sandbox) : prev.splitPercentSandbox ?? null;
  return {
    ...prev,
    id: String(d.id ?? prev.id),
    shareCode: d.share_code != null ? String(d.share_code) : prev.shareCode,
    ownerId: String(d.owner_id ?? prev.ownerId),
    name: String(d.name || prev.name),
    type: (d.type as Shop['type']) || prev.type,
    description: String(d.description ?? prev.description),
    address: String(d.address ?? prev.address),
    profileImage: String(d.profile_image ?? prev.profileImage),
    bannerImage: String(d.banner_image ?? prev.bannerImage),
    primaryColor: String(d.primary_color ?? prev.primaryColor),
    theme: (d.theme as Shop['theme']) || prev.theme,
    subscriptionActive: d.subscription_active != null ? Boolean(d.subscription_active) : prev.subscriptionActive,
    subscriptionAmount: d.subscription_amount != null ? Number(d.subscription_amount) : prev.subscriptionAmount,
    splitPercent: shopSplit,
    splitPercentSandbox: shopSplitSandbox,
    passFeesToCustomer: d.pass_fees_to_customer != null ? d.pass_fees_to_customer === true : prev.passFeesToCustomer,
    rating: d.rating != null ? Number(d.rating) : prev.rating,
    asaasWalletId: d.asaas_wallet_id != null ? String(d.asaas_wallet_id) : prev.asaasWalletId,
    asaasAccountId: d.asaas_account_id != null ? String(d.asaas_account_id) : prev.asaasAccountId,
    asaasApiKeyConfigured: d.asaas_api_key_configured != null ? d.asaas_api_key_configured === true : prev.asaasApiKeyConfigured,
    financeProvisionStatus:
      (d.finance_provision_status as Shop['financeProvisionStatus'] | undefined) ?? prev.financeProvisionStatus,
    financeProvisionLastError:
      d.finance_provision_last_error != null ? String(d.finance_provision_last_error) : prev.financeProvisionLastError,
    cnpjOrCpf: d.cnpj_cpf != null ? String(d.cnpj_cpf) : prev.cnpjOrCpf,
    email: d.email != null ? String(d.email) : prev.email,
    phone: d.phone != null ? String(d.phone) : prev.phone,
    pixKey: d.pix_key != null ? String(d.pix_key) : prev.pixKey,
    workdayStart: formatDbTime(d.workday_start) ?? prev.workdayStart ?? '08:00',
    workdayEnd: formatDbTime(d.workday_end) ?? prev.workdayEnd ?? '20:00',
    lunchStart: formatDbTime(d.lunch_start) ?? prev.lunchStart,
    lunchEnd: formatDbTime(d.lunch_end) ?? prev.lunchEnd,
    agendaSlotMinutes:
      d.agenda_slot_minutes != null && Number(d.agenda_slot_minutes) > 0
        ? Number(d.agenda_slot_minutes)
        : prev.agendaSlotMinutes ?? 30,
    rowUpdatedAt: d.updated_at != null ? String(d.updated_at) : prev.rowUpdatedAt,
  };
}

/** Mapeia loja + relações (parceiro) a partir do bundle já carregado do PostgREST. */
export function mapPartnerShopFromBundle(d: Record<string, unknown> & { services?: unknown[]; professionals?: unknown[]; products?: unknown[] }): Shop {
  const rawServices = (d.services || []) as Record<string, unknown>[];
  const rawProfessionals = (d.professionals || []) as Record<string, unknown>[];
  const rawProducts = (d.products || []) as Record<string, unknown>[];

  const shopSplit = d.split_percent != null ? Number(d.split_percent) : 95;
  const shopSplitSandbox = d.split_percent_sandbox != null ? Number(d.split_percent_sandbox) : null;
  const services = mapPartnerServicesFromRows(rawServices);
  const professionals = mapPartnerProfessionalsFromRows(rawProfessionals, shopSplit);
  const products = mapPartnerProductsFromRows(rawProducts);

  return {
    id: String(d.id),
    shareCode: d.share_code != null ? String(d.share_code) : undefined,
    ownerId: String(d.owner_id),
    name: String(d.name || ''),
    type: (d.type as Shop['type']) || 'BARBER',
    description: String(d.description || ''),
    address: String(d.address || ''),
    profileImage: String(d.profile_image || ''),
    bannerImage: String(d.banner_image || ''),
    primaryColor: String(d.primary_color || '#1a1a1a'),
    theme: (d.theme as Shop['theme']) || 'MODERN',
    services,
    professionals,
    products,
    subscriptionActive: Boolean(d.subscription_active),
    subscriptionAmount: d.subscription_amount != null ? Number(d.subscription_amount) : 99,
    splitPercent: shopSplit,
    splitPercentSandbox: shopSplitSandbox,
    passFeesToCustomer: d.pass_fees_to_customer === true,
    rating: d.rating != null ? Number(d.rating) : 5,
    asaasWalletId: d.asaas_wallet_id != null ? String(d.asaas_wallet_id) : undefined,
    asaasAccountId: d.asaas_account_id != null ? String(d.asaas_account_id) : undefined,
    asaasApiKeyConfigured: d.asaas_api_key_configured === true,
    financeProvisionStatus: d.finance_provision_status as Shop['financeProvisionStatus'] | undefined,
    financeProvisionLastError:
      d.finance_provision_last_error != null ? String(d.finance_provision_last_error) : undefined,
    cnpjOrCpf: d.cnpj_cpf != null ? String(d.cnpj_cpf) : undefined,
    email: d.email != null ? String(d.email) : undefined,
    phone: d.phone != null ? String(d.phone) : undefined,
    pixKey: d.pix_key != null ? String(d.pix_key) : undefined,
    workdayStart: formatDbTime(d.workday_start) ?? '08:00',
    workdayEnd: formatDbTime(d.workday_end) ?? '20:00',
    lunchStart: formatDbTime(d.lunch_start) ?? undefined,
    lunchEnd: formatDbTime(d.lunch_end) ?? undefined,
    agendaSlotMinutes:
      d.agenda_slot_minutes != null && Number(d.agenda_slot_minutes) > 0
        ? Number(d.agenda_slot_minutes)
        : 30,
    rowUpdatedAt: d.updated_at != null ? String(d.updated_at) : undefined,
  };
}
