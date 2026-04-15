/** Data civil (YYYY-MM-DD) no fuso America/Sao_Paulo — alinhado à coluna `appointments.date`. */
export function getBrazilDateStringISO(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference);
}

/** Início do dia civil no Brasil em ISO UTC (para filtros de timestamp no PostgREST). */
export function getBrazilStartOfDayUtcIso(reference: Date = new Date()): string {
  const ymd = getBrazilDateStringISO(reference);
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}
