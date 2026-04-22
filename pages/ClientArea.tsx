import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ClientHome from '../views/ClientHome';
import ShopDetails from '../views/ShopDetails';
import ClientAppointments from '../views/ClientAppointments';
import ClientOrders from '../views/ClientOrders';
import ClientProfile from '../views/ClientProfile';
import { LoginForm } from '../components/LoginForm';
import { Shop, Appointment, Order } from '../types';
import { supabase } from '../src/lib/supabase';
import { APP_NAME } from '../lib/branding';
import { ThemeLogoButton } from '../components/ThemeLogoButton';
import { isPartnerOrAdminRole } from '../lib/profileRole';
import { mapRowToAppointment } from '../services/supabase/appointmentMapping';
import { useRealtimeAppointments } from '../hooks/useRealtimeAppointments';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import { useClientCatalogShops } from '../hooks/useClientCatalogShops';
import { mapRowToOrder, ORDERS_SELECT_CLIENT, sortOrdersNewestFirst } from '../services/supabase/orderMapping';
import {
  fetchClientCatalogShopDetailById,
  fetchClientCatalogShopDetailByShareCode,
} from '../services/supabase/shops';
import {
  APPOINTMENTS_SELECT_CLIENT,
  CLIENT_LIST_PAGE_SIZE,
  sortAppointmentsClientList,
} from '../services/supabase/clientListQueries';
import { getBrazilDateStringISO } from '../lib/brazilCalendarDate';
import { appointmentsClientVisibleOrFilter, isClientListVisibleAppointment } from '../lib/clientAppointmentVisibility';
import { isClientListVisibleOrder, ordersClientVisibleOrFilter } from '../lib/clientOrderVisibility';
import { clientAreaQueryKeys } from '../lib/clientAreaQueryKeys';
import { CLIENT_AREA_FIRST_PAGE_STALE_MS } from '../lib/clientAreaCacheConfig';
import {
  fetchClientAppointmentsFirstPage,
  fetchClientOrdersFirstPage,
} from '../services/supabase/fetchClientAreaFirstPages';

type ClientNavView = 'client-home' | 'shop-details' | 'client-appointments' | 'client-orders' | 'client-profile';

