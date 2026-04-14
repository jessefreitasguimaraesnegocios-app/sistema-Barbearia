import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
import { BrandThemeToggle } from '../components/BrandThemeToggle';
import { isPartnerOrAdminRole } from '../lib/profileRole';
import { mapRowToAppointment } from '../services/supabase/appointmentMapping';
import { useRealtimeAppointments } from '../hooks/useRealtimeAppointments';
import { useClientCatalogShops } from '../hooks/useClientCatalogShops';

export default function ClientArea() {
  const { user, loading, signUp, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'client-home' | 'shop-details' | 'client-appointments' | 'client-orders' | 'client-profile'>('client-home');
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

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

  const { shops } = useClientCatalogShops({ client: supabase, enabled: true });

  useEffect(() => {
    setSelectedShop((prev) => {
      if (!prev) return prev;
      const next = shops.find((s) => s.id === prev.id);
      return next ?? prev;
    });
  }, [shops]);

  const mapOrder = (o: Record<string, unknown>): Order => ({
    id: String(o.id),
    clientId: String(o.client_id),
    shopId: String(o.shop_id),
    items: Array.isArray(o.items) ? (o.items as Order['items']) : [],
    total: Number(o.total),
    status: (o.status as Order['status']) || 'PENDING',
    date: o.created_at ? new Date(String(o.created_at)).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
  });

  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('appointments').select('*').eq('client_id', user.id).order('date', { ascending: false });
    setAppointments((data || []).map((a) => mapRowToAppointment(a as Record<string, unknown>)));
  }, [user?.id]);

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('orders').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
    setOrders((data || []).map(mapOrder));
  }, [user?.id]);

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SHOP' || user?.role === 'STAFF' || user?.role === 'PENDING') return;
    if (!user?.id) return;
    void fetchAppointments();
    void fetchOrders();
    const subO = supabase
      .channel(`client-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `client_id=eq.${user.id}` },
        () => void fetchOrders()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(subO);
    };
  }, [user?.id, user?.role, fetchAppointments, fetchOrders]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (user?.role === 'SHOP' || user?.role === 'STAFF') return <Navigate to="/parceiros" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  if (user?.role === 'PENDING') {
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
      await refreshProfile();
      return { error: null };
    };

    return (
      <div className="flex min-h-screen flex-col overflow-hidden bg-gray-50 transition-colors dark:bg-zinc-950">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/95 p-4 backdrop-blur-md dark:border-white/6 dark:bg-zinc-950/90">
          <div className="flex items-center gap-2">
            <BrandThemeToggle size="md" />
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

  const addNotification = (title: string, message: string, type: 'SUCCESS' | 'INFO' | 'WARNING' = 'INFO') => {
    setNotifications(prev => [{
      id: Math.random().toString(36).slice(2),
      title,
      message,
      type,
      timestamp: new Date(),
      read: false,
    }, ...prev]);
  };

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  if (currentView === 'shop-details' && selectedShop) {
    const refetchAppointmentsAndOrders = () => {
      fetchAppointments();
      fetchOrders();
    };
    return (
      <Layout user={user} onLogout={handleLogout} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
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
    <Layout user={user} onLogout={handleLogout} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
      {currentView === 'client-home' && <ClientHome shops={shops} onSelectShop={s => { setSelectedShop(s); setCurrentView('shop-details'); }} />}
      {currentView === 'client-appointments' && (
        <ClientAppointments
          appointments={appointments}
          shops={shops}
          user={user}
          onCancel={id => {
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'CANCELLED' } : a));
            addNotification('Agendamento cancelado', 'Conforme nossa política, 50% será reembolsado.', 'WARNING');
          }}
        />
      )}
      {currentView === 'client-orders' && <ClientOrders orders={orders} shops={shops} user={user} onNavigate={setCurrentView} />}
      {currentView === 'client-profile' && <ClientProfile user={user} />}
    </Layout>
  );
}
