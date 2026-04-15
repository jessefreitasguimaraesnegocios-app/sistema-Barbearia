/** Data civil (YYYY-MM-DD) no fuso America/Sao_Paulo — alinhado à coluna `appointments.date`. */
export function getBrazilDateStringISO(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference);
}
