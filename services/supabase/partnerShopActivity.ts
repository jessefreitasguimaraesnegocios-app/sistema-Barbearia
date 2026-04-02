import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, Order, ShopPartnerOrderRow } from '../../types';

function mapAppointmentRow(r: Record<string, unknown>): Appointment {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    shopId: String(r.shop_id),
    serviceId: String(r.service_id),
    professionalId: String(r.professional_id),
    date: typeof r.date === 'string' ? r.date.split('T')[0] : String(r.date),
    time: typeof r.time === 'string' ? String(r.time).slice(0, 8) : String(r.time),
    status: (r.status as Appointment['status']) || 'PENDING',
    amount: Number(r.amount) || 0,
  };
}

export async function fetchPartnerAppointments(
  client: SupabaseClient,
  shopId: string,
  staffProfessionalId: string | undefined
): Promise<Appointment[]> {
  let q = client
    .from('appointments')
    .select('id, client_id, shop_id, service_id, professional_id, date, time, status, amount')
    .eq('shop_id', shopId);
  if (staffProfessionalId) q = q.eq('professional_id', staffProfessionalId);
  const { data: aptRows, error } = await q
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error || !aptRows) return [];
  return aptRows.map((r) => mapAppointmentRow(r as Record<string, unknown>));
}

export async function fetchPartnerOrdersWithProfiles(
  client: SupabaseClient,
  shopId: string
): Promise<ShopPartnerOrderRow[]> {
  const { data: ordRows, error: ordErr } = await client
    .from('orders')
    .select('id, client_id, shop_id, items, total, status, created_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (ordErr || !ordRows) return [];

  const clientIds = [...new Set(ordRows.map((r) => String((r as { client_id: string }).client_id)))];
  const profById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
  if (clientIds.length > 0) {
    const { data: profs } = await client.from('profiles').select('id, full_name, avatar_url').in('id', clientIds);
    for (const p of profs ?? []) {
      const row = p as { id: string; full_name?: string | null; avatar_url?: string | null };
      profById.set(String(row.id), { full_name: row.full_name, avatar_url: row.avatar_url });
    }
  }

  return ordRows.map((r: Record<string, unknown>) => {
    const pid = String(r.client_id);
    const createdRaw = r.created_at ? String(r.created_at) : new Date().toISOString();
    const prof = profById.get(pid);
    const nameFromProf = prof?.full_name?.trim();
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
    };
  });
}

export async function loadPartnerShopActivity(
  client: SupabaseClient,
  shopId: string,
  staffProfessionalId: string | undefined
): Promise<{ appointments: Appointment[]; shopPartnerOrderRows: ShopPartnerOrderRow[] }> {
  const [appointments, shopPartnerOrderRows] = await Promise.all([
    fetchPartnerAppointments(client, shopId, staffProfessionalId),
    fetchPartnerOrdersWithProfiles(client, shopId),
  ]);
  return { appointments, shopPartnerOrderRows };
}
