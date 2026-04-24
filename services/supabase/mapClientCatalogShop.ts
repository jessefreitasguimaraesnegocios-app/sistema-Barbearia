import type { Product, Shop } from '../../types';
import { juniorPricePercentFromDb } from '../../lib/juniorServicePrice';
import { normalizeStoreCategories } from '../../lib/storeCategories';
import { formatDbTime } from './_format';

/** Uma linha de `products` (mesmo shape do embed no catálogo cliente). */
export function mapClientCatalogProductRow(p: Record<string, unknown>): Product {
  return {
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
  };
}

/** Linha de `shops` com embed de services, professionals, products (catálogo cliente). */
export function mapClientCatalogRow(s: Record<string, unknown>): Shop {
  return {
    id: String(s.id),
    shareCode: s.share_code != null ? String(s.share_code) : undefined,
    ownerId: String(s.owner_id),
    name: String(s.name || ''),
    type: (s.type as Shop['type']) || 'BARBER',
    description: String(s.description || ''),
    address: String(s.address || ''),
    cnpjOrCpf: s.cnpj_cpf != null ? String(s.cnpj_cpf) : undefined,
    pixKey: s.pix_key != null ? String(s.pix_key) : undefined,
    profileImage: String(s.profile_image || ''),
    bannerImage: String(s.banner_image || ''),
    primaryColor: String(s.primary_color || '#1a1a1a'),
    theme: (s.theme as Shop['theme']) || 'MODERN',
    subscriptionActive: Boolean(s.subscription_active),
    subscriptionAmount: s.subscription_amount != null ? Number(s.subscription_amount) : 99,
    splitPercent: s.split_percent != null ? Number(s.split_percent) : undefined,
    passFeesToCustomer: s.pass_fees_to_customer === true,
    rating: s.rating != null ? Number(s.rating) : 5,
    asaasAccountId: s.asaas_account_id != null ? String(s.asaas_account_id) : undefined,
    asaasWalletId: s.asaas_wallet_id != null ? String(s.asaas_wallet_id) : undefined,
    workdayStart: s.workday_start != null ? formatDbTime(s.workday_start) ?? '08:00' : '08:00',
    workdayEnd: s.workday_end != null ? formatDbTime(s.workday_end) ?? '20:00' : '20:00',
    lunchStart:
      s.lunch_start != null && String(s.lunch_start).trim() !== ''
        ? formatDbTime(s.lunch_start) ?? undefined
        : undefined,
    lunchEnd:
      s.lunch_end != null && String(s.lunch_end).trim() !== ''
        ? formatDbTime(s.lunch_end) ?? undefined
        : undefined,
    agendaSlotMinutes:
      s.agenda_slot_minutes != null && Number(s.agenda_slot_minutes) > 0
        ? Number(s.agenda_slot_minutes)
        : 30,
    storeCategories: normalizeStoreCategories(s.store_categories),
    rowUpdatedAt: s.updated_at != null ? String(s.updated_at) : undefined,
    services: ((s.services as Record<string, unknown>[]) || []).map((sv) => ({
      id: String(sv.id),
      name: String(sv.name),
      description: String(sv.description || ''),
      price: Number(sv.price),
      duration: Number(sv.duration),
    })),
    professionals: ((s.professionals as Record<string, unknown>[]) || []).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      specialty: String(p.specialty || ''),
      avatar: String(p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(String(p.name))}`),
      juniorPricePercent: juniorPricePercentFromDb(p.junior_price_percent),
    })),
    products: ((s.products as Record<string, unknown>[]) || []).map((p) => mapClientCatalogProductRow(p)),
  } as Shop;
}
