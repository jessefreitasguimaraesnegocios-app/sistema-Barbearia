
import React, { useState } from 'react';
import { Shop, Appointment, Order } from '../types';

interface ShopDashboardProps {
  shop: Shop;
  appointments: Appointment[];
  orders: Order[];
}

type Period = 'TODAY' | 'WEEK' | 'MONTH';

const ShopDashboard: React.FC<ShopDashboardProps> = ({ shop, appointments, orders }) => {
  const [filterPro, setFilterPro] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('TODAY');

  // Filtrar dados da loja
  const myApts = appointments.filter(a => a.shopId === shop.id);
  const myOrders = orders.filter(o => o.shopId === shop.id);

  // Filtragem por período para o resumo financeiro
  const getPeriodData = (p: Period) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let filteredApts = myApts;
    let filteredOrders = myOrders;

    if (p === 'TODAY') {
      filteredApts = myApts.filter(a => a.date === todayStr);
      // Para orders, como o mock usa dd/mm/aaaa ou data local, vamos simplificar a detecção de hoje
      const localDateStr = now.toLocaleDateString('pt-BR');
      filteredOrders = myOrders.filter(o => o.date === localDateStr);
    } else if (p === 'WEEK') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      filteredApts = myApts.filter(a => new Date(a.date) >= sevenDaysAgo);
      // No mock de ordens, as datas são strings. Em um app real usaríamos timestamps.
      filteredOrders = myOrders; // Mantendo para fins de UI no mock
    } else if (p === 'MONTH') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      filteredApts = myApts.filter(a => new Date(a.date) >= thirtyDaysAgo);
      filteredOrders = myOrders;
    }

    const servicesRevenue = filteredApts.reduce((sum, a) => sum + (a.status === 'PAID' || a.status === 'COMPLETED' ? a.amount : 0), 0);
    const productsRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);

    return {
      servicesRevenue,
      productsRevenue,
      total: servicesRevenue + productsRevenue,
      count: filteredApts.length + filteredOrders.length
    };
  };

  const financialSummary = getPeriodData(period);

  // Dados para a Timeline de Hoje
  const today = new Date().toISOString().split('T')[0];
  const todayApts = myApts
    .filter(a => a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  const filteredApts = filterPro === 'ALL' 
    ? todayApts 
    : todayApts.filter(a => a.professionalId === filterPro);

  const nextApt = todayApts.find(a => a.status === 'PAID' || a.status === 'PENDING');

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-gray-900">Bom dia, {shop.name}! ✂️</h2>
            <p className="text-gray-500">Aqui está o controle da sua agenda para hoje.</p>
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

      {/* Financial Summary Section */}
      <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm">
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
            <div className="bg-white p-6 rounded-[2rem] border-2 border-indigo-600 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest">
                Próximo Cliente
              </div>
              <div className="flex items-center gap-4 mb-6 pt-2">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 text-xl font-bold">
                  {nextApt.clientId.substr(0, 1).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-black text-gray-900 text-xl">Cliente #{nextApt.clientId.substr(0, 4)}</h4>
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
              <button className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                Iniciar Atendimento
              </button>
            </div>
          )}

          {/* Quick Filters */}
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
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
        </div>

        {/* Coluna da Direita: Timeline do Dia */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-gray-900">Agenda do Dia</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                 <span className="w-2 h-2 rounded-full bg-green-500"></span> Confirmado
                 <span className="w-2 h-2 rounded-full bg-indigo-500 ml-2"></span> Agora
              </div>
            </div>

            <div className="relative space-y-1">
              {/* Linha vertical da timeline */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100 ml-[1px]"></div>

              {filteredApts.length > 0 ? filteredApts.map((apt, idx) => {
                const pro = shop.professionals.find(p => p.id === apt.professionalId);
                const service = shop.services.find(s => s.id === apt.serviceId);
                const isNext = nextApt?.id === apt.id;

                return (
                  <div key={apt.id} className={`relative pl-12 pb-8 group ${isNext ? 'scale-[1.02]' : ''}`}>
                    {/* Marcador da timeline */}
                    <div className={`absolute left-0 w-9 h-9 rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center transition-all ${isNext ? 'bg-indigo-600 scale-110 ring-4 ring-indigo-50' : 'bg-gray-200 group-hover:bg-indigo-400'}`}>
                      <i className={`text-[10px] text-white fas ${isNext ? 'fa-play' : 'fa-check'}`}></i>
                    </div>

                    <div className={`p-5 rounded-3xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isNext ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:border-indigo-100 hover:shadow-md'}`}>
                      <div className="flex items-center gap-4">
                         <div className="text-center min-w-[60px]">
                            <p className="text-lg font-black text-gray-900 leading-none">{apt.time}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Hórario</p>
                         </div>
                         <div className="w-px h-10 bg-gray-100 hidden sm:block"></div>
                         <div>
                            <h4 className="font-bold text-gray-900">Cliente #{apt.clientId.substr(0, 4)}</h4>
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
