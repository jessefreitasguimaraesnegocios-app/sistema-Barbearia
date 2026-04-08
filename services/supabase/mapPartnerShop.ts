import type { Shop } from '../../types';
import { formatDbTime, normalizeSplitPercent } from './_format';

/** Mapeia loja + relações (parceiro) a partir do bundle já carregado do PostgREST. */
export function mapPartnerShopFromBundle(d: Record<string, unknown> & { services?: unknown[]; professionals?: unknown[]; products?: unknown[] }): Shop {
  const rawServices = (d.services || []) as Record<string, unknown>[];
  const rawProfessionals = (d.professionals || []) as Record<string, unknown>[];
  const rawProducts = (d.products || []) as Record<string, unknown>[];

  const dedupeByKey = <T extends Record<string, unknown>>(arr: T[], keyFn: (x: T) => string): T[] => {
    const seen = new Set<string>();
    return arr.filter((x) => {
      const k = keyFn(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const services = dedupeByKey(rawServices as Record<string, unknown>[], (s) => `${s.name}|${Number(s.price)}|${Number(s.duration)}`).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ''),
    price: Number(s.price),
    duration: Number(s.duration),
  }));

  const shopSplit = d.split_percent != null ? Number(d.split_percent) : 95;
  const shopSplitSandbox =
    d.split_percent_sandbox != null ? Number(d.split_percent_sandbox) : null;
  const professionals = dedupeByKey(rawProfessionals as Record<string, unknown>[], (p) =>
    `${String(p.name || '').trim()}|${String(p.specialty || '').trim()}`
  ).map((p) => ({
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
    authUserId: (p.user_id as string | null | undefined) ?? null,
  }));

  const products = dedupeByKey(rawProducts as Record<string, unknown>[], (p) =>
    `${String(p.name || '').trim()}|${Number(p.price)}|${String(p.category || 'Geral').trim()}`
  ).map((p) => ({
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
  }));

  return {
    id: String(d.id),
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
    splitPercent: d.split_percent != null ? Number(d.split_percent) : 95,
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
  };
}
