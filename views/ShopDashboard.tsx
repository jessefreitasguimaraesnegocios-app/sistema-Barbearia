import React, { useState, useEffect, useMemo } from 'react';
import { Shop, Order, PartnerAgendaAppointment } from '../types';
import { shouldShowPartnerAsaasSetupBanner } from '../lib/partnerOnboardingBanner';
import { agendaCalendarDayKey, ymdLocal } from '../lib/agendaCalendarDay';

/** Igual à Agenda: só entra com pagamento confirmado; COMPLETED mantém o dia visível após atendimento. */
function isPaidOrCompletedAppointment(a: PartnerAgendaAppointment): boolean {
  return a.status === 'PAID' || a.status === 'COMPLETED';
}

function appointmentStartDateTime(dateYmd: string, timeHm: string): Date {
  const t = String(timeHm).trim();
  const slice = t.length >= 5 ? t.slice(0, 5) : t;
  const [hs, ms] = slice.split(':');
  const hh = parseInt(hs ?? '0', 10) || 0;
  const mm = parseInt(ms ?? '0', 10) || 0;
  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  const out = new Date(y, (mo || 1) - 1, d || 1);
  out.setHours(hh, mm, 0, 0);
  return out;
}

function formatAgendaDayTitlePt(key: string): string {
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
}

function orderCountsForRevenue(o: Order): boolean {
  return o.status === 'PAID' || o.status === 'DELIVERED';
}

function parseOrderDatePtBr(dateStr: string): Date | null {
  const p = dateStr.split('/');
  if (p.length !== 3) return null;
  const da = parseInt(p[0], 10);
  const mo = parseInt(p[1], 10);
  const yr = parseInt(p[2], 10);
  if (!Number.isFinite(da) || !Number.isFinite(mo) || !Number.isFinite(yr)) return null;
  return new Date(yr, mo - 1, da);
}

