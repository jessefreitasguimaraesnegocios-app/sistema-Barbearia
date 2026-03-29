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

/** Bloco ocupado (alinhado ao retorno de get_shop_booking_blocks) */
export interface BookingBlock {
  time: string;
  durationMinutes: number;
  professionalId: string;
}

export function getSlotOverlappingBlocks(
  slotStartLabel: string,
  slotDurationMin: number,
  blocks: BookingBlock[]
): BookingBlock[] {
  const m = timeToMinutes(slotStartLabel);
  const slotEnd = m + slotDurationMin;
  return blocks.filter((b) => {
    const st = timeToMinutes(b.time);
    const en = st + Math.max(15, b.durationMinutes);
    return m < en && slotEnd > st;
  });
}

/** Todos os profissionais da equipe ocupados neste slot (mesma regra da agenda do parceiro). */
export function isSlotFullyBookedByTeam(
  slotStartLabel: string,
  slotDurationMin: number,
  blocks: BookingBlock[],
  teamProIds: string[]
): boolean {
  const owners = getSlotOverlappingBlocks(slotStartLabel, slotDurationMin, blocks);
  const hasOverlap = owners.length > 0;
  if (!hasOverlap) return false;
  if (teamProIds.length === 0) return true;
  const teamSet = new Set(teamProIds);
  if (owners.some((o) => !teamSet.has(o.professionalId))) return true;
  const busyPros = new Set(owners.map((o) => o.professionalId));
  return teamProIds.every((id) => busyPros.has(id));
}

/** Quantos profissionais da equipe distintos estão ocupados neste slot (ignora desconhecidos se não houver unknown overlap). */
export function countTeamProsBusyInSlot(
  slotStartLabel: string,
  slotDurationMin: number,
  blocks: BookingBlock[],
  teamProIds: string[]
): number {
  const owners = getSlotOverlappingBlocks(slotStartLabel, slotDurationMin, blocks);
  if (owners.length === 0) return 0;
  const teamSet = new Set(teamProIds);
  if (owners.some((o) => !teamSet.has(o.professionalId))) return teamProIds.length;
  return new Set(owners.map((o) => o.professionalId)).size;
}

/** Estado para o cliente: esgotado (toda equipe) vs profissional escolhido ocupado. */
export function slotClientSelectionState(
  slotStartLabel: string,
  slotDurationMin: number,
  blocks: BookingBlock[],
  teamProIds: string[],
  selectedProfessionalId: string
): { fullyBooked: boolean; selectedProBusy: boolean } {
  const fullyBooked = isSlotFullyBookedByTeam(slotStartLabel, slotDurationMin, blocks, teamProIds);
  const owners = getSlotOverlappingBlocks(slotStartLabel, slotDurationMin, blocks);
  const hasOverlap = owners.length > 0;
  const selectedProBusy =
    hasOverlap && owners.some((o) => o.professionalId === selectedProfessionalId);
  return { fullyBooked, selectedProBusy };
}
