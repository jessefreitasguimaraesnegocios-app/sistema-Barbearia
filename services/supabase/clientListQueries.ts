import type { Appointment } from '../../types';

/** Página inicial + «Carregar mais» na área do cliente (menos egress por request). */
export const CLIENT_LIST_PAGE_SIZE = 20;

export const APPOINTMENTS_SELECT_CLIENT =
  'id, client_id, shop_id, service_id, professional_id, date, time, status, amount, created_at';

/** Cliente: mais recentes primeiro (data ↓, horário ↓, created_at ↓). */
export function sortAppointmentsClientList(list: Appointment[]): Appointment[] {
  const out = [...list];
  out.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return -dc;
    const tc = a.time.localeCompare(b.time);
    if (tc !== 0) return -tc;
    return b.id.localeCompare(a.id);
  });
  return out;
}
