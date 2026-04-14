import type { Shop } from '../types';

/** Data civil local `YYYY-MM-DD`. */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Dia “lógico” da agenda do parceiro: após o fim do expediente (`workdayEnd`) no dia civil atual,
 * a chave passa a ser o dia seguinte (grade e listas alinhadas ao próximo dia de trabalho).
 */
export function agendaCalendarDayKey(now: Date, shop: Shop): string {
  const parseEndOnDay = (clock: string | undefined, base: Date) => {
    const raw = String(clock ?? '20:00').trim().slice(0, 5);
    const parts = raw.split(':');
    const hh = parseInt(parts[0] ?? '20', 10);
    const mm = parseInt(parts[1] ?? '0', 10);
    const out = new Date(base);
    out.setHours(Number.isFinite(hh) ? hh : 20, Number.isFinite(mm) ? mm : 0, 0, 0);
    return out;
  };
  const endToday = parseEndOnDay(shop.workdayEnd, now);
  if (now.getTime() > endToday.getTime()) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return ymdLocal(t);
  }
  return ymdLocal(now);
}
