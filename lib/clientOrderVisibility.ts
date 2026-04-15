import { getBrazilDateStringISO, getBrazilStartOfDayUtcIso } from './brazilCalendarDate';

/**
 * Na área do cliente: DELIVERED só aparece no dia da entrega (horário de Brasília).
 * Após 00:00 do dia seguinte, some da lista.
 */
export function isClientListVisibleOrder(
  order: { status: string; handedOverAtIso?: string; createdAtIso?: string },
  todayBrazil: string = getBrazilDateStringISO(),
): boolean {
  if (order.status !== 'DELIVERED') return true;
  const refIso = order.handedOverAtIso || order.createdAtIso;
  if (!refIso) return false;
  const refBrazilDate = getBrazilDateStringISO(new Date(refIso));
  return refBrazilDate >= todayBrazil;
}

/** Filtro PostgREST (.or) para lista paginada de pedidos do cliente. */
export function ordersClientVisibleOrFilter(reference: Date = new Date()): string {
  const startOfBrazilDayUtcIso = getBrazilStartOfDayUtcIso(reference);
  return `and(status.eq.DELIVERED,handed_over_at.gte.${startOfBrazilDayUtcIso}),status.in.(PENDING,PAID)`;
}
