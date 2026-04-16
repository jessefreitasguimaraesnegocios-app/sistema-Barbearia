import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, Order, ShopOrderHandoverItemSnapshot, ShopPartnerOrderRow } from '../../types';
import { mapRowToAppointment } from './appointmentMapping';

/** Cobre resumo financeiro (30 dias) + grade agenda (hoje + 15) com margem. */
export const PARTNER_APPOINTMENT_PAST_DAYS = 45;
export const PARTNER_APPOINTMENT_FUTURE_DAYS = 20;

/** Pedidos recentes por `created_at` (paginação); entregues de hoje são fundidos à parte. */
export const PARTNER_ORDERS_RECENT_PAGE_SIZE = 55;

/** Lista de pedidos: sem `handed_over_items_snapshot` (JSON pesado); hidratação em lote só para `DELIVERED`. */
export const PARTNER_ORDERS_SELECT =
  'id, client_id, shop_id, items, total, status, created_at, handed_over_at, handed_over_by_user_id, handed_over_by_label';

const PARTNER_ORDER_SNAPSHOT_CHUNK = 40;

async function hydratePartnerOrderHandoverSnapshots(
  client: SupabaseClient,
  shopId: string,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows;
  const deliveredIds = [
    ...new Set(
      rows
        .filter((r) => r.status === 'DELIVERED')
        .map((r) => String(r.id))
        .filter(Boolean)
    ),
  ];
  if (!deliveredIds.length) return rows;

  const snapById = new Map<string, unknown>();
  for (let i = 0; i < deliveredIds.length; i += PARTNER_ORDER_SNAPSHOT_CHUNK) {
    const chunk = deliveredIds.slice(i, i + PARTNER_ORDER_SNAPSHOT_CHUNK);
    const { data, error } = await client
      .from('orders')
      .select('id, handed_over_items_snapshot')
      .eq('shop_id', shopId)
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      snapById.set(String(r.id), r.handed_over_items_snapshot);
    }
  }

  return rows.map((r) => {
    if (r.status !== 'DELIVERED') return r;
    const id = String(r.id);
    if (!snapById.has(id)) return r;
    return { ...r, handed_over_items_snapshot: snapById.get(id) };
  });
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function partnerAgendaDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - PARTNER_APPOINTMENT_PAST_DAYS);
  const fut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + PARTNER_APPOINTMENT_FUTURE_DAYS);
  return { dateFrom: ymdLocal(past), dateTo: ymdLocal(fut) };
}

/** Início do dia civil local em ISO (UTC) — filtro `handed_over_at` para “retiradas hoje”. */
export function startOfLocalDayUtcIso(): string {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return n.toISOString();
}

function parseHandoverSnapshot(snap: unknown): ShopOrderHandoverItemSnapshot[] | null {
  if (!Array.isArray(snap)) return null;
  const parsed: ShopOrderHandoverItemSnapshot[] = [];
  for (const el of snap) {
    if (!el || typeof el !== 'object') continue;
    const x = el as Record<string, unknown>;
    const productId = String(x.productId ?? x.product_id ?? '').trim();
    if (!productId) continue;
    parsed.push({
      productId,
      quantity: Math.max(0, Math.floor(Number(x.quantity) || 0)),
      price: Number(x.price) || 0,
      name: x.name != null ? String(x.name) : undefined,
    });
  }
  return parsed.length ? parsed : null;
}

/** Mapeia linha `orders` + opcional perfil do cliente (Realtime / fetch). */
export function mapDbRowToShopPartnerOrderRow(
  r: Record<string, unknown>,
  prof?: { full_name?: string | null; avatar_url?: string | null } | null
): ShopPartnerOrderRow {
  const pid = String(r.client_id);
  const createdRaw = r.created_at ? String(r.created_at) : new Date().toISOString();
  const nameFromProf = prof?.full_name?.trim();
  const snap = parseHandoverSnapshot(r.handed_over_items_snapshot);
  return {
    id: String(r.id),
    clientId: pid,
    shopId: String(r.shop_id),
    items: Array.isArray(r.items) ? (r.items as Order['items']) : [],
    total: Number(r.total) || 0,
    status: (r.status as Order['status']) || 'PENDING',
    date: new Date(createdRaw).toLocaleDateString('pt-BR'),
    createdAtIso: createdRaw,
    clientDisplayName: nameFromProf || `Cliente #${pid.slice(0, 8)}`,
    clientAvatarUrl: prof?.avatar_url?.trim() || null,
    handedOverAtIso: r.handed_over_at != null ? String(r.handed_over_at) : null,
    handedOverByUserId: r.handed_over_by_user_id != null ? String(r.handed_over_by_user_id) : null,
    handedOverByLabel: r.handed_over_by_label != null ? String(r.handed_over_by_label) : null,
    handedOverItemsSnapshot: snap?.length ? snap : null,
  };
}

async function mapOrderRowsWithProfiles(
  client: SupabaseClient,
  ordRows: Record<string, unknown>[]
): Promise<ShopPartnerOrderRow[]> {
  if (!ordRows.length) return [];
  const clientIds = [...new Set(ordRows.map((r) => String((r as { client_id: string }).client_id)))];
  const profById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
  if (clientIds.length > 0) {
    const { data: profs } = await client.from('profiles').select('id, full_name, avatar_url').in('id', clientIds);
    for (const p of profs ?? []) {
      const row = p as { id: string; full_name?: string | null; avatar_url?: string | null };
      profById.set(String(row.id), { full_name: row.full_name, avatar_url: row.avatar_url });
    }
  }
  return ordRows.map((r) => mapDbRowToShopPartnerOrderRow(r, profById.get(String(r.client_id))));
}

