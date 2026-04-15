import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, Order } from '../../types';
import { getBrazilDateStringISO } from '../../lib/brazilCalendarDate';
import { appointmentsClientVisibleOrFilter } from '../../lib/clientAppointmentVisibility';
import { ordersClientVisibleOrFilter } from '../../lib/clientOrderVisibility';
import { mapRowToAppointment } from './appointmentMapping';
import { mapRowToOrder, ORDERS_SELECT_CLIENT } from './orderMapping';
import { APPOINTMENTS_SELECT_CLIENT, CLIENT_LIST_PAGE_SIZE } from './clientListQueries';

export async function fetchClientAppointmentsFirstPage(
  client: SupabaseClient,
  clientId: string
): Promise<Appointment[]> {
  const todayBr = getBrazilDateStringISO();
  const { data, error } = await client
    .from('appointments')
    .select(APPOINTMENTS_SELECT_CLIENT)
    .eq('client_id', clientId)
    .or(appointmentsClientVisibleOrFilter(todayBr))
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .order('created_at', { ascending: false })
    .range(0, CLIENT_LIST_PAGE_SIZE - 1);
  if (error) throw error;
  return (data || []).map((row) => mapRowToAppointment(row as Record<string, unknown>));
}

export async function fetchClientOrdersFirstPage(client: SupabaseClient, clientId: string): Promise<Order[]> {
  const { data, error } = await client
    .from('orders')
    .select(ORDERS_SELECT_CLIENT)
    .eq('client_id', clientId)
    .or(ordersClientVisibleOrFilter())
    .order('created_at', { ascending: false })
    .range(0, CLIENT_LIST_PAGE_SIZE - 1);
  if (error) throw error;
  return (data || []).map((row) => mapRowToOrder(row as Record<string, unknown>));
}
