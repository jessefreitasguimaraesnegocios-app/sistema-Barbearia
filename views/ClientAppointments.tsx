
import React from 'react';
import { Appointment, Shop, User } from '../types';

interface ClientAppointmentsProps {
  appointments: Appointment[];
  shops: Shop[];
  user: User;
  onCancel: (id: string) => void;
}

const ClientAppointments: React.FC<ClientAppointmentsProps> = ({ appointments, shops, user, onCancel }) => {
  const userApts = appointments.filter(a => a.clientId === user.id);

  const handleCancel = (apt: Appointment) => {
    const shop = shops.find(s => s.id === apt.shopId);
    if (window.confirm(`Tem certeza que deseja cancelar seu agendamento na ${shop?.name}?\n\nImportante: Conforme nossa política, apenas 50% do valor (R$ ${(apt.amount / 2).toFixed(2)}) será reembolsado.`)) {
      onCancel(apt.id);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Meus Agendamentos</h2>
        <p className="text-gray-500">Acompanhe seus horários e serviços marcados.</p>
      </header>

      {userApts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userApts.map(apt => {
            const shop = shops.find(s => s.id === apt.shopId);
            const service = shop?.services.find(s => s.id === apt.serviceId);
            const pro = shop?.professionals.find(p => p.id === apt.professionalId);

            return (
              <div key={apt.id} className={`bg-white p-6 rounded-4xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-6 hover:shadow-lg transition-all relative overflow-hidden ${apt.status === 'CANCELLED' ? 'opacity-75 grayscale-[0.5]' : ''}`}>
                {apt.status === 'CANCELLED' && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex items-center justify-center animate-fade-in">
                    <div className="bg-white text-red-600 px-6 py-3 rounded-full font-black uppercase tracking-widest border-2 border-red-500 rotate-[-5deg] shadow-2xl animate-bounce-in flex items-center gap-2">
                      <i className="fas fa-times-circle"></i> Cancelado
                    </div>
                  </div>
                )}
                <div className={`w-20 h-20 bg-gray-50 rounded-2xl shrink-0 flex items-center justify-center text-indigo-600 text-2xl transition-all ${apt.status === 'CANCELLED' ? 'scale-90 opacity-50' : ''}`}>
                  <i
                    className={
                      shop?.type === 'BARBER'
                        ? 'fas fa-cut'
                        : shop?.type === 'MANICURE'
                          ? 'fas fa-hand-sparkles'
                          : 'fas fa-heart'
                    }
                  ></i>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className={`text-lg font-bold text-gray-900 transition-all ${apt.status === 'CANCELLED' ? 'line-through decoration-red-500 decoration-2' : ''}`}>{shop?.name}</h3>
                      <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${apt.status === 'PAID' ? 'bg-green-100 text-green-600' : apt.status === 'PENDING' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
                        {apt.status === 'PAID' ? 'Pago' : apt.status === 'PENDING' ? 'Aguardando pagamento' : apt.status}
                      </span>
                    </div>
                    <p className={`text-sm text-gray-500 transition-all ${apt.status === 'CANCELLED' ? 'opacity-50' : ''}`}>{service?.name} com <span className="text-gray-900 font-medium">{pro?.name}</span></p>
                  </div>
                  
                  <div className={`flex flex-wrap gap-4 pt-4 border-t border-gray-50 transition-all ${apt.status === 'CANCELLED' ? 'opacity-30' : ''}`}>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <i className="far fa-calendar-alt"></i> {apt.date}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <i className="far fa-clock"></i> {apt.time}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <i className="fas fa-money-bill-wave"></i> R$ {apt.amount.toFixed(2)}
                    </div>
                  </div>

                  {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                    <button 
                      onClick={() => handleCancel(apt)}
                      className="text-red-500 text-[10px] font-bold uppercase tracking-widest hover:text-red-700 transition-colors flex items-center gap-1"
                    >
                      <i className="fas fa-times-circle"></i> Cancelar Agendamento
                    </button>
                  )}
                </div>
                <div className="sm:flex sm:flex-col sm:justify-center">
                   <button className="text-indigo-600 hover:bg-indigo-50 p-3 rounded-xl transition-all">
                     <i className="fas fa-qrcode text-xl"></i>
                   </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-4xl border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            <i className="far fa-calendar-times"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-900">Nenhum agendamento ativo</h3>
          <p className="text-gray-500 mt-2 max-w-xs mx-auto">Você ainda não agendou nenhum serviço. Procure por uma barbearia ou salão e marque seu horário!</p>
          <button className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100">Explorar Estabelecimentos</button>
        </div>
      )}
    </div>
  );
};

export default ClientAppointments;
