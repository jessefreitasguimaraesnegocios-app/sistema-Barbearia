import React, { useMemo, useState, useEffect } from 'react';
import { Shop, PartnerAgendaAppointment } from '../types';
import { shopPrimaryStyleVars } from '../lib/shopBrandCss';
import {
  generateAgendaSlots,
  intervalsOccupied,
  slotOverlapsOccupied,
  timeToMinutes,
} from '../lib/agendaSlots';

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
  onSaveSchedule: (payload: AgendaSchedulePayload) => Promise<void>;
  onReschedule: (appointmentId: string, date: string, timeHHMMSS: string) => Promise<void>;
  onCancel: (appointmentId: string) => Promise<void>;
}

function todayLocalISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, '0');
  const da = String(n.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  const n = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

const ShopAgenda: React.FC<ShopAgendaProps> = ({
  shop,
  appointments,
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
  const [rescheduleTarget, setRescheduleTarget] = useState<PartnerAgendaAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PartnerAgendaAppointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

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

  const blockingForDay = useMemo(() => {
    return appointments
      .filter(
        (a) =>
          a.date === selectedDate &&
          a.status !== 'CANCELLED' &&
          (a.status === 'PAID' || a.status === 'PENDING')
      )
      .map((a) => ({
        time: a.time,
        durationMinutes: serviceDuration(a.serviceId),
        apt: a,
      }));
  }, [appointments, selectedDate, shop.services]);

  const occupiedIntervals = useMemo(
    () =>
      intervalsOccupied(
        blockingForDay.map((b) => ({ time: b.time, durationMinutes: b.durationMinutes }))
      ),
    [blockingForDay]
  );

  const slotLabel = (slot: string) => {
    const m = timeToMinutes(slot);
    const busy = slotOverlapsOccupied(m, slotMinutes, occupiedIntervals);
    const owners = blockingForDay.filter((b) => {
      const st = timeToMinutes(b.time);
      const en = st + b.durationMinutes;
      return m < en && m + slotMinutes > st;
    });
    return { busy, owners };
  };

  const upcomingList = useMemo(() => {
    const t = todayLocalISO();
    return [...appointments]
      .filter((a) => a.status !== 'CANCELLED' && a.status !== 'COMPLETED')
      .filter((a) => a.date >= t)
      .sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        return c !== 0 ? c : a.time.localeCompare(b.time);
      });
  }, [appointments]);

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
          Defina seu horário de atendimento, veja a grade do dia e gerencie agendamentos pagos ou pendentes.
        </p>
      </header>

      <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-gray-900">Horário de funcionamento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Abre às</label>
            <input
              type="time"
              value={workdayStart}
              onChange={(e) => setWorkdayStart(e.target.value)}
              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha às</label>
            <input
              type="time"
              value={workdayEnd}
              onChange={(e) => setWorkdayEnd(e.target.value)}
              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
            />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasLunch}
            onChange={() => setHasLunch(!hasLunch)}
            className="w-5 h-5 rounded border-gray-300 accent-[var(--shop-primary)]"
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
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Até</label>
              <input
                type="time"
                value={lunchEnd}
                onChange={(e) => setLunchEnd(e.target.value)}
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
              />
            </div>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Intervalo na grade (minutos)</label>
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="w-full sm:w-48 p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
          >
            {[15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={savingSchedule}
          onClick={handleSaveSchedule}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[var(--shop-primary)] text-white font-bold hover:brightness-95 disabled:opacity-60"
        >
          {savingSchedule ? 'Salvando…' : 'Salvar horários'}
        </button>
      </section>

      <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Grade do dia</h3>
            <p className="text-sm text-gray-500">
              Faixas livres e ocupadas por agendamentos <strong>pagos</strong> ou <strong>pendentes de pagamento</strong>.
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Data</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-[var(--shop-primary)]"
            />
          </div>
        </div>
        {slots.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-4">
            Ajuste abertura e fechamento para gerar horários na grade.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {slots.map((slot) => {
              const { busy, owners } = slotLabel(slot);
              return (
                <div
                  key={slot}
                  className={`rounded-xl p-3 text-center text-sm font-semibold border transition-all ${
                    busy
                      ? 'bg-[color-mix(in_srgb,var(--shop-primary)_18%,white)] border-[color-mix(in_srgb,var(--shop-primary)_35%,white)] text-gray-900'
                      : 'bg-gray-50 border-gray-100 text-gray-500'
                  }`}
                >
                  <p className="font-black">{slot}</p>
                  {busy && owners[0] && (
                    <p className="text-[10px] font-medium text-gray-600 mt-1 truncate" title={owners[0].apt.clientDisplayName}>
                      {owners[0].apt.clientDisplayName}
                    </p>
                  )}
                  {!busy && <p className="text-[9px] text-gray-400 mt-1">Livre</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Clientes agendados</h3>
        {upcomingList.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum agendamento ativo a partir de hoje.</p>
        ) : (
          <ul className="space-y-3">
            {upcomingList.map((a) => {
              const svc = shop.services.find((s) => s.id === a.serviceId);
              const pro = shop.professionals.find((p) => p.id === a.professionalId);
              const wa = waLink(a.clientPhone, `Olá ${a.clientDisplayName}!`);
              const waReminder = waLink(a.clientPhone, reminder15Text(a));
              const statusClass =
                a.status === 'PAID'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-800';
              return (
                <li
                  key={a.id}
                  className="flex flex-col lg:flex-row lg:items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50/80"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900">{a.clientDisplayName}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${statusClass}`}>
                        {a.status === 'PAID' ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {a.date.split('-').reverse().join('/')} às {a.time.slice(0, 5)} · {svc?.name ?? 'Serviço'} ·{' '}
                      {pro?.name ?? 'Profissional'}
                    </p>
                    <p className="text-xs text-[var(--shop-primary)] font-semibold mt-1">
                      R$ {a.amount.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                    {!a.clientPhone && (
                      <span className="text-[10px] text-gray-400 self-center">Sem telefone no perfil</span>
                    )}
                    <button
                      type="button"
                      onClick={() => openReschedule(a)}
                      className="px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-[var(--shop-primary)] text-xs font-bold"
                    >
                      Remarcar
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget(a)}
                      className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rescheduleTarget && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h4 className="font-bold text-lg text-gray-900">Remarcar</h4>
            <p className="text-sm text-gray-600">{rescheduleTarget.clientDisplayName}</p>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nova data</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
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
                className="px-4 py-2 rounded-xl bg-[var(--shop-primary)] text-white font-bold disabled:opacity-60"
              >
                {rescheduleBusy ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4">
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
