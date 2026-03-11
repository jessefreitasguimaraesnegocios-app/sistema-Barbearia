
import React, { useState } from 'react';
import { User, AppNotification } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  currentView: string;
  notifications?: AppNotification[];
  onMarkRead?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  user, 
  onLogout, 
  onNavigate, 
  currentView, 
  notifications = [],
  onMarkRead 
}) => {
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Desktop Sidebar */}
      {user && (
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0 p-6">
          <div className="mb-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <i className="fas fa-scissors"></i>
            </div>
            <h1 className="font-display text-xl font-bold text-gray-800">BeautyHub</h1>
          </div>

          <nav className="flex-1 space-y-2">
            {user.role === 'ADMIN' && (
              <button 
                onClick={() => onNavigate('admin-dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'admin-dashboard' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <i className="fas fa-chart-line w-5"></i> Dashboard Admin
              </button>
            )}
            
            {user.role === 'SHOP' && (
              <>
                <button 
                  onClick={() => onNavigate('shop-dashboard')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-dashboard' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-store w-5"></i> Minha Loja
                </button>
                <button 
                  onClick={() => onNavigate('shop-onboarding')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-onboarding' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-file-alt w-5"></i> Documentos
                </button>
                <button 
                  onClick={() => onNavigate('shop-wallet')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-wallet' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-wallet w-5"></i> Saque
                </button>
                <button 
                  onClick={() => onNavigate('shop-customization')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-customization' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-palette w-5"></i> Personalizar
                </button>
              </>
            )}

            {user.role === 'CLIENT' && (
              <>
                <button 
                  onClick={() => onNavigate('client-home')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-home' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-home w-5"></i> Início
                </button>
                <button 
                  onClick={() => onNavigate('client-appointments')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-appointments' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-calendar-check w-5"></i> Meus Agendamentos
                </button>
                <button 
                  onClick={() => onNavigate('client-orders')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-orders' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-shopping-bag w-5"></i> Meus Pedidos
                </button>
                <button 
                  onClick={() => onNavigate('client-profile')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-profile' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <i className="fas fa-user w-5"></i> Meu Perfil
                </button>
              </>
            )}
            
            {/* Desktop Notification Trigger */}
            <button 
              onClick={() => { setShowNotifCenter(true); onMarkRead?.(); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-gray-500 hover:bg-gray-50`}
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-bell w-5"></i> Notificações
              </div>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          </nav>

          <div className="pt-6 border-t border-gray-100">
            <div className="flex items-center gap-3 mb-6 p-2">
              <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`} className="w-10 h-10 rounded-full bg-gray-200" alt="avatar" />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-medium"
            >
              <i className="fas fa-sign-out-alt w-5"></i> Sair
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-gray-100 p-4 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <i className="fas fa-scissors text-xs"></i>
          </div>
          <h1 className="font-display text-lg font-bold text-gray-800">BeautyHub</h1>
        </div>
        {user && (
          <div className="flex items-center gap-2">
             <button 
              onClick={() => { setShowNotifCenter(true); onMarkRead?.(); }}
              className="p-2 relative text-gray-400"
            >
              <i className="fas fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
              )}
            </button>
            <button onClick={onLogout} className="text-gray-400 p-2">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Notification Center Drawer */}
      {showNotifCenter && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-slide-left">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Notificações</h3>
              <button onClick={() => setShowNotifCenter(false)} className="text-gray-400 hover:text-gray-900 p-2">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {notifications.length > 0 ? (
                notifications.map(n => (
                  <div key={n.id} className={`p-4 rounded-2xl border transition-all ${n.read ? 'bg-white border-gray-100 opacity-70' : 'bg-indigo-50 border-indigo-100 shadow-sm'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-gray-900 text-sm">{n.title}</h4>
                      <span className="text-[10px] text-gray-400">{n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{n.message}</p>
                    {n.type === 'SUCCESS' && <div className="mt-2 text-[10px] text-green-600 font-bold uppercase"><i className="fas fa-check-circle mr-1"></i> Sucesso</div>}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <i className="fas fa-bell-slash text-4xl mb-4"></i>
                  <p className="text-sm font-medium">Tudo limpo por aqui!</p>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100">
               <button 
                onClick={() => setShowNotifCenter(false)}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm"
               >
                 Entendido
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around p-2 z-50 shadow-2xl">
          {user.role === 'CLIENT' ? (
            <>
              <button onClick={() => onNavigate('client-home')} className={`flex flex-col items-center p-2 ${currentView === 'client-home' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-home text-xl"></i>
                <span className="text-[10px] mt-1">Início</span>
              </button>
              <button onClick={() => onNavigate('client-appointments')} className={`flex flex-col items-center p-2 ${currentView === 'client-appointments' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-calendar-alt text-xl"></i>
                <span className="text-[10px] mt-1">Agenda</span>
              </button>
              <button onClick={() => onNavigate('client-orders')} className={`flex flex-col items-center p-2 ${currentView === 'client-orders' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-shopping-bag text-xl"></i>
                <span className="text-[10px] mt-1">Pedidos</span>
              </button>
              <button onClick={() => onNavigate('client-profile')} className={`flex flex-col items-center p-2 ${currentView === 'client-profile' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-user text-xl"></i>
                <span className="text-[10px] mt-1">Perfil</span>
              </button>
            </>
          ) : user.role === 'SHOP' ? (
            <>
              <button onClick={() => onNavigate('shop-dashboard')} className={`flex flex-col items-center p-2 ${currentView === 'shop-dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-store text-xl"></i>
                <span className="text-[10px] mt-1">Painel</span>
              </button>
              <button onClick={() => onNavigate('shop-onboarding')} className={`flex flex-col items-center p-2 ${currentView === 'shop-onboarding' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-file-alt text-xl"></i>
                <span className="text-[10px] mt-1">Documentos</span>
              </button>
              <button onClick={() => onNavigate('shop-wallet')} className={`flex flex-col items-center p-2 ${currentView === 'shop-wallet' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-wallet text-xl"></i>
                <span className="text-[10px] mt-1">Saque</span>
              </button>
              <button onClick={() => onNavigate('shop-appointments')} className={`flex flex-col items-center p-2 ${currentView === 'shop-appointments' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-list text-xl"></i>
                <span className="text-[10px] mt-1">Pedidos</span>
              </button>
              <button onClick={() => onNavigate('shop-customization')} className={`flex flex-col items-center p-2 ${currentView === 'shop-customization' ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i className="fas fa-cog text-xl"></i>
                <span className="text-[10px] mt-1">Ajustes</span>
              </button>
            </>
          ) : (
            <button onClick={() => onNavigate('admin-dashboard')} className={`flex flex-col items-center p-2 ${currentView === 'admin-dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
              <i className="fas fa-shield-alt text-xl"></i>
              <span className="text-[10px] mt-1">Admin</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
};

export default Layout;
