import type { Order } from '../../types';

export const ORDERS_SELECT_CLIENT =
  'id, client_id, shop_id, items, total, status, created_at';

/** Mapeia linha Supabase (snake_case) → modelo da app. Usado em fetches e Realtime. */
export function mapRowToOrder(r: Record<string, unknown>): Order {
  const created = r.created_at != null ? String(r.created_at) : '';
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    shopId: String(r.shop_id),
    items: Array.isArray(r.items) ? (r.items as Order['items']) : [],
    total: Number(r.total),
    status: (r.status as Order['status']) || 'PENDING',
    date: created ? new Date(created).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
    createdAtIso: created || undefined,
  };
}

export function sortOrdersNewestFirst(list: Order[]): Order[] {
  const out = [...list];
  out.sort((a, b) => {
    const ta = a.createdAtIso ? Date.parse(a.createdAtIso) : 0;
    const tb = b.createdAtIso ? Date.parse(b.createdAtIso) : 0;
    return tb - ta;
  });
  return out;
}