export default function ClientArea() {
  const queryClient = useQueryClient();
  const { user, loading, signUp, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [appointmentsHasMore, setAppointmentsHasMore] = useState(false);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [appointmentsLoadingMore, setAppointmentsLoadingMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const appointmentsNextOffset = useRef(0);
  const ordersNextOffset = useRef(0);
  const [shopDetailsLoadingId, setShopDetailsLoadingId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'client-home' | 'shop-details' | 'client-appointments' | 'client-orders' | 'client-profile'>('client-home');
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);
  const profileHydrating = Boolean(user?.role === 'PENDING' && loading);
  const catalogEnabled = Boolean(user) || profileHydrating;

  const isClientRealtimeSession =
    Boolean(user?.id) &&
    user?.role !== 'ADMIN' &&
    user?.role !== 'SHOP' &&
    user?.role !== 'STAFF' &&
    user?.role !== 'PENDING';

  useRealtimeAppointments({
    client: supabase,
    enabled: isClientRealtimeSession,
    channelName: `client-appointments-${user?.id ?? 'anon'}`,
    postgresChangesFilter: user?.id ? `client_id=eq.${user.id}` : '',
    sortMode: 'client',
    setAppointments,
    clientUserId: user?.id,
  });

  useRealtimeOrders({
    client: supabase,
    enabled: isClientRealtimeSession,
    channelName: `client-orders-${user?.id ?? 'anon'}`,
    postgresChangesFilter: user?.id ? `client_id=eq.${user.id}` : '',
    setOrders,
    clientUserId: user?.id,
  });

  const { shops, catalogRefreshing } = useClientCatalogShops({ client: supabase, enabled: catalogEnabled });
  const deepLinkShareCode = searchParams.get('s')?.trim().toUpperCase() ?? '';
  const deepLinkShopId = searchParams.get('shop')?.trim() ?? '';

  const clearDeepLinkShopParam = useCallback(() => {
    if (!deepLinkShareCode && !deepLinkShopId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('s');
      next.delete('shop');
      return next;
    }, { replace: true });
  }, [deepLinkShareCode, deepLinkShopId, setSearchParams]);

  useEffect(() => {
    setSelectedShop((prev) => {
      if (!prev) return prev;
      const next = shops.find((s) => s.id === prev.id);
      if (!next) return prev;
      const preserveServices = prev.services.length > 0 && next.services.length === 0;
      const preserveProducts = prev.products.length > 0 && next.products.length === 0;
      if (!preserveServices && !preserveProducts && shopDetailsLoadingId !== prev.id) {
        return next;
      }
      return {
        ...next,
        services: preserveServices ? prev.services : next.services,
        products: preserveProducts ? prev.products : next.products,
        professionals: next.professionals.length ? next.professionals : prev.professionals,
      };
    });
  }, [shops, shopDetailsLoadingId]);

  const fetchAppointmentsFirstPage = useCallback(async () => {
    if (!user?.id) return;
    appointmentsNextOffset.current = 0;
    try {
      const rows = await queryClient.fetchQuery({
        queryKey: clientAreaQueryKeys.appointmentsP1(user.id),
        queryFn: () => fetchClientAppointmentsFirstPage(supabase, user.id),
        staleTime: CLIENT_AREA_FIRST_PAGE_STALE_MS,
      });
      setAppointments(rows);
      appointmentsNextOffset.current = rows.length;
      setAppointmentsHasMore(rows.length === CLIENT_LIST_PAGE_SIZE);
    } catch {
      /* mantém lista em memória */
    }
  }, [user?.id, queryClient]);

  const loadMoreAppointments = useCallback(async () => {
    if (!user?.id || appointmentsLoadingMore || !appointmentsHasMore) return;
    setAppointmentsLoadingMore(true);
    const start = appointmentsNextOffset.current;
    try {
      const todayBr = getBrazilDateStringISO();
      const { data, error } = await supabase
        .from('appointments')
        .select(APPOINTMENTS_SELECT_CLIENT)
        .eq('client_id', user.id)
        .or(appointmentsClientVisibleOrFilter(todayBr))
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .order('created_at', { ascending: false })
        .range(start, start + CLIENT_LIST_PAGE_SIZE - 1);
      if (error) return;
      const rows = data || [];
      setAppointments((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const r of rows) {
          const a = mapRowToAppointment(r as Record<string, unknown>);
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }
        return sortAppointmentsClientList(merged);
      });
      appointmentsNextOffset.current += rows.length;
      setAppointmentsHasMore(rows.length === CLIENT_LIST_PAGE_SIZE);
    } finally {
      setAppointmentsLoadingMore(false);
    }
  }, [user?.id, appointmentsLoadingMore, appointmentsHasMore]);

  const fetchOrdersFirstPage = useCallback(async () => {
    if (!user?.id) return;
    ordersNextOffset.current = 0;
    try {
      const rows = await queryClient.fetchQuery({
        queryKey: clientAreaQueryKeys.ordersP1(user.id),
        queryFn: () => fetchClientOrdersFirstPage(supabase, user.id),
        staleTime: CLIENT_AREA_FIRST_PAGE_STALE_MS,
      });
      setOrders(rows);
      ordersNextOffset.current = rows.length;
      setOrdersHasMore(rows.length === CLIENT_LIST_PAGE_SIZE);
    } catch {
      /* mantém lista em memória */
    }
  }, [user?.id, queryClient]);

  const loadMoreOrders = useCallback(async () => {
    if (!user?.id || ordersLoadingMore || !ordersHasMore) return;
    setOrdersLoadingMore(true);
    const start = ordersNextOffset.current;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDERS_SELECT_CLIENT)
        .eq('client_id', user.id)
        .or(ordersClientVisibleOrFilter())
        .order('created_at', { ascending: false })
        .range(start, start + CLIENT_LIST_PAGE_SIZE - 1);
      if (error) return;
      const rows = data || [];
      setOrders((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const r of rows) {
          const o = mapRowToOrder(r as Record<string, unknown>);
          if (!seen.has(o.id)) {
            seen.add(o.id);
            merged.push(o);
          }
        }
        return sortOrdersNewestFirst(merged);
      });
      ordersNextOffset.current += rows.length;
      setOrdersHasMore(rows.length === CLIENT_LIST_PAGE_SIZE);
    } finally {
      setOrdersLoadingMore(false);
    }
  }, [user?.id, ordersLoadingMore, ordersHasMore]);

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SHOP' || user?.role === 'STAFF' || user?.role === 'PENDING') return;
    if (!user?.id) return;
    appointmentsNextOffset.current = 0;
    ordersNextOffset.current = 0;
    void fetchAppointmentsFirstPage();
    void fetchOrdersFirstPage();
  }, [user?.id, user?.role, fetchAppointmentsFirstPage, fetchOrdersFirstPage]);

  /**
   * Sem refresh manual: ao virar o dia (BRT), remove da UI itens já expirados
   * (COMPLETED/DELIVERED) com varredura leve por minuto.
   */
  useEffect(() => {
    if (user?.role !== 'CLIENT') return;
    const prune = () => {
      setAppointments((prev) => prev.filter((a) => isClientListVisibleAppointment(a)));
      setOrders((prev) => prev.filter((o) => isClientListVisibleOrder(o)));
    };
    prune();
    const id = window.setInterval(prune, 60_000);
    return () => window.clearInterval(id);
  }, [user?.role]);

  const showClientShellDuringProfileLoad = profileHydrating;

  const addNotification = (title: string, message: string, type: 'SUCCESS' | 'INFO' | 'WARNING' = 'INFO') => {
    setNotifications((prev) => [
      {
        id: Math.random().toString(36).slice(2),
        title,
        message,
        type,
        timestamp: new Date(),
        read: false,
      },
      ...prev,
    ]);
  };

  const markAllAsRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const handleSelectShop = useCallback(
    (shop: Shop) => {
      if (user?.role !== 'CLIENT') return;
      setSelectedShop(shop);
      setCurrentView('shop-details');
      setShopDetailsLoadingId(shop.id);
      void (async () => {
        try {
          const detailed = await queryClient.fetchQuery({
            queryKey: ['client-area', 'shop-detail', shop.id],
            queryFn: () => fetchClientCatalogShopDetailById(supabase, shop.id),
            staleTime: CLIENT_AREA_FIRST_PAGE_STALE_MS,
          });
          if (!detailed) return;
          setSelectedShop((prev) => (prev?.id === shop.id ? detailed : prev));
        } catch {
          /* mantém resumo da loja e segue fluxo */
        } finally {
          setShopDetailsLoadingId((prev) => (prev === shop.id ? null : prev));
        }
      })();
    },
    [queryClient, user?.role]
  );

  useEffect(() => {
    if (!deepLinkShareCode && !deepLinkShopId) return;
    if (user?.role !== 'CLIENT') return;
    if (profileHydrating) return;

    const deepLinkLoadingRef = deepLinkShareCode || deepLinkShopId;
    setShopDetailsLoadingId(deepLinkLoadingRef);
    void (async () => {
      try {
        const detailed = deepLinkShareCode
          ? await queryClient.fetchQuery({
              queryKey: ['client-area', 'shop-detail', 'share-code', deepLinkShareCode],
              queryFn: () => fetchClientCatalogShopDetailByShareCode(supabase, deepLinkShareCode),
              staleTime: CLIENT_AREA_FIRST_PAGE_STALE_MS,
            })
          : await queryClient.fetchQuery({
              queryKey: ['client-area', 'shop-detail', deepLinkShopId],
              queryFn: () => fetchClientCatalogShopDetailById(supabase, deepLinkShopId),
              staleTime: CLIENT_AREA_FIRST_PAGE_STALE_MS,
            });

        if (detailed) {
          setSelectedShop(detailed);
          setCurrentView('shop-details');
        } else {
          setCurrentView('client-home');
          setSelectedShop(null);
        }
      } catch {
        setCurrentView('client-home');
        setSelectedShop(null);
      } finally {
        setShopDetailsLoadingId((prev) => (prev === deepLinkLoadingRef ? null : prev));
        clearDeepLinkShopParam();
      }
    })();
  }, [clearDeepLinkShopParam, deepLinkShareCode, deepLinkShopId, profileHydrating, queryClient, user?.role]);

  useEffect(() => {
    if (!profileHydrating) return;
    setCurrentView('client-home');
    setSelectedShop(null);
  }, [profileHydrating]);

  if (user?.role === 'SHOP' || user?.role === 'STAFF') return <Navigate to="/parceiros" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  if (user?.role === 'PENDING' && !loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
        <p className="text-gray-700 text-center max-w-sm">Não foi possível carregar seu perfil. Tente novamente ou use «Sou parceiro» se você for dono, equipe ou administrador.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700"
          >
            Tentar novamente
          </button>
          <a
            href="/parceiros"
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 inline-flex items-center"
          >
            Sou parceiro
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
          <div className="text-gray-500 dark:text-zinc-400">
            <i className="fas fa-spinner fa-spin text-3xl"></i>
          </div>
        </div>
      );
    }

    const handleClientLogin = async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao entrar.' };
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) {
        await supabase.auth.signOut();
        return { error: 'Não foi possível validar seu perfil. Tente de novo ou use «Sou parceiro».' };
      }
      if (isPartnerOrAdminRole(profile?.role)) {
        await supabase.auth.signOut();
        return { error: 'Esta área é só para clientes. Parceiros, equipe e administradores devem usar o link "Sou parceiro" no topo.' };
      }
      /** Perfil completo: `onAuthStateChange` + `refreshProfile` evitam await duplicado e destravam a UI mais cedo. */
      void refreshProfile();
      return { error: null };
    };

    return (
      <div className="flex min-h-screen flex-col overflow-hidden bg-gray-50 transition-colors dark:bg-zinc-950">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/95 p-4 backdrop-blur-md dark:border-white/6 dark:bg-zinc-950/90">
          <div className="flex items-center gap-2">
            <ThemeLogoButton size="md" />
            <h1 className="font-display text-xl font-bold leading-tight text-gray-800 dark:text-zinc-100">{APP_NAME}</h1>
          </div>
          <a href="/parceiros" className="text-sm text-gray-500 transition-colors hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400">
            Sou parceiro
          </a>
        </header>
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4">
          <p className="mb-4 text-sm text-gray-500 dark:text-zinc-400">
            {showSignUp ? 'Crie sua conta de cliente para agendar' : 'Acesso exclusivo para clientes'}
          </p>
          <LoginForm
            title={showSignUp ? 'Criar conta (cliente)' : 'Entrar como cliente'}
            subtitle={showSignUp ? 'E-mail e senha (mín. 6 caracteres)' : 'Use seu e-mail e senha para agendar e comprar'}
            onSubmit={showSignUp ? signUp : handleClientLogin}
            submitLabel={showSignUp ? 'Criar conta' : 'Entrar'}
            onSuccess={() => {}}
            onGoogleSignIn={signInWithGoogle}
          />
          <p className="mt-4 text-sm text-gray-500 dark:text-zinc-400">
            {showSignUp ? (
              <>
                Já tem conta?{' '}
                <button type="button" onClick={() => setShowSignUp(false)} className="text-indigo-600 font-medium hover:underline">
                  Entrar
                </button>
              </>
            ) : (
              <>
                Não tem conta?{' '}
                <button type="button" onClick={() => setShowSignUp(true)} className="text-indigo-600 font-medium hover:underline">
                  Criar conta
                </button>
              </>
            )}
          </p>
        </main>
      </div>
    );
  }

  if (user?.role !== 'CLIENT' && !profileHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-gray-500 dark:text-zinc-400">
          <i className="fas fa-spinner fa-spin text-3xl"></i>
        </div>
      </div>
    );
  }

  const clientMainView: ClientNavView = profileHydrating ? 'client-home' : currentView;
  const waitingDeepLinkShopOpen =
    user?.role === 'CLIENT' &&
    !profileHydrating &&
    (Boolean(deepLinkShareCode) || Boolean(deepLinkShopId)) &&
    currentView === 'client-home' &&
    !selectedShop;
  const navigateClientView = (view: ClientNavView) => {
    if (profileHydrating && view !== 'client-home') return;
    setCurrentView(view);
  };

  if (currentView === 'shop-details' && selectedShop && user?.role === 'CLIENT') {
    const refetchAppointmentsAndOrders = () => {
      if (!user?.id) return;
      appointmentsNextOffset.current = 0;
      ordersNextOffset.current = 0;
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: clientAreaQueryKeys.appointmentsP1(user.id) });
        await queryClient.invalidateQueries({ queryKey: clientAreaQueryKeys.ordersP1(user.id) });
        await Promise.all([fetchAppointmentsFirstPage(), fetchOrdersFirstPage()]);
      })();
    };
    return (
      <Layout
        user={user}
        onLogout={handleLogout}
        onNavigate={setCurrentView}
        currentView={currentView}
        notifications={notifications}
        onMarkRead={markAllAsRead}
        showClientShellDuringProfileLoad={showClientShellDuringProfileLoad}
      >
        <ShopDetails
          shop={selectedShop}
          user={user}
          onRefetchAppointmentsAndOrders={refetchAppointmentsAndOrders}
          onBook={() => {
            refetchAppointmentsAndOrders();
            addNotification('Pagamento confirmado', 'Seu agendamento foi registrado como pago.', 'SUCCESS');
            setCurrentView('client-home');
          }}
          onOrder={() => {
            refetchAppointmentsAndOrders();
            addNotification('Pagamento confirmado', 'Seu pedido foi registrado como pago.', 'SUCCESS');
            setCurrentView('client-home');
          }}
          onBack={() => setCurrentView('client-home')}
        />
      </Layout>
    );
  }

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      onNavigate={navigateClientView}
      currentView={clientMainView}
      notifications={notifications}
      onMarkRead={markAllAsRead}
      showClientShellDuringProfileLoad={showClientShellDuringProfileLoad}
    >
      {waitingDeepLinkShopOpen ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="text-center text-gray-500">
            <i className="fas fa-spinner fa-spin text-3xl" />
            <p className="mt-3 text-sm">Abrindo estabelecimento...</p>
          </div>
        </div>
      ) : null}
      {clientMainView === 'client-home' && !waitingDeepLinkShopOpen && (
        <ClientHome
          shops={shops}
          catalogRefreshing={catalogRefreshing}
          profileHydrating={profileHydrating}
          onSelectShop={handleSelectShop}
        />
      )}
      {clientMainView === 'client-appointments' && (
        <ClientAppointments
          appointments={appointments}
          shops={shops}
          user={user}
          hasMore={appointmentsHasMore}
          loadingMore={appointmentsLoadingMore}
          onLoadMore={() => void loadMoreAppointments()}
          onCancel={id => {
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'CANCELLED' } : a));
            addNotification('Agendamento cancelado', 'Conforme nossa política, 50% será reembolsado.', 'WARNING');
          }}
        />
      )}
      {clientMainView === 'client-orders' && (
        <ClientOrders
          orders={orders}
          shops={shops}
          user={user}
          hasMore={ordersHasMore}
          loadingMore={ordersLoadingMore}
          onLoadMore={() => void loadMoreOrders()}
          onNavigate={navigateClientView}
        />
      )}
      {clientMainView === 'client-profile' && <ClientProfile user={user} />}
    </Layout>
  );
}