function ClientAppointmentAvatar({
  apt,
  sizeClass = 'w-14 h-14 rounded-2xl text-xl',
}: {
  apt: PartnerAgendaAppointment;
  sizeClass?: string;
}) {
  const url = apt.clientAvatarUrl?.trim();
  const letter = (apt.clientDisplayName?.trim() || `Cliente #${apt.clientId.slice(0, 4)}`)
    .charAt(0)
    .toUpperCase();
  const [imgFailed, setImgFailed] = useState(false);
  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt=""
        className={`${sizeClass} object-cover shrink-0 bg-gray-100 border border-gray-100`}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} shrink-0 bg-gray-100 flex items-center justify-center text-gray-400 font-bold border border-gray-100`}
      aria-hidden
    >
      {letter}
    </div>
  );
}

interface ShopDashboardProps {
  shop: Shop;
  appointments: PartnerAgendaAppointment[];
  orders: Order[];
  onMarkAppointmentCompleted?: (appointmentId: string) => Promise<void>;
  /** Funcionário: agenda já filtrada; esconde filtro por equipe e banner de onboarding da loja. */
  staffMode?: boolean;
}

type Period = 'TODAY' | 'WEEK' | 'MONTH';

function isLatePaidAppointment(
  apt: PartnerAgendaAppointment,
  dayKey: string,
  now: Date
): boolean {
  if (apt.status !== 'PAID') return false;
  return now.getTime() >= appointmentStartDateTime(dayKey, apt.time).getTime();
}

const ShopDashboard: React.FC<ShopDashboardProps> = ({
  shop,
  appointments,
  orders,
  onMarkAppointmentCompleted,
  staffMode = false,
}) => {
  const [filterPro, setFilterPro] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('TODAY');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [attendingAppointmentId, setAttendingAppointmentId] = useState<string | null>(null);
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [gridClock, setGridClock] = useState(0);
  const showAsaasSetupBanner = !staffMode && shouldShowPartnerAsaasSetupBanner(shop);

  const handleCopyShareLink = async () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const shareToken = shop.shareCode?.trim() || shop.id;
    const shareParam = shop.shareCode?.trim() ? 's' : 'shop';
    const shareUrl = `${baseUrl}/?${shareParam}=${encodeURIComponent(shareToken)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLinkState('copied');
    } catch {
      setCopyLinkState('error');
    } finally {
      window.setTimeout(() => setCopyLinkState('idle'), 2200);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setGridClock((n) => n + 1), 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') setGridClock((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const nowTick = useMemo(() => new Date(), [gridClock]);
  const agendaDayKey = useMemo(() => agendaCalendarDayKey(nowTick, shop), [shop, gridClock]);
  const realTodayKey = ymdLocal(nowTick);
  const showingNextCalendarDay = agendaDayKey !== realTodayKey;

  // Filtrar dados da loja
  const myApts = appointments.filter(a => a.shopId === shop.id);
  const myOrders = orders.filter(o => o.shopId === shop.id);
  const revenueOrders = myOrders.filter(orderCountsForRevenue);

  // Filtragem por período para o resumo financeiro
  /** Em `staffMode`, produtos da lojinha aparecem no card mas não entram no total (só serviços do profissional). */
  const getPeriodData = (p: Period) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const paidLikeApts = myApts.filter(isPaidOrCompletedAppointment);
    let filteredApts = paidLikeApts;
    let filteredOrders = revenueOrders;

    if (p === 'TODAY') {
      filteredApts = paidLikeApts.filter((a) => a.date === todayStr);
      const localDateStr = now.toLocaleDateString('pt-BR');
      filteredOrders = revenueOrders.filter((o) => o.date === localDateStr);
    } else if (p === 'WEEK') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      filteredApts = paidLikeApts.filter((a) => new Date(a.date) >= sevenDaysAgo);
      filteredOrders = revenueOrders.filter((o) => {
        const d = parseOrderDatePtBr(o.date);
        return d != null && !Number.isNaN(d.getTime()) && d >= sevenDaysAgo;
      });
    } else if (p === 'MONTH') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      filteredApts = paidLikeApts.filter((a) => new Date(a.date) >= thirtyDaysAgo);
      filteredOrders = revenueOrders.filter((o) => {
        const d = parseOrderDatePtBr(o.date);
        return d != null && !Number.isNaN(d.getTime()) && d >= thirtyDaysAgo;
      });
    }

    const servicesRevenue = filteredApts.reduce((sum, a) => sum + a.amount, 0);
    const productsRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
    const total = staffMode ? servicesRevenue : servicesRevenue + productsRevenue;

    return {
      servicesRevenue,
      productsRevenue,
      total,
      count: filteredApts.length + filteredOrders.length,
    };
  };

  const financialSummary = getPeriodData(period);

  // Timeline: dia corrente ou, após workdayEnd, já o dia seguinte (vira “hoje” de novo na meia-noite).
  const agendaDayApts = myApts
    .filter((a) => a.date === agendaDayKey && isPaidOrCompletedAppointment(a))
    .sort((a, b) => a.time.localeCompare(b.time));

  const filteredApts =
    filterPro === 'ALL' ? agendaDayApts : agendaDayApts.filter((a) => a.professionalId === filterPro);

  /** Dia civil atual (não “vira” após workdayEnd como a coluna da agenda). */
  const todayAgendaApts = myApts
    .filter((a) => a.date === realTodayKey && isPaidOrCompletedAppointment(a))
    .sort((a, b) => a.time.localeCompare(b.time));

  /** Card + Iniciar: só hoje real — nunca agendamento de amanhã antes de ser esse o dia. */
  const attendingApt = todayAgendaApts.find((a) => a.id === attendingAppointmentId && a.status === 'PAID');
  const nextPaidTodayApt = todayAgendaApts.find((a) => a.status === 'PAID');
  const nextClientCardApt = attendingApt ?? nextPaidTodayApt;
  const isNextClientAttending = Boolean(nextClientCardApt && nextClientCardApt.id === attendingAppointmentId);
  const isNextClientLate = Boolean(
    nextClientCardApt && isLatePaidAppointment(nextClientCardApt, realTodayKey, nowTick)
  );

  /** Destaque “Próximo” na timeline só quando a grade é do mesmo dia civil (evita play em prévia de amanhã). */
  const nextTimelineApt =
    agendaDayKey === realTodayKey ? (attendingApt ?? agendaDayApts.find((a) => a.status === 'PAID')) : undefined;

  useEffect(() => {
    if (!attendingAppointmentId) return;
    const stillVisibleAndOpen = todayAgendaApts.some((a) => a.id === attendingAppointmentId && a.status === 'PAID');
    if (!stillVisibleAndOpen) setAttendingAppointmentId(null);
  }, [attendingAppointmentId, todayAgendaApts]);

  const clientLabel = (a: PartnerAgendaAppointment) =>
    a.clientDisplayName?.trim() || `Cliente #${a.clientId.slice(0, 4)}`;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-gray-900">
              {staffMode ? `Bom dia! ✂️` : `Bom dia, ${shop.name}! ✂️`}
            </h2>
            <p className="text-gray-500">
              {showingNextCalendarDay
                ? staffMode
                  ? `Após o expediente — grade de ${formatAgendaDayTitlePt(agendaDayKey)} em ${shop.name}.`
                  : 'Após o horário de encerramento, a grade já mostra os agendamentos do próximo dia.'
                : staffMode
                  ? `Agenda de hoje em ${shop.name}.`
                  : 'Aqui está o controle da sua agenda para hoje.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className={`rounded-2xl border px-4 py-3 text-xs font-bold transition-all ${
                copyLinkState === 'copied'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : copyLinkState === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-indigo-100 bg-white text-indigo-700 hover:bg-indigo-50'
              }`}
              title="Copiar link público deste estabelecimento"
            >
              <i className="fas fa-link mr-2" />
              {copyLinkState === 'copied'
                ? 'Link copiado!'
                : copyLinkState === 'error'
                  ? 'Falha ao copiar'
                  : 'Copiar link da loja'}
            </button>
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase">
                  {showingNextCalendarDay ? 'Próximo dia' : 'Hoje'}
                </p>
                <p className="text-sm font-bold text-gray-900">{agendaDayApts.length} Agendamentos</p>
              </div>
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-calendar-day"></i>
              </div>
            </div>
          </div>
        </div>
      </header>

      {showAsaasSetupBanner && (
        <div
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5 flex flex-col sm:flex-row sm:items-start gap-4 shadow-sm"
        >
          <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl">
            <i className="fas fa-building-columns" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">Cadastro da conta Asaas em conclusão</p>
            <p className="text-sm text-gray-600 mt-1">
              A plataforma está a configurar a subconta e a carteira de recebimentos da sua barbearia no Asaas. Quando os
              dados estiverem registados no sistema (carteira ativa), este aviso desaparece automaticamente — não é
              necessário concluir nada aqui no painel.
            </p>
            {shop.financeProvisionStatus === 'failed' && shop.financeProvisionLastError && (
              <p className="text-xs text-red-700 mt-2 font-medium">
                Último erro registado: {shop.financeProvisionLastError.slice(0, 200)}
                {shop.financeProvisionLastError.length > 200 ? '…' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Financial Summary Section */}
      <section className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Resumo Financeiro</h3>
            <p className="text-gray-400 text-xs">
              {staffMode
                ? 'Seus serviços; valor da lojinha só para referência (não entra no seu total).'
                : 'Acompanhe seu desempenho em tempo real.'}
            </p>
          </div>
          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
            <button onClick={() => setPeriod('TODAY')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${period === 'TODAY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>Hoje</button>
            <button onClick={() => setPeriod('WEEK')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${period === 'WEEK' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>7 dias</button>
            <button onClick={() => setPeriod('MONTH')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${period === 'MONTH' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>30 dias</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-indigo-50/50 border border-indigo-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-indigo-200">
              <i className="fas fa-scissors"></i>
            </div>
            <div>
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Serviços</p>
              <p className="text-xl font-black text-gray-900">R$ {financialSummary.servicesRevenue.toFixed(2)}</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-emerald-50/50 border border-emerald-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-emerald-200">
              <i className="fas fa-shopping-bag"></i>
            </div>
            <div>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                Produtos{staffMode ? ' (loja)' : ''}
              </p>
              <p className="text-xl font-black text-gray-900">R$ {financialSummary.productsRevenue.toFixed(2)}</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900 text-white flex items-center gap-4 shadow-xl">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl">
              <i className="fas fa-wallet text-indigo-400"></i>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Faturamento Total</p>
              <p className="text-xl font-black">R$ {financialSummary.total.toFixed(2)}</p>
              {staffMode ? (
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Igual a <span className="text-gray-400 font-semibold">Serviços</span> — vendas da loja não somam no
                  seu total.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna da Esquerda: Próximo e Filtros */}
        <div className="space-y-6">
          {/* Next Client Card */}
          {nextClientCardApt && (
            <div
              className={`bg-white p-6 rounded-4xl border-2 shadow-lg relative overflow-hidden ${
                isNextClientLate
                  ? 'border-amber-500 ring-2 ring-amber-300/60'
                  : 'border-indigo-600'
              }`}
            >
              <div
                className={`absolute top-0 right-0 text-white px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest ${
                  isNextClientLate ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
              >
                {isNextClientAttending ? 'Atendendo' : isNextClientLate ? 'Atrasado' : 'Próximo Cliente'}
              </div>
              <div className="flex items-center gap-4 mb-6 pt-2">
                <ClientAppointmentAvatar apt={nextClientCardApt} />
                <div>
                  <h4 className="font-black text-gray-900 text-xl">{clientLabel(nextClientCardApt)}</h4>
                  <p
                    className={`font-bold flex items-center gap-2 ${
                      isNextClientLate ? 'text-amber-600' : 'text-indigo-600'
                    }`}
                  >
                    <i className={`fas ${isNextClientLate ? 'fa-triangle-exclamation' : 'fa-clock'}`}></i>{' '}
                    {nextClientCardApt.time} {isNextClientLate ? '(atrasado)' : '(em 15 min)'}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl mb-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Serviço</p>
                <p className="font-bold text-gray-800">
                  {shop.services.find(s => s.id === nextClientCardApt.serviceId)?.name}
                </p>
                <div className="flex justify-between mt-2">
                   <p className="text-xs text-gray-500">Com: {shop.professionals.find(p => p.id === nextClientCardApt.professionalId)?.name}</p>
                   <p className="text-xs font-black text-indigo-600">R$ {nextClientCardApt.amount}</p>
                </div>
              </div>
              <button
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-70 disabled:cursor-not-allowed"
                onClick={async () => {
                  if (!nextClientCardApt?.id || completingId) return;
                  if (isNextClientAttending) {
                    setCompletingId(nextClientCardApt.id);
                    try {
                      await onMarkAppointmentCompleted?.(nextClientCardApt.id);
                      setAttendingAppointmentId(null);
                    } finally {
                      setCompletingId(null);
                    }
                    return;
                  }
                  setAttendingAppointmentId(nextClientCardApt.id);
                }}
                disabled={!onMarkAppointmentCompleted || !!completingId}
              >
                {completingId === nextClientCardApt?.id ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i> Aguarde...
                  </>
                ) : isNextClientAttending ? (
                  <>
                    <i className="fas fa-check mr-2"></i> Concluir
                  </>
                ) : (
                  <>
                    <i className="fas fa-play mr-2"></i> Iniciar Atendimento
                  </>
                )}
              </button>
            </div>
          )}

          {!staffMode && (
            <div className="bg-white p-6 rounded-4xl border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-widest">Filtrar Equipe</h3>
              <div className="space-y-2">
                <button 
                  onClick={() => setFilterPro('ALL')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${filterPro === 'ALL' ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' : 'border-gray-50 text-gray-500 hover:bg-gray-50'}`}
                >
                  <span>Todos</span>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-md shadow-sm">{agendaDayApts.length}</span>
                </button>
                {shop.professionals.map(pro => (
                  <button 
                    key={pro.id}
                    onClick={() => setFilterPro(pro.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${filterPro === pro.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' : 'border-gray-50 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <img src={pro.avatar} className="w-6 h-6 rounded-full object-cover" alt="" />
                    <span className="flex-1 text-left text-sm">{pro.name}</span>
                    <span className="text-xs opacity-50">{agendaDayApts.filter((a) => a.professionalId === pro.id).length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna da Direita: Timeline do Dia */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-8">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {showingNextCalendarDay ? 'Agenda de amanhã' : 'Agenda do Dia'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 capitalize">{formatAgendaDayTitlePt(agendaDayKey)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                 <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Finalizado</span>
                 <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" /> Atraso</span>
                 <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" /> Próximo</span>
                 <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" /> Atendendo</span>
              </div>
            </div>

            <div className="relative space-y-1">
              {/* Linha vertical da timeline */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100 ml-px"></div>

              {filteredApts.length > 0 ? filteredApts.map((apt) => {
                const pro = shop.professionals.find(p => p.id === apt.professionalId);
                const service = shop.services.find(s => s.id === apt.serviceId);
                const isAttending = apt.id === attendingAppointmentId && apt.status === 'PAID';
                const isNext = nextTimelineApt?.id === apt.id;
                const isCompleted = apt.status === 'COMPLETED';
                const isLate = isLatePaidAppointment(apt, agendaDayKey, nowTick);

                const markerClass = isCompleted
                  ? 'bg-green-500 text-white'
                  : isAttending
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-200/60 ring-2 ring-blue-300 ring-offset-2 ring-offset-white dark:shadow-blue-900/40 dark:ring-blue-400/80 dark:ring-offset-zinc-900'
                    : isLate
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-200/60 animate-pulse ring-2 ring-amber-300 ring-offset-2 ring-offset-white dark:shadow-amber-900/40 dark:ring-amber-400/80 dark:ring-offset-zinc-900'
                      : isNext
                        ? 'bg-indigo-600 scale-110 ring-4 ring-indigo-50 text-white'
                        : 'bg-gray-200 group-hover:bg-indigo-400 text-gray-600';

                const markerIcon = isCompleted
                  ? 'fa-check'
                  : isAttending
                    ? 'fa-user-clock'
                    : isLate
                      ? 'fa-user-clock'
                      : isNext
                        ? 'fa-play'
                        : 'fa-clock';

                const rowScale = (isNext || isAttending) && !isLate && !isCompleted ? 'scale-[1.02]' : isLate ? 'scale-[1.01]' : '';

                return (
                  <div key={apt.id} className={`relative pl-12 pb-8 group ${rowScale}`}>
                    <div
                      className={`absolute left-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white shadow-md transition-all dark:border-zinc-900 ${markerClass}`}
                      aria-hidden
                    >
                      <i className={`text-[10px] fas ${markerIcon}`} />
                    </div>

                    <div
                      className={`flex flex-col items-start justify-between gap-4 rounded-3xl border p-5 transition-all sm:flex-row sm:items-center ${
                        isLate
                          ? 'border-amber-200 bg-amber-50/90 shadow-sm ring-1 ring-amber-100 dark:border-amber-600/40 dark:bg-amber-950/70 dark:ring-amber-500/20'
                          : isAttending
                            ? 'border-blue-200 bg-blue-50 shadow-sm'
                            : isNext && !isCompleted
                              ? 'border-indigo-200 bg-indigo-50 shadow-sm'
                              : 'border-gray-100 bg-white hover:border-indigo-100 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                         <div className="min-w-[60px] text-center">
                            <p
                              className={`text-lg font-black leading-none ${
                                isLate ? 'text-zinc-900 dark:text-amber-50' : 'text-gray-900'
                              }`}
                            >
                              {apt.time}
                            </p>
                            <p
                              className={`mt-1 text-[10px] font-bold uppercase ${
                                isLate ? 'text-zinc-600 dark:text-amber-200/90' : 'text-gray-400'
                              }`}
                            >
                              Horário
                            </p>
                         </div>
                         <div
                           className={`hidden h-10 w-px sm:block ${isLate ? 'bg-amber-200 dark:bg-amber-700/50' : 'bg-gray-100'}`}
                         />
                         <ClientAppointmentAvatar apt={apt} sizeClass="w-10 h-10 rounded-xl text-sm" />
                         <div>
                            <h4 className={`font-bold ${isLate ? 'text-zinc-900 dark:text-amber-50' : 'text-gray-900'}`}>
                              {clientLabel(apt)}
                            </h4>
                            <p className={`text-sm ${isLate ? 'text-zinc-700 dark:text-amber-100/95' : 'text-gray-500'}`}>
                              {service?.name}
                            </p>
                         </div>
                      </div>

                      <div className="flex w-full items-center justify-between gap-6 sm:w-auto">
                        <div className="flex items-center gap-3">
                           <div className="hidden text-right sm:block">
                              <p
                                className={`text-[10px] font-bold uppercase ${
                                  isLate ? 'text-zinc-600 dark:text-amber-200/90' : 'text-gray-400'
                                }`}
                              >
                                Profissional
                              </p>
                              <p className={`text-xs font-bold ${isLate ? 'text-zinc-800 dark:text-amber-50' : 'text-gray-700'}`}>
                                {pro?.name}
                              </p>
                           </div>
                           <img
                             src={pro?.avatar}
                             className={`h-10 w-10 rounded-xl border-2 object-cover shadow-sm ${
                               isLate ? 'border-amber-200 dark:border-amber-700/60' : 'border-white'
                             }`}
                             alt=""
                           />
                        </div>
                        <div className="flex gap-2">
                          <button className="w-10 h-10 rounded-xl bg-gray-50 text-gray-400 hover:bg-green-50 hover:text-green-600 transition-all flex items-center justify-center">
                            <i className="fas fa-check"></i>
                          </button>
                          <button className="w-10 h-10 rounded-xl bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center">
                            <i className="fas fa-ellipsis-v"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="py-20 text-center space-y-4">
                   <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-200 text-4xl">
                      <i className="fas fa-calendar-day"></i>
                   </div>
                   <p className="text-gray-400 font-medium">Nenhum agendamento encontrado para os filtros aplicados.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopDashboard;
