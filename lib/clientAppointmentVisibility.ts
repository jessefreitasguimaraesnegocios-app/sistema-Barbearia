import { getBrazilDateStringISO } from './brazilCalendarDate';

/**
 * Na área do cliente: COMPLETED só aparece no dia do serviço (data do agendamento, BRT).
 * Após 00:00 do dia seguinte some da lista (e o cron na BD remove o registo).
 */
export function isClientListVisibleAppointment(
  apt: { status: string; date: string },
  todayBrazil: string = getBrazilDateStringISO(),
): boolean {
  if (apt.status !== 'COMPLETED') return true;
  return apt.date >= todayBrazil;
}

/** Filtro PostgREST (.or) para a query paginada de agendamentos do cliente. */
export function appointmentsClientVisibleOrFilter(todayBrazil: string): string {
  return `and(status.eq.COMPLETED,date.gte.${todayBrazil}),status.in.(PENDING,PAID,CANCELLED)`;
}
