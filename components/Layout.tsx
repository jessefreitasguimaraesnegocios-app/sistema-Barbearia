
import React, { useState } from 'react';
import { User, AppNotification } from '../types';
import { shopPrimaryStyleVars } from '../lib/shopBrandCss';
import { APP_NAME } from '../lib/branding';
import { ThemeLogoButton } from './ThemeLogoButton';

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
  /**
   * Sessão já existe mas o perfil ainda carrega (role PENDING).
   * Mostra o menu de cliente para o catálogo aparecer cedo, sem ecrã inteiro a bloquear.
   */
  showClientShellDuringProfileLoad?: boolean;
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
  showClientShellDuringProfileLoad = false,
}) => {
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const showClientNav =
    user?.role === 'CLIENT' || (showClientShellDuringProfileLoad && user?.role === 'PENDING');
  const showAppChrome =
    user && (user.role !== 'PENDING' || showClientShellDuringProfileLoad);

  const shopNavActive =
    'bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-[var(--shop-primary)] font-semibold shadow-sm dark:bg-[color-mix(in_srgb,var(--shop-primary)_24%,#141414)] dark:text-[color-mix(in_srgb,var(--shop-primary)_90%,white)] dark:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]';
  const shopMobileActive =
    'rounded-xl bg-[color-mix(in_srgb,var(--shop-primary)_14%,white)] text-[var(--shop-primary)] shadow-sm dark:bg-[color-mix(in_srgb,var(--shop-primary)_22%,#141414)] dark:text-[color-mix(in_srgb,var(--shop-primary)_90%,white)]';

  const navInactive =
    'text-(--app-text-muted) hover:bg-(--app-nav-hover) transition-all duration-200 ease-out';
  const navActiveIndigo =
    'bg-indigo-50 font-semibold text-indigo-600 shadow-sm dark:bg-indigo-500/14 dark:text-indigo-300';

  return (
    <div
      data-app-shell
      className="flex min-h-screen flex-col bg-transparent text-(--app-text) transition-[color] duration-300 ease-out md:flex-row"
      style={
        user?.role === 'SHOP' || user?.role === 'STAFF' ? shopPrimaryStyleVars(partnerBrandPrimary) : undefined
      }
    >
      {/* Desktop Sidebar */}
      {showAppChrome && (
        <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-(--app-border) bg-(--app-sidebar-solid) p-6 shadow-(--app-shadow-sm) backdrop-blur-xl dark:border-(--app-border) dark:bg-[color-mix(in_oklab,var(--app-sidebar-solid)_88%,transparent)] md:flex">
          <div className="mb-10 flex items-center gap-3">
            <ThemeLogoButton size="md" />
            <h1 className="font-display text-xl font-bold leading-tight text-gray-800 dark:text-zinc-100">{APP_NAME}</h1>
          </div>

          <nav className="flex-1 space-y-2">
            {user.role === 'ADMIN' && (
              <>
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'admin-dashboard' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-chart-line w-5"></i> Dashboard Admin
                </button>
                <button
                  onClick={() => onNavigate('admin-wallet')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'admin-wallet' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-wallet w-5"></i> Saque
                </button>
                <button
                  onClick={() => onNavigate('admin-owner-whatsapp')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'admin-owner-whatsapp' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fab fa-whatsapp w-5"></i> WhatsApp
                </button>
              </>
            )}

            {(user.role === 'SHOP' || user.role === 'STAFF') && (
              <>
                <button
                  onClick={() => onNavigate('shop-dashboard')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'shop-dashboard' ? shopNavActive : navInactive
                  }`}
                >
                  <i className={`fas ${user.role === 'STAFF' ? 'fa-user-tie' : 'fa-store'} w-5`}></i>{' '}
                  {user.role === 'STAFF' ? 'Painel' : 'Minha Loja'}
                </button>
                <button
                  onClick={() => onNavigate('shop-agenda')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'shop-agenda' ? shopNavActive : navInactive
                  }`}
                >
                  <i className="fas fa-calendar-alt w-5"></i> Agenda
                </button>
                <button
                  onClick={() => onNavigate('shop-orders')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'shop-orders' ? shopNavActive : navInactive
                  }`}
                >
                  <i className="fas fa-shopping-bag w-5"></i> Pedidos
                </button>
                <button
                  onClick={() => onNavigate('shop-wallet')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'shop-wallet' ? shopNavActive : navInactive
                  }`}
                >
                  <i className="fas fa-wallet w-5"></i> Saque
                </button>
                {user.role === 'SHOP' && (
                  <button
                    onClick={() => onNavigate('shop-customization')}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                      currentView === 'shop-customization' ? shopNavActive : navInactive
                    }`}
                  >
                    <i className="fas fa-palette w-5"></i> Personalizar
                  </button>
                )}
              </>
            )}

            {showClientNav && (
              <>
                <button
                  onClick={() => onNavigate('client-home')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'client-home' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-home w-5"></i> Início
                </button>
                <button
                  onClick={() => onNavigate('client-appointments')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'client-appointments' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-calendar-check w-5"></i> Meus Agendamentos
                </button>
                <button
                  onClick={() => onNavigate('client-orders')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'client-orders' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-shopping-bag w-5"></i> Meus Pedidos
                </button>
                <button
                  onClick={() => onNavigate('client-profile')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    currentView === 'client-profile' ? navActiveIndigo : navInactive
                  }`}
                >
                  <i className="fas fa-user w-5"></i> Meu Perfil
                </button>
              </>
            )}

            <button
              onClick={() => {
                setShowNotifCenter(true);
                onMarkRead?.();
              }}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 ${navInactive}`}
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-bell w-5"></i> Notificações
              </div>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>
          </nav>

          <div className="border-t border-(--app-border) pt-6">
            <div className="mb-6 flex items-center gap-3 p-2">
              <img
                src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`}
                className="h-10 w-10 rounded-full bg-zinc-200 ring-2 ring-white/80 dark:bg-zinc-700 dark:ring-white/10"
                alt="avatar"
              />
              <div className="min-w-0 overflow-hidden">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-zinc-100">{user.name}</p>
                <p className="truncate text-xs text-(--app-text-muted)">{user.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 font-medium text-red-600 transition-colors duration-200 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
            >
              <i className="fas fa-sign-out-alt w-5"></i> Sair
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-(--app-border) bg-(--app-sidebar-solid)/95 p-4 shadow-sm backdrop-blur-xl dark:bg-[color-mix(in_oklab,var(--app-sidebar-solid)_92%,transparent)] md:hidden">
        <div className="flex items-center gap-2">
          <ThemeLogoButton size="sm" />
          <h1 className="font-display text-lg font-bold leading-tight text-gray-800 dark:text-zinc-100">{APP_NAME}</h1>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowNotifCenter(true);
                onMarkRead?.();
              }}
              className="relative rounded-xl p-2 text-(--app-text-muted) transition-colors duration-200 hover:bg-(--app-nav-hover) hover:text-(--app-text)"
            >
              <i className="fas fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-(--app-sidebar-solid) bg-red-500 dark:border-zinc-900" />
              )}
            </button>
            <button
              onClick={onLogout}
              className="rounded-xl p-2 text-(--app-text-muted) transition-colors duration-200 hover:bg-(--app-nav-hover) hover:text-(--app-text)"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>

      {/* Notification Center Drawer */}
      {showNotifCenter && (
        <div className="animate-fade-in fixed inset-0 z-1000 flex justify-end bg-black/40 backdrop-blur-sm dark:bg-black/60">
          <div className="glass-panel flex h-full w-full max-w-sm animate-slide-left flex-col border-l border-(--app-border) shadow-2xl dark:border-(--app-border) dark:bg-[color-mix(in_oklab,var(--app-elevated)_96%,transparent)]">
            <div className="flex items-center justify-between border-b border-(--app-border) p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-50">Notificações</h3>
              <button
                onClick={() => setShowNotifCenter(false)}
                className="rounded-xl p-2 text-(--app-text-muted) transition-colors duration-200 hover:bg-(--app-nav-hover) hover:text-(--app-text)"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-2xl border p-4 transition-all duration-200 ${
                      n.read
                        ? 'border-(--app-border) bg-(--app-elevated) opacity-75 dark:bg-zinc-900/50'
                        : 'border-indigo-200/80 bg-indigo-50 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-500/12'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-zinc-100">{n.title}</h4>
                      <span className="text-[10px] text-(--app-text-muted)">
                        {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-600 dark:text-zinc-400">{n.message}</p>
                    {n.type === 'SUCCESS' && (
                      <div className="mt-2 text-[10px] font-bold uppercase text-green-600 dark:text-green-400">
                        <i className="fas fa-check-circle mr-1"></i> Sucesso
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-50">
                  <i className="fas fa-bell-slash mb-4 text-4xl"></i>
                  <p className="text-sm font-medium">Tudo limpo por aqui!</p>
                </div>
              )}
            </div>

            <div className="border-t border-(--app-border) p-4">
              <button
                onClick={() => setShowNotifCenter(false)}
                className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:bg-zinc-800 hover:shadow-xl dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {showAppChrome && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-(--app-border) bg-(--app-sidebar-solid)/95 p-2 shadow-(--app-shadow-md) backdrop-blur-xl dark:bg-[color-mix(in_oklab,var(--app-sidebar-solid)_94%,transparent)] md:hidden">
          {showClientNav ? (
            <>
              <button
                onClick={() => onNavigate('client-home')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'client-home'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-home text-xl"></i>
                <span className="mt-1 text-[10px]">Início</span>
              </button>
              <button
                onClick={() => onNavigate('client-appointments')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'client-appointments'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-calendar-alt text-xl"></i>
                <span className="mt-1 text-[10px]">Agenda</span>
              </button>
              <button
                onClick={() => onNavigate('client-orders')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'client-orders'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-shopping-bag text-xl"></i>
                <span className="mt-1 text-[10px]">Pedidos</span>
              </button>
              <button
                onClick={() => onNavigate('client-profile')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'client-profile'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-user text-xl"></i>
                <span className="mt-1 text-[10px]">Perfil</span>
              </button>
            </>
          ) : user.role === 'SHOP' || user.role === 'STAFF' ? (
            <>
              <button
                onClick={() => onNavigate('shop-dashboard')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'shop-dashboard' ? shopMobileActive : 'text-(--app-text-muted)'
                }`}
              >
                <i className={`fas ${user.role === 'STAFF' ? 'fa-user-tie' : 'fa-store'} text-xl`}></i>
                <span className="mt-1 text-[10px]">Painel</span>
              </button>
              <button
                onClick={() => onNavigate('shop-agenda')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'shop-agenda' ? shopMobileActive : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-calendar-alt text-xl"></i>
                <span className="mt-1 text-[10px]">Agenda</span>
              </button>
              <button
                onClick={() => onNavigate('shop-wallet')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'shop-wallet' ? shopMobileActive : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-wallet text-xl"></i>
                <span className="mt-1 text-[10px]">Saque</span>
              </button>
              <button
                onClick={() => onNavigate('shop-orders')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'shop-orders' ? shopMobileActive : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-shopping-bag text-xl"></i>
                <span className="mt-1 text-[10px]">Pedidos</span>
              </button>
              {user.role === 'SHOP' && (
                <button
                  onClick={() => onNavigate('shop-customization')}
                  className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                    currentView === 'shop-customization' ? shopMobileActive : 'text-(--app-text-muted)'
                  }`}
                >
                  <i className="fas fa-cog text-xl"></i>
                  <span className="mt-1 text-[10px]">Ajustes</span>
                </button>
              )}
            </>
          ) : user.role === 'ADMIN' ? (
            <>
              <button
                onClick={() => onNavigate('admin-dashboard')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'admin-dashboard'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-chart-line text-xl"></i>
                <span className="mt-1 text-[10px]">Admin</span>
              </button>
              <button
                onClick={() => onNavigate('admin-wallet')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'admin-wallet'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fas fa-wallet text-xl"></i>
                <span className="mt-1 text-[10px]">Saque</span>
              </button>
              <button
                onClick={() => onNavigate('admin-owner-whatsapp')}
                className={`flex flex-col items-center rounded-xl p-2 transition-colors duration-200 ${
                  currentView === 'admin-owner-whatsapp'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-(--app-text-muted)'
                }`}
              >
                <i className="fab fa-whatsapp text-xl"></i>
                <span className="mt-1 text-[10px]">WhatsApp</span>
              </button>
            </>
          ) : null}
        </nav>
      )}
    </div>
  );
};

export default Layout;
