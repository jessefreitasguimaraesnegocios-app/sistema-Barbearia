import React, { useMemo, useState, useEffect } from 'react';
import { Shop, PartnerAgendaAppointment } from '../types';
import { shopPrimaryStyleVars } from '../lib/shopBrandCss';
import {
  generateAgendaSlots,
  timeToMinutes,
  type BookingBlock,
  isSlotFullyBookedByTeam,
  countTeamProsBusyInSlot,
} from '../lib/agendaSlots';
import { agendaCalendarDayKey, ymdLocal } from '../lib/agendaCalendarDay';

export interface AgendaSchedulePayload {
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  agendaSlotMinutes: number;
}

interface ShopAgendaProps {
  shop: Shop;
  appointments: PartnerAgendaAppointment[];
  /** Se false (funcionário), não edita horário da loja — só o dono. */
  allowEditShopSchedule?: boolean;
  onSaveSchedule: (payload: AgendaSchedulePayload) => Promise<void>;
  onReschedule: (appointmentId: string, date: string, timeHHMMSS: string) => Promise<void>;
  onCancel: (appointmentId: string) => Promise<void>;
}

function todayLocalISO(): string {
  return ymdLocal(new Date());
}

function addDaysLocalISO(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  const n = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

function slotOverlapsBlock(
  slot: string,
  slotMinutes: number,
  blockTime: string,
  durationMinutes: number
): boolean {
  const m = timeToMinutes(slot);
  const slotEnd = m + slotMinutes;
  const st = timeToMinutes(blockTime);
  const en = st + durationMinutes;
  return m < en && slotEnd > st;
}

/** Título da grade / lista: hoje, amanhã ou data por extenso. */
function dayHeadingLabel(selectedDateYmd: string): { grade: string; clients: string } {
  const now = new Date();
  const real = ymdLocal(now);
  const tomorrow = addDaysLocalISO(real, 1);
  if (selectedDateYmd === real) {
    return { grade: 'Grade de hoje', clients: 'Clientes agendados (hoje)' };
  }
  if (selectedDateYmd === tomorrow) {
    return { grade: 'Grade de amanhã', clients: 'Clientes agendados (amanhã)' };
  }
  const [y, m, d] = selectedDateYmd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const pretty = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
  return {
    grade: `Grade — ${pretty}`,
    clients: `Clientes agendados — ${pretty}`,
  };
}

const ShopAgenda: React.FC<ShopAgendaProps> = ({
  shop,
  appointments,
  allowEditShopSchedule = true,
  onSaveSchedule,
  onReschedule,
  onCancel,
}) => {
  const [selectedDate, setSelectedDate] = useState(todayLocalISO);
  const [workdayStart, setWorkdayStart] = useState(shop.workdayStart ?? '08:00');
  const [workdayEnd, setWorkdayEnd] = useState(shop.workdayEnd ?? '20:00');
  const [lunchStart, setLunchStart] = useState(shop.lunchStart ?? '12:00');
  const [lunchEnd, setLunchEnd] = useState(shop.lunchEnd ?? '14:00');
  const [hasLunch, setHasLunch] = useState(Boolean(shop.lunchStart && shop.lunchEnd));
  const [slotMinutes, setSlotMinutes] = useState(shop.agendaSlotMinutes ?? 30);
  const [savingSchedule, setSavingSchedule] = useState(false);
  /** Dono: formulário de expediente recolhido por defeito para dar destaque à grade e à lista. */
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<PartnerAgendaAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PartnerAgendaAppointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  /** Mesmo problema que ShopDetails: data “hoje” e slots precisam atualizar após tempo na aba. */
  const [agendaClock, setAgendaClock] = useState(0);

  useEffect(() => {
    const tick = () => setAgendaClock((n) => n + 1);
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const minAgendaDate = todayLocalISO();
  const maxAgendaDate = addDaysLocalISO(minAgendaDate, 15);

  useEffect(() => {
    if (selectedDate < minAgendaDate) setSelectedDate(minAgendaDate);
  }, [agendaClock, minAgendaDate, selectedDate]);

  /** Após o fim do expediente, alinhar data da agenda ao dia lógico (amanhã), como no painel principal. */
  useEffect(() => {
    void agendaClock;
    const now = new Date();
    const real = ymdLocal(now);
    const agenda = agendaCalendarDayKey(now, shop);
    setSelectedDate((prev) => {
      if (prev === real && agenda !== real) return agenda;
      return prev;
    });
  }, [agendaClock, shop.workdayEnd, shop.rowUpdatedAt]);

  useEffect(() => {
    setWorkdayStart(shop.workdayStart ?? '08:00');
    setWorkdayEnd(shop.workdayEnd ?? '20:00');
    setLunchStart(shop.lunchStart ?? '12:00');
    setLunchEnd(shop.lunchEnd ?? '14:00');
    setHasLunch(Boolean(shop.lunchStart && shop.lunchEnd));
    setSlotMinutes(shop.agendaSlotMinutes ?? 30);
  }, [
    shop.workdayStart,
    shop.workdayEnd,
    shop.lunchStart,
    shop.lunchEnd,
    shop.agendaSlotMinutes,
    shop.rowUpdatedAt,
  ]);

  const slots = useMemo(
    () =>
      generateAgendaSlots({
        workStart: workdayStart,
        workEnd: workdayEnd,
        lunchStart: hasLunch ? lunchStart : null,
        lunchEnd: hasLunch ? lunchEnd : null,
        slotMinutes,
      }),
    [workdayStart, workdayEnd, lunchStart, lunchEnd, hasLunch, slotMinutes]
  );

  const serviceDuration = (serviceId: string) => {
    const s = shop.services.find((x) => x.id === serviceId);
    return s?.duration ?? 30;
  };

  /** Só PAID contam para “ocupado / equipe cheia”; COMPLETED liberta a faixa para novos. */
  const blockingPaidForDay = useMemo(() => {
    return appointments
      .filter((a) => a.date === selectedDate && a.status === 'PAID')
      .map((a) => ({
        time: a.time,
        durationMinutes: serviceDuration(a.serviceId),
        apt: a,
      }));
  }, [appointments, selectedDate, shop.services]);

  /** PAID + COMPLETED no dia — nomes na célula da grade. */
  const displayBlocksForDay = useMemo(() => {
    return appointments
      .filter((a) => a.date === selectedDate && (a.status === 'PAID' || a.status === 'COMPLETED'))
      .map((a) => ({
        time: a.time,
        durationMinutes: serviceDuration(a.serviceId),
        apt: a,
        isCompleted: a.status === 'COMPLETED',
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, selectedDate, shop.services]);

  const bookingBlocks: BookingBlock[] = useMemo(
    () =>
      blockingPaidForDay.map((b) => ({
        time: b.time,
        durationMinutes: b.durationMinutes,
        professionalId: b.apt.professionalId,
      })),
    [blockingPaidForDay]
  );

  const teamProIds = useMemo(() => shop.professionals.map((p) => p.id), [shop.professionals]);

  /** Totalmente ocupado só quando todos os profissionais da equipe têm agendamento PAID sobreposto ao slot */
  const slotLabel = (slot: string) => {
    const owners = blockingPaidForDay.filter((b) =>
      slotOverlapsBlock(slot, slotMinutes, b.time, b.durationMinutes)
    );
    const hasOverlap = owners.length > 0;
    const fullyBooked = isSlotFullyBookedByTeam(slot, slotMinutes, bookingBlocks, teamProIds);
    const busyProsCount = countTeamProsBusyInSlot(slot, slotMinutes, bookingBlocks, teamProIds);
    const freeProsHint =
      hasOverlap && !fullyBooked && teamProIds.length > 0
        ? Math.max(0, teamProIds.length - busyProsCount)
        : 0;
    const displayOverlaps = displayBlocksForDay.filter((b) =>
      slotOverlapsBlock(slot, slotMinutes, b.time, b.durationMinutes)
    );
    const hasCompletedHere = displayOverlaps.some((o) => o.isCompleted);
    return { fullyBooked, owners, freeProsHint, hasCompletedHere, displayOverlaps };
  };

  const dayLabels = useMemo(() => {
    void agendaClock;
    return dayHeadingLabel(selectedDate);
  }, [selectedDate, agendaClock]);

  /** Mesmo dia que a grade (`selectedDate`): pagos + concluídos; a data avança após o fim do expediente. */
  const upcomingList = useMemo(() => {
    void agendaClock;
    return [...appointments]
      .filter((a) => a.status === 'PAID' || a.status === 'COMPLETED')
      .filter((a) => a.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, selectedDate, agendaClock]);

  const resetScheduleFieldsFromShop = () => {
    setWorkdayStart(shop.workdayStart ?? '08:00');
    setWorkdayEnd(shop.workdayEnd ?? '20:00');
    setLunchStart(shop.lunchStart ?? '12:00');
    setLunchEnd(shop.lunchEnd ?? '14:00');
    setHasLunch(Boolean(shop.lunchStart && shop.lunchEnd));
    setSlotMinutes(shop.agendaSlotMinutes ?? 30);
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await onSaveSchedule({
        workdayStart,
        workdayEnd,
        lunchStart: hasLunch ? lunchStart : null,
        lunchEnd: hasLunch ? lunchEnd : null,
        agendaSlotMinutes: slotMinutes,
      });
      if (allowEditShopSchedule) setScheduleEditorOpen(false);
    } finally {
      setSavingSchedule(false);
    }
  };

  const openReschedule = (a: PartnerAgendaAppointment) => {
    setRescheduleTarget(a);
    setRescheduleDate(a.date);
    setRescheduleTime(a.time.slice(0, 5));
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    if (rescheduleDate < minAgendaDate || rescheduleDate > maxAgendaDate) {
      alert('A nova data deve estar entre hoje e os próximos 15 dias.');
      return;
    }
    const t =
      rescheduleTime.length === 5 ? `${rescheduleTime}:00` : rescheduleTime.length >= 8 ? rescheduleTime : `${rescheduleTime}:00`;
    setRescheduleBusy(true);
    try {
      await onReschedule(rescheduleTarget.id, rescheduleDate, t);
      setRescheduleTarget(null);
    } finally {
      setRescheduleBusy(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await onCancel(cancelTarget.id);
      setCancelTarget(null);
    } finally {
      setCancelBusy(false);
    }
  };

  const reminder15Text = (a: PartnerAgendaAppointment) => {
    const svc = shop.services.find((s) => s.id === a.serviceId)?.name ?? 'seu horário';
    return `Olá! Faltam 15 minutos para ${svc} na ${shop.name}. Não se atrase!`;
  };

  return (
    <div
      className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24"
      style={shopPrimaryStyleVars(shop.primaryColor)}
    >
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Agenda</h2>
        <p className="text-gray-500 mt-1">
          {allowEditShopSchedule
            ? 'Defina seu horário de atendimento, veja a grade do dia e gerencie agendamentos confirmados (pagos).'
            : 'Veja a grade do dia e gerencie seus agendamentos confirmados (pagos). O horário da loja é definido pelo dono.'}
        </p>
      </header>

      <section className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <h3 className="text-lg font-bold text-gray-900">
            {allowEditShopSchedule ? 'Dia da agenda' : 'Data da agenda'}
          </h3>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Data da agenda</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={minAgendaDate}
              max={maxAgendaDate}
              className="p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
            />
          </div>
        </div>
        {!allowEditShopSchedule && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-4">
            Funcionamento da loja: <strong>{workdayStart}</strong> às <strong>{workdayEnd}</strong>
            {hasLunch && lunchStart && lunchEnd ? (
              <>
                {' '}
                (almoço {lunchStart}–{lunchEnd})
              </>
            ) : null}
            . Slots de <strong>{slotMinutes}</strong> min.
          </p>
        )}
        {allowEditShopSchedule && !scheduleEditorOpen && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="text-sm text-gray-700">
              <span className="font-bold text-gray-900">Expediente:</span>{' '}
              <strong>{workdayStart}</strong> – <strong>{workdayEnd}</strong>
              {hasLunch && lunchStart && lunchEnd ? (
                <>
                  {' '}
                  · Almoço <strong>{lunchStart}</strong>–<strong>{lunchEnd}</strong>
                </>
              ) : (
                <> · Sem intervalo de almoço</>
              )}
              <> · Grade <strong>{slotMinutes}</strong> min</>
            </div>
            <button
              type="button"
              onClick={() => setScheduleEditorOpen(true)}
              className="shrink-0 px-5 py-2.5 rounded-xl border-2 border-[color-mix(in_srgb,var(--shop-primary)_40%,transparent)] text-(--shop-primary) font-bold text-sm hover:bg-[color-mix(in_srgb,var(--shop-primary)_10%,white)] transition-colors dark:border-[color-mix(in_srgb,var(--shop-primary)_55%,#3f3f46)] dark:hover:bg-[color-mix(in_srgb,var(--shop-primary)_24%,#0a0a0a)]"
            >
              Editar horários
            </button>
          </div>
        )}
        {allowEditShopSchedule && scheduleEditorOpen && (
          <>
            <p className="text-xs text-gray-500 -mt-2">Ajuste abertura, fechamento, almoço e tamanho da faixa na grade.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Abre às</label>
                <input
                  type="time"
                  value={workdayStart}
                  onChange={(e) => setWorkdayStart(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha às</label>
                <input
                  type="time"
                  value={workdayEnd}
                  onChange={(e) => setWorkdayEnd(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
                />
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasLunch}
                onChange={() => setHasLunch(!hasLunch)}
                className="w-5 h-5 rounded border-gray-300 accent-(--shop-primary)"
              />
              <span className="text-sm font-medium text-gray-700">Intervalo de almoço</span>
            </label>
            {hasLunch && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Almoço de</label>
                  <input
                    type="time"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Até</label>
                  <input
                    type="time"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Intervalo na grade (minutos)</label>
              <select
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Number(e.target.value))}
                className="w-full sm:w-48 p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-(--shop-primary)"
              >
                {[15, 20, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={savingSchedule}
                onClick={handleSaveSchedule}
                className="px-6 py-3 rounded-2xl bg-(--shop-primary) text-white font-bold hover:brightness-95 disabled:opacity-60"
              >
                {savingSchedule ? 'Salvando…' : 'Salvar horários'}
              </button>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => {
                  resetScheduleFieldsFromShop();
                  setScheduleEditorOpen(false);
                }}
                className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </section>

      <section className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{dayLabels.grade}</h3>
          <p className="text-sm text-gray-500">
            Cada faixa só fica <strong>totalmente ocupada</strong> quando <strong>todos</strong> os profissionais da
            equipe já têm agendamento <strong>pago</strong> naquele horário; se ainda houver alguém livre, a faixa aparece
            como disponível. Após o <strong>horário de fecho</strong> do expediente, a grade mostra o{' '}
            <strong>dia seguinte</strong> e os respectivos agendamentos. Atendimentos <strong>concluídos</strong> mostram
            um check na faixa do horário.
          </p>
        </div>
        {slots.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-4">
            Ajuste abertura e fechamento para gerar horários na grade.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {slots.map((slot) => {
              const { fullyBooked, freeProsHint, hasCompletedHere, displayOverlaps } = slotLabel(slot);
              const nameLineClass = fullyBooked
                ? 'text-[10px] font-medium text-gray-700 dark:text-zinc-200'
                : 'text-[10px] font-medium text-emerald-900/90 dark:text-emerald-100/95';
              return (
                <div
                  key={slot}
                  className={`rounded-xl p-3 text-center text-sm font-semibold border transition-all relative min-h-18 flex flex-col ${
                    fullyBooked
                      ? 'bg-[color-mix(in_srgb,var(--shop-primary)_18%,white)] border-[color-mix(in_srgb,var(--shop-primary)_35%,white)] text-gray-900 dark:bg-[color-mix(in_srgb,var(--shop-primary)_42%,#030303)] dark:border-[color-mix(in_srgb,var(--shop-primary)_55%,#1f1f23)] dark:text-zinc-50'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/55 dark:border-emerald-800/70 dark:text-emerald-300'
                  }`}
                >
                  {hasCompletedHere ? (
                    <span
                      className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                      title="Há atendimento concluído neste horário"
                      aria-hidden
                    >
                      <i className="fas fa-check text-[9px]" />
                    </span>
                  ) : null}
                  <p className="font-black shrink-0">{slot}</p>
                  {displayOverlaps.length > 0 ? (
                    <div className="mt-1 flex-1 flex flex-col items-center justify-start gap-0.5 min-w-0 w-full px-0.5">
                      {displayOverlaps.slice(0, 3).map((o) => (
                        <p
                          key={o.apt.id}
                          className={`${nameLineClass} w-full truncate text-center leading-tight`}
                          title={`${o.apt.clientDisplayName}${o.isCompleted ? ' (concluído)' : ''}`}
                        >
                          {o.isCompleted ? (
                            <i className="fas fa-check text-[8px] mr-0.5 opacity-90" aria-hidden />
                          ) : null}
                          {o.apt.clientDisplayName}
                        </p>
                      ))}
                      {displayOverlaps.length > 3 ? (
                        <p className={`text-[9px] font-bold ${fullyBooked ? 'text-gray-500' : 'text-emerald-800/80 dark:text-emerald-200/90'}`}>
                          +{displayOverlaps.length - 3}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!fullyBooked && freeProsHint > 0 && (
                    <p className="text-[9px] text-emerald-600/90 mt-auto pt-1 font-medium dark:text-emerald-300/95">
                      Livre — {freeProsHint}{' '}
                      {freeProsHint === 1 ? 'profissional' : 'profissionais'}
                    </p>
                  )}
                  {!fullyBooked && freeProsHint === 0 && displayOverlaps.length === 0 && (
                    <p className="text-[9px] text-gray-400 mt-auto pt-1 dark:text-emerald-400/90">Livre</p>
                  )}
                  {!fullyBooked && freeProsHint === 0 && displayOverlaps.length > 0 && (
                    <p className="text-[9px] text-emerald-600/80 mt-auto pt-1 font-medium dark:text-emerald-300/85">Livre</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{dayLabels.clients}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Lista do <strong>mesmo dia</strong> que a grade acima (após o fecho do expediente, o dia passa a ser o
            seguinte até à meia-noite).
          </p>
        </div>
        {upcomingList.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum agendamento pago ou concluído para este dia.</p>
        ) : (
          <ul className="space-y-3">
            {upcomingList.map((a) => {
              const svc = shop.services.find((s) => s.id === a.serviceId);
              const pro = shop.professionals.find((p) => p.id === a.professionalId);
              const wa = waLink(a.clientPhone, `Olá ${a.clientDisplayName}!`);
              const waReminder = waLink(a.clientPhone, reminder15Text(a));
              const isDone = a.status === 'COMPLETED';
              const statusClass = isDone ? 'bg-slate-200 text-slate-800 dark:bg-zinc-700 dark:text-zinc-100' : 'bg-emerald-50 text-emerald-800';
              return (
                <li
                  key={a.id}
                  className={`relative flex flex-col lg:flex-row lg:items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50/80 ${
                    isDone ? 'pr-4' : 'pr-11 sm:pr-12'
                  }`}
                >
                  {!isDone ? (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(a)}
                      className="absolute right-3 top-3 z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
                      aria-label="Cancelar agendamento"
                      title="Cancelar agendamento"
                    >
                      <i className="fas fa-times text-[10px]" aria-hidden />
                    </button>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900">{a.clientDisplayName}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${statusClass}`}>
                        {isDone ? (
                          <span className="inline-flex items-center gap-1">
                            <i className="fas fa-check text-[9px]" aria-hidden />
                            Concluído
                          </span>
                        ) : (
                          'Pago'
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {a.date.split('-').reverse().join('/')} às {a.time.slice(0, 5)} · {svc?.name ?? 'Serviço'} ·{' '}
                      {pro?.name ?? 'Profissional'}
                    </p>
                    <p className="text-xs text-(--shop-primary) font-semibold mt-1">
                      R$ {a.amount.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  {!isDone ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openReschedule(a)}
                        className="px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-(--shop-primary) text-xs font-bold dark:bg-[color-mix(in_srgb,var(--shop-primary)_35%,#0a0a0a)] dark:text-[color-mix(in_srgb,var(--shop-primary)_88%,#fafafa)] dark:border dark:border-[color-mix(in_srgb,var(--shop-primary)_45%,#27272a)]"
                      >
                        Remarcar
                      </button>
                      {waReminder && (
                        <a
                          href={waReminder}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-50"
                          title="Abre o WhatsApp com lembrete de 15 minutos"
                        >
                          <i className="fas fa-clock" /> Lembrete 15 min
                        </a>
                      )}
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#20bd5a]"
                        >
                          <i className="fab fa-whatsapp" /> WhatsApp
                        </a>
                      )}
                      {!a.clientPhone && (
                        <span className="text-[10px] text-gray-400 self-center">Sem telefone no perfil</span>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rescheduleTarget && (
        <div className="fixed inset-0 z-2000 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h4 className="font-bold text-lg text-gray-900">Remarcar</h4>
            <p className="text-sm text-gray-600">{rescheduleTarget.clientDisplayName}</p>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nova data</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={minAgendaDate}
                max={maxAgendaDate}
                className="w-full p-3 rounded-xl border border-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Novo horário</label>
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setRescheduleTarget(null)} className="px-4 py-2 rounded-xl text-gray-600 font-medium">
                Fechar
              </button>
              <button
                type="button"
                disabled={rescheduleBusy}
                onClick={submitReschedule}
                className="px-4 py-2 rounded-xl bg-(--shop-primary) text-white font-bold disabled:opacity-60"
              >
                {rescheduleBusy ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-2000 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h4 className="font-bold text-lg text-gray-900">Cancelar agendamento?</h4>
            <p className="text-sm text-gray-600">
              {cancelTarget.clientDisplayName} — {cancelTarget.date} {cancelTarget.time.slice(0, 5)}
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCancelTarget(null)} className="px-4 py-2 rounded-xl text-gray-600 font-medium">
                Voltar
              </button>
              <button
                type="button"
                disabled={cancelBusy}
                onClick={submitCancel}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold disabled:opacity-60"
              >
                {cancelBusy ? 'Cancelando…' : 'Sim, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopAgenda;