function mergeOrderRowsById(primary: Record<string, unknown>[], extra: Record<string, unknown>[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const r of primary) {
    if (r.id != null) map.set(String(r.id), r);
  }
  for (const r of extra) {
    if (r.id != null) map.set(String(r.id), r);
  }
  return [...map.values()];
}

export function sortPartnerOrdersNewestFirst(list: ShopPartnerOrderRow[]): ShopPartnerOrderRow[] {
  const out = [...list];
  out.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  return out;
}

export async function fetchPartnerAppointments(
  client: SupabaseClient,
  shopId: string,
  staffProfessionalId: string | undefined
): Promise<Appointment[]> {
  const { dateFrom, dateTo } = partnerAgendaDateRange();
  let q = client
    .from('appointments')
    .select('id, client_id, shop_id, service_id, professional_id, date, time, status, amount')
    .eq('shop_id', shopId)
    .gte('date', dateFrom)
    .lte('date', dateTo);
  if (staffProfessionalId) q = q.eq('professional_id', staffProfessionalId);
  const { data: aptRows, error } = await q.order('date', { ascending: true }).order('time', { ascending: true });
  if (error || !aptRows) return [];
  return aptRows.map((r) => mapRowToAppointment(r as Record<string, unknown>));
}

/** Página de pedidos por `created_at` (desc). */
export async function fetchPartnerOrdersRecentPage(
  client: SupabaseClient,
  shopId: string,
  rangeFrom: number,
  rangeTo: number
): Promise<{ rows: Record<string, unknown>[]; hasMore: boolean }> {
  const { data: ordRows, error } = await client
    .from('orders')
    .select(PARTNER_ORDERS_SELECT)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo);
  if (error || !ordRows) return { rows: [], hasMore: false };
  const hasMore = ordRows.length === rangeTo - rangeFrom + 1;
  const hydrated = await hydratePartnerOrderHandoverSnapshots(client, shopId, ordRows as Record<string, unknown>[]);
  return { rows: hydrated, hasMore };
}

/** Entregues com `handed_over_at` a partir do início do dia local (painel “hoje”). */
export async function fetchPartnerOrdersDeliveredSince(
  client: SupabaseClient,
  shopId: string,
  sinceIso: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from('orders')
    .select(PARTNER_ORDERS_SELECT)
    .eq('shop_id', shopId)
    .eq('status', 'DELIVERED')
    .gte('handed_over_at', sinceIso)
    .order('handed_over_at', { ascending: false });
  if (error || !data?.length) return [];
  return hydratePartnerOrderHandoverSnapshots(client, shopId, data as Record<string, unknown>[]);
}

export async function fetchPartnerOrdersWithProfiles(
  client: SupabaseClient,
  shopId: string
): Promise<ShopPartnerOrderRow[]> {
  const { rows } = await fetchPartnerOrdersRecentPage(client, shopId, 0, PARTNER_ORDERS_RECENT_PAGE_SIZE - 1);
  const delivered = await fetchPartnerOrdersDeliveredSince(client, shopId, startOfLocalDayUtcIso());
  const merged = mergeOrderRowsById(rows, delivered);
  return sortPartnerOrdersNewestFirst(await mapOrderRowsWithProfiles(client, merged));
}

export async function appendPartnerOrdersRecentPage(
  client: SupabaseClient,
  shopId: string,
  rangeFrom: number,
  rangeTo: number
): Promise<{ rows: ShopPartnerOrderRow[]; hasMore: boolean }> {
  const { rows, hasMore } = await fetchPartnerOrdersRecentPage(client, shopId, rangeFrom, rangeTo);
  const mapped = await mapOrderRowsWithProfiles(client, rows);
  return { rows: mapped, hasMore };
}

export async function loadPartnerShopActivity(
  client: SupabaseClient,
  shopId: string,
  staffProfessionalId: string | undefined
): Promise<{
  appointments: Appointment[];
  shopPartnerOrderRows: ShopPartnerOrderRow[];
  ordersHasMore: boolean;
}> {
  const aptPromise = fetchPartnerAppointments(client, shopId, staffProfessionalId);

  const ordPromise = (async () => {
    const { rows, hasMore } = await fetchPartnerOrdersRecentPage(
      client,
      shopId,
      0,
      PARTNER_ORDERS_RECENT_PAGE_SIZE - 1
    );
    const delivered = await fetchPartnerOrdersDeliveredSince(client, shopId, startOfLocalDayUtcIso());
    const merged = mergeOrderRowsById(rows, delivered);
    const mapped = sortPartnerOrdersNewestFirst(await mapOrderRowsWithProfiles(client, merged));
    return { mapped, hasMore };
  })();

  const [appointments, ordPack] = await Promise.all([aptPromise, ordPromise]);
  return {
    appointments,
    shopPartnerOrderRows: ordPack.mapped,
    ordersHasMore: ordPack.hasMore,
  };
}
