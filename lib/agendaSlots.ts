/** Converte "HH:MM" ou "HH:MM:SS" em minutos desde meia-noite */
export function timeToMinutes(t: string): number {
  const part = t.slice(0, 5);
  const [h, m] = part.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateAgendaSlots(params: {
  workStart: string;
  workEnd: string;
  lunchStart: string | null | undefined;
  lunchEnd: string | null | undefined;
  slotMinutes: number;
}): string[] {
  const slot = Math.max(10, Math.min(120, params.slotMinutes || 30));
  let start = timeToMinutes(params.workStart);
  const end = timeToMinutes(params.workEnd);
  if (end <= start) return [];

  let lunchA: number | null = null;
  let lunchB: number | null = null;
  if (params.lunchStart && params.lunchEnd) {
    lunchA = timeToMinutes(params.lunchStart);
    lunchB = timeToMinutes(params.lunchEnd);
    if (lunchB <= lunchA) {
      lunchA = null;
      lunchB = null;
    }
  }

  const out: string[] = [];
  for (let t = start; t + slot <= end; t += slot) {
    if (lunchA != null && lunchB != null && t < lunchB && t + slot > lunchA) {
      continue;
    }
    out.push(minutesToHHMM(t));
  }
  return out;
}

/** Intervalos [startMin, endMin) ocupados por agendamentos */
export function intervalsOccupied(
  appointments: { time: string; durationMinutes: number }[]
): { start: number; end: number }[] {
  return appointments.map((a) => {
    const start = timeToMinutes(a.time);
    return { start, end: start + Math.max(15, a.durationMinutes) };
  });
}

export function slotOverlapsOccupied(
  slotStartMin: number,
  slotDurationMin: number,
  occupied: { start: number; end: number }[]
): boolean {
  const slotEnd = slotStartMin + slotDurationMin;
  return occupied.some((o) => slotStartMin < o.end && slotEnd > o.start);
}
