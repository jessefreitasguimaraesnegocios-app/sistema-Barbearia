/**
 * Tempo em que a **primeira página** de agendamentos/pedidos (cliente) pode servir-se do
 * cache TanStack **sem novo request** à rede.
 *
 * Curto de propósito: o Realtime mantém a UI quente; cache evita duplicar o mesmo GET ao
 * saltar entre vistas. Após pagamento usamos `invalidateQueries` — rede fresca, sem
 * depender só do staleTime.
 */
export const CLIENT_AREA_FIRST_PAGE_STALE_MS = 25_000;
