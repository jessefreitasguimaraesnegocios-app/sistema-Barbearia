import type { Appointment } from '../../types';

/** Mapeia linha Supabase (snake_case) → modelo da app. Usado em fetches e Realtime. */
export function mapRowToAppointment(r: Record<string, unknown>): Appointment {
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
    tip: r.tip != null ? Number(r.tip) : undefined,
  };
}
