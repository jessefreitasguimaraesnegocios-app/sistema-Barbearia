import React, { useState } from 'react';
import { User, AppNotification } from '../types';
import { shopPrimaryStyleVars } from '../lib/shopBrandCss';
import { APP_NAME } from '../lib/branding';
import { BrandThemeToggle } from './BrandThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  currentView: string;
  notifications?: AppNotification[];
  onMarkRead?: () => void;
  /** Cor da marca da loja (parceiro): ativos do menu usam esta cor */
  partnerBrandPrimary?: string | null;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  user, 
  onLogout, 
  onNavigate, 
  currentView, 
  notifications = [],
  onMarkRead,
  partnerBrandPrimary,
}) => {
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const shopNavActive =
    'bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-[var(--shop-primary)] font-semibold dark:bg-[color-mix(in_srgb,var(--shop-primary)_24%,rgba(24,24,27,0.92))] dark:ring-1 dark:ring-[color-mix(in_srgb,var(--shop-primary)_40%,transparent)]';
  const shopMobileActive =
    'text-[var(--shop-primary)] bg-[color-mix(in_srgb,var(--shop-primary)_14%,white)] rounded-xl dark:bg-[color-mix(in_srgb,var(--shop-primary)_22%,rgba(24,24,27,0.95))] dark:ring-1 dark:ring-white/10';

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row bg-gray-50 transition-[background-color] duration-300 dark:bg-zinc-950"
      style={
        user?.role === 'SHOP' || user?.role === 'STAFF' ? shopPrimaryStyleVars(partnerBrandPrimary) : undefined
      }
    >
      {/* Desktop Sidebar */}
      {user && user.role !== 'PENDING' && (
        <aside className="hidden md:flex flex-col w-64 border-r border-gray-200 bg-white bg-linear-to-b from-white to-gray-50/90 h-screen sticky top-0 p-6 transition-colors duration-300 dark:border-white/6 dark:from-zinc-900 dark:to-zinc-950 dark:bg-zinc-950">
          <div className="mb-10 flex items-center gap-3">
            <BrandThemeToggle size="md" />
            <h1 className="font-display text-xl font-bold text-gray-800 leading-tight dark:text-zinc-100">
              {APP_NAME}
            </h1>
          </div>

          <nav className="flex-1 space-y-2">
            {user.role === 'ADMIN' && (
              <>
                <button 
                  onClick={() => onNavigate('admin-dashboard')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'admin-dashboard' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-chart-line w-5"></i> Dashboard Admin
                </button>
                <button 
                  onClick={() => onNavigate('admin-wallet')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'admin-wallet' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-wallet w-5"></i> Saque
                </button>
              </>
            )}
            
            {(user.role === 'SHOP' || user.role === 'STAFF') && (
              <>
                <button 
                  onClick={() => onNavigate('shop-dashboard')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-dashboard' ? shopNavActive : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className={`fas ${user.role === 'STAFF' ? 'fa-user-tie' : 'fa-store'} w-5`}></i>{' '}
                  {user.role === 'STAFF' ? 'Painel' : 'Minha Loja'}
                </button>
                <button 
                  onClick={() => onNavigate('shop-agenda')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-agenda' ? shopNavActive : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-calendar-alt w-5"></i> Agenda
                </button>
                <button 
                  onClick={() => onNavigate('shop-orders')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-orders' ? shopNavActive : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-shopping-bag w-5"></i> Pedidos
                </button>
                <button 
                  onClick={() => onNavigate('shop-wallet')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-wallet' ? shopNavActive : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-wallet w-5"></i> Saque
                </button>
                {user.role === 'SHOP' && (
                  <button 
                    onClick={() => onNavigate('shop-customization')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'shop-customization' ? shopNavActive : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                  >
                    <i className="fas fa-palette w-5"></i> Personalizar
                  </button>
                )}
              </>
            )}

            {user.role === 'CLIENT' && (
              <>
                <button 
                  onClick={() => onNavigate('client-home')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-home' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-home w-5"></i> Início
                </button>
                <button 
                  onClick={() => onNavigate('client-appointments')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-appointments' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-calendar-check w-5"></i> Meus Agendamentos
                </button>
                <button 
                  onClick={() => onNavigate('client-orders')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-orders' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-shopping-bag w-5"></i> Meus Pedidos
                </button>
                <button 
                  onClick={() => onNavigate('client-profile')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'client-profile' ? 'bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25' : 'text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5'}`}
                >
                  <i className="fas fa-user w-5"></i> Meu Perfil
                </button>
              </>
            )}
            
            {/* Desktop Notification Trigger */}
            <button 
              onClick={() => { setShowNotifCenter(true); onMarkRead?.(); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-bell w-5"></i> Notificações
              </div>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          </nav>

          <div className="pt-6 border-t border-gray-100 dark:border-white/6">
            <div className="flex items-center gap-3 mb-6 p-2">
              <img
                src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`}
                className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-white shadow-sm dark:bg-zinc-700 dark:ring-zinc-600"
                alt="avatar"
              />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-gray-900 truncate dark:text-zinc-100">{user.name}</p>
                <p className="text-xs text-gray-500 truncate dark:text-zinc-500">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-medium dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <i className="fas fa-sign-out-alt w-5"></i> Sair
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Top Header */}
      <header className="md:hidden border-b border-gray-100 bg-white/90 p-4 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center transition-colors dark:border-white/6 dark:bg-zinc-950/90">
        <div className="flex items-center gap-2">
          <BrandThemeToggle size="sm" />
          <h1 className="font-display text-lg font-bold text-gray-800 leading-tight dark:text-zinc-100">{APP_NAME}</h1>
        </div>
        {user && (
          <div className="flex items-center gap-2">
             <button 
              onClick={() => { setShowNotifCenter(true); onMarkRead?.(); }}
              className="p-2 relative text-gray-400 transition-colors hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400"
            >
              <i className="fas fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-zinc-900"></span>
              )}
            </button>
            <button onClick={onLogout} className="text-gray-400 p-2 transition-colors hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-50 pb-20 transition-[background-color] duration-300 md:pb-0 dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-8%,rgba(99,102,241,0.11),transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_20%,rgba(168,85,247,0.07),transparent_50%),rgb(9_9_11)]">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>

      {/* Notification Center Drawer */}
      {showNotifCenter && (
        <div className="fixed inset-0 z-1000 flex animate-fade-in justify-end bg-black/40 backdrop-blur-sm dark:bg-black/60">
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl animate-slide-left transition-colors dark:border-l dark:border-white/6 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-gray-100 p-6 dark:border-white/6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Notificações</h3>
              <button
                onClick={() => setShowNotifCenter(false)}
                className="p-2 text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-zinc-100"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {notifications.length > 0 ? (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      n.read
                        ? 'border-gray-100 bg-white opacity-70 dark:border-white/6 dark:bg-zinc-950/80'
                        : 'border-indigo-100 bg-indigo-50 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-500/10'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-zinc-100">{n.title}</h4>
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                        {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-600 dark:text-zinc-400">{n.message}</p>
                    {n.type === 'SUCCESS' && (
                      <div className="mt-2 text-[10px] font-bold uppercase text-green-600 dark:text-emerald-400">
                        <i className="fas fa-check-circle mr-1"></i> Sucesso
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-40 dark:text-zinc-400">
                  <i className="fas fa-bell-slash mb-4 text-4xl"></i>
                  <p className="text-sm font-medium">Tudo limpo por aqui!</p>
                </div>
              )}
            </div>
            
            <div className="border-t border-gray-100 p-4 dark:border-white/6">
               <button 
                onClick={() => setShowNotifCenter(false)}
                className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
               >
                 Entendido
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {user && user.role !== 'PENDING' && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-gray-100 bg-white/95 p-2 shadow-2xl backdrop-blur-lg md:hidden dark:border-white/6 dark:bg-zinc-950/95">
          {user.role === 'CLIENT' ? (
            <>
              <button onClick={() => onNavigate('client-home')} className={`flex flex-col items-center p-2 ${currentView === 'client-home' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-home text-xl"></i>
                <span className="text-[10px] mt-1">Início</span>
              </button>
              <button onClick={() => onNavigate('client-appointments')} className={`flex flex-col items-center p-2 ${currentView === 'client-appointments' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-calendar-alt text-xl"></i>
                <span className="text-[10px] mt-1">Agenda</span>
              </button>
              <button onClick={() => onNavigate('client-orders')} className={`flex flex-col items-center p-2 ${currentView === 'client-orders' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-shopping-bag text-xl"></i>
                <span className="text-[10px] mt-1">Pedidos</span>
              </button>
              <button onClick={() => onNavigate('client-profile')} className={`flex flex-col items-center p-2 ${currentView === 'client-profile' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-user text-xl"></i>
                <span className="text-[10px] mt-1">Perfil</span>
              </button>
            </>
          ) : user.role === 'SHOP' || user.role === 'STAFF' ? (
            <>
              <button onClick={() => onNavigate('shop-dashboard')} className={`flex flex-col items-center p-2 ${currentView === 'shop-dashboard' ? shopMobileActive : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className={`fas ${user.role === 'STAFF' ? 'fa-user-tie' : 'fa-store'} text-xl`}></i>
                <span className="text-[10px] mt-1">Painel</span>
              </button>
              <button onClick={() => onNavigate('shop-agenda')} className={`flex flex-col items-center p-2 ${currentView === 'shop-agenda' ? shopMobileActive : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-calendar-alt text-xl"></i>
                <span className="text-[10px] mt-1">Agenda</span>
              </button>
              <button onClick={() => onNavigate('shop-wallet')} className={`flex flex-col items-center p-2 ${currentView === 'shop-wallet' ? shopMobileActive : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-wallet text-xl"></i>
                <span className="text-[10px] mt-1">Saque</span>
              </button>
              <button onClick={() => onNavigate('shop-orders')} className={`flex flex-col items-center p-2 ${currentView === 'shop-orders' ? shopMobileActive : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-shopping-bag text-xl"></i>
                <span className="text-[10px] mt-1">Pedidos</span>
              </button>
              {user.role === 'SHOP' && (
                <button onClick={() => onNavigate('shop-customization')} className={`flex flex-col items-center p-2 ${currentView === 'shop-customization' ? shopMobileActive : 'text-gray-400 dark:text-zinc-500'}`}>
                  <i className="fas fa-cog text-xl"></i>
                  <span className="text-[10px] mt-1">Ajustes</span>
                </button>
              )}
            </>
          ) : user.role === 'ADMIN' ? (
            <>
              <button onClick={() => onNavigate('admin-dashboard')} className={`flex flex-col items-center p-2 ${currentView === 'admin-dashboard' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-chart-line text-xl"></i>
                <span className="text-[10px] mt-1">Admin</span>
              </button>
              <button onClick={() => onNavigate('admin-wallet')} className={`flex flex-col items-center p-2 ${currentView === 'admin-wallet' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                <i className="fas fa-wallet text-xl"></i>
                <span className="text-[10px] mt-1">Saque</span>
              </button>
            </>
          ) : null}
        </nav>
      )}
    </div>
  );
};

export default Layout;
