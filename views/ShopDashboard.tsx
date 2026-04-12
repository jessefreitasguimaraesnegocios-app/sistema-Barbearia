import React, { useState } from 'react';
import { Shop, Order, PartnerAgendaAppointment } from '../types';
import { shouldShowPartnerAsaasSetupBanner } from '../lib/partnerOnboardingBanner';

/** Igual à Agenda: só entra com pagamento confirmado; COMPLETED mantém o dia visível após atendimento. */
function isPaidOrCompletedAppointment(a: PartnerAgendaAppointment): boolean {
  return a.status === 'PAID' || a.status === 'COMPLETED';
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
  const showAsaasSetupBanner = !staffMode && shouldShowPartnerAsaasSetupBanner(shop);

  // Filtrar dados da loja
  const myApts = appointments.filter(a => a.shopId === shop.id);
  const myOrders = orders.filter(o => o.shopId === shop.id);
  const revenueOrders = myOrders.filter(orderCountsForRevenue);

  // Filtragem por período para o resumo financeiro
  const getPeriodData = (p: Period) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const paidLikeApts = myApts.filter(isPaidOrCompletedAppointment);
    let filteredApts = paidLikeApts;
    let filteredOrders = revenueOrders;

    if (p === 'TODAY') {
      filteredApts = paidLikeApts.filter(a => a.date === todayStr);
      const localDateStr = now.toLocaleDateString('pt-BR');
      filteredOrders = revenueOrders.filter(o => o.date === localDateStr);
    } else if (p === 'WEEK') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      filteredApts = paidLikeApts.filter(a => new Date(a.date) >= sevenDaysAgo);
      filteredOrders = revenueOrders.filter((o) => {
        const d = parseOrderDatePtBr(o.date);
        return d != null && !Number.isNaN(d.getTime()) && d >= sevenDaysAgo;
      });
    } else if (p === 'MONTH') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      filteredApts = paidLikeApts.filter(a => new Date(a.date) >= thirtyDaysAgo);
      filteredOrders = revenueOrders.filter((o) => {
        const d = parseOrderDatePtBr(o.date);
        return d != null && !Number.isNaN(d.getTime()) && d >= thirtyDaysAgo;
      });
    }

    const servicesRevenue = filteredApts.reduce((sum, a) => sum + a.amount, 0);
    const productsRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);

    return {
      servicesRevenue,
      productsRevenue,
      total: servicesRevenue + productsRevenue,
      count: filteredApts.length + filteredOrders.length
    };
  };

  const financialSummary = getPeriodData(period);

  // Dados para a Timeline de Hoje (mesma regra da Agenda: só pagos; COMPLETED = já atendidos no dia)
  const today = new Date().toISOString().split('T')[0];
  const todayApts = myApts
    .filter((a) => a.date === today && isPaidOrCompletedAppointment(a))
    .sort((a, b) => a.time.localeCompare(b.time));

  const filteredApts = filterPro === 'ALL' 
    ? todayApts 
    : todayApts.filter(a => a.professionalId === filterPro);

  const nextApt = todayApts.find((a) => a.status === 'PAID');

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
              {staffMode
                ? `Agenda de hoje em ${shop.name}.`
                : 'Aqui está o controle da sua agenda para hoje.'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Hoje</p>
                <p className="text-sm font-bold text-gray-900">{todayApts.length} Agendamentos</p>
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
            <p className="text-gray-400 text-xs">Acompanhe seu desempenho em tempo real.</p>
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
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Produtos</p>
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
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna da Esquerda: Próximo e Filtros */}
        <div className="space-y-6">
          {/* Next Client Card */}
          {nextApt && (
            <div className="bg-white p-6 rounded-4xl border-2 border-indigo-600 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest">
                Próximo Cliente
              </div>
              <div className="flex items-center gap-4 mb-6 pt-2">
                <ClientAppointmentAvatar apt={nextApt} />
                <div>
                  <h4 className="font-black text-gray-900 text-xl">{clientLabel(nextApt)}</h4>
                  <p className="text-indigo-600 font-bold flex items-center gap-2">
                    <i className="fas fa-clock"></i> {nextApt.time} (em 15 min)
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl mb-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Serviço</p>
                <p className="font-bold text-gray-800">
                  {shop.services.find(s => s.id === nextApt.serviceId)?.name}
                </p>
                <div className="flex justify-between mt-2">
                   <p className="text-xs text-gray-500">Com: {shop.professionals.find(p => p.id === nextApt.professionalId)?.name}</p>
                   <p className="text-xs font-black text-indigo-600">R$ {nextApt.amount}</p>
                </div>
              </div>
              <button
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-70 disabled:cursor-not-allowed"
                onClick={() => {
                  if (!nextApt?.id || completingId) return;
                  setCompletingId(nextApt.id);
                  onMarkAppointmentCompleted?.(nextApt.id)?.finally(() => setCompletingId(null));
                }}
                disabled={!onMarkAppointmentCompleted || !!completingId}
              >
                {completingId === nextApt?.id ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i> Aguarde...
                  </>
                ) : (
                  'Iniciar Atendimento'
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
                  <span className="text-xs bg-white px-2 py-0.5 rounded-md shadow-sm">{todayApts.length}</span>
                </button>
                {shop.professionals.map(pro => (
                  <button 
                    key={pro.id}
                    onClick={() => setFilterPro(pro.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${filterPro === pro.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' : 'border-gray-50 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <img src={pro.avatar} className="w-6 h-6 rounded-full object-cover" alt="" />
                    <span className="flex-1 text-left text-sm">{pro.name}</span>
                    <span className="text-xs opacity-50">{todayApts.filter(a => a.professionalId === pro.id).length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna da Direita: Timeline do Dia */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-gray-900">Agenda do Dia</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                 <span className="w-2 h-2 rounded-full bg-green-500"></span> Finalizado
                 <span className="w-2 h-2 rounded-full bg-indigo-500 ml-2"></span> Agora
              </div>
            </div>

            <div className="relative space-y-1">
              {/* Linha vertical da timeline */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100 ml-px"></div>

              {filteredApts.length > 0 ? filteredApts.map((apt, idx) => {
                const pro = shop.professionals.find(p => p.id === apt.professionalId);
                const service = shop.services.find(s => s.id === apt.serviceId);
                const isNext = nextApt?.id === apt.id;
                const isCompleted = apt.status === 'COMPLETED';

                return (
                  <div key={apt.id} className={`relative pl-12 pb-8 group ${isNext ? 'scale-[1.02]' : ''}`}>
                    {/* Marcador da timeline: verde + check branco = finalizado; indigo = próximo; cinza = aguardando */}
                    <div className={`absolute left-0 w-9 h-9 rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isNext
                          ? 'bg-indigo-600 scale-110 ring-4 ring-indigo-50 text-white'
                          : 'bg-gray-200 group-hover:bg-indigo-400 text-gray-600'
                    }`}>
                      <i className={`text-[10px] fas ${isNext && !isCompleted ? 'fa-play' : 'fa-check'}`}></i>
                    </div>

                    <div className={`p-5 rounded-3xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isNext ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:border-indigo-100 hover:shadow-md'}`}>
                      <div className="flex items-center gap-4">
                         <div className="text-center min-w-[60px]">
                            <p className="text-lg font-black text-gray-900 leading-none">{apt.time}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Hórario</p>
                         </div>
                         <div className="w-px h-10 bg-gray-100 hidden sm:block"></div>
                         <ClientAppointmentAvatar apt={apt} sizeClass="w-10 h-10 rounded-xl text-sm" />
                         <div>
                            <h4 className="font-bold text-gray-900">{clientLabel(apt)}</h4>
                            <p className="text-sm text-gray-500">{service?.name}</p>
                         </div>
                      </div>

                      <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                        <div className="flex items-center gap-3">
                           <div className="text-right hidden sm:block">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">Profissional</p>
                              <p className="text-xs font-bold text-gray-700">{pro?.name}</p>
                           </div>
                           <img src={pro?.avatar} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm" alt="" />
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
