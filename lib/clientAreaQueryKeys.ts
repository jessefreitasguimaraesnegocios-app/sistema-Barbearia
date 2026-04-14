/**
 * Chaves TanStack Query — área do cliente (primeira página de listas).
 * Usar com `invalidateQueries` após pagamento confirmado para forçar rede fresca.
 */
export const clientAreaQueryKeys = {
  appointmentsP1: (clientId: string) => ['client-area', 'appointments', clientId, 'p1'] as const,
  ordersP1: (clientId: string) => ['client-area', 'orders', clientId, 'p1'] as const,
};
