import React, { useState, useEffect } from 'react';
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
import { APP_NAME, APP_LOGO_SRC } from '../lib/branding';

export default function ClientArea() {
  const { user, loading, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'client-home' | 'shop-details' | 'client-appointments' | 'client-orders' | 'client-profile'>('client-home');
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  useEffect(() => {
    fetchShops();
  }, []);

  const mapAppointment = (a: any): Appointment => ({
    id: a.id,
    clientId: a.client_id,
    shopId: a.shop_id,
    serviceId: a.service_id,
    professionalId: a.professional_id,
    date: a.date,
    time: a.time,
    status: a.status || 'PENDING',
    amount: Number(a.amount),
    tip: a.tip != null ? Number(a.tip) : undefined,
  });

  const mapOrder = (o: any): Order => ({
    id: o.id,
    clientId: o.client_id,
    shopId: o.shop_id,
    items: Array.isArray(o.items) ? o.items : [],
    total: Number(o.total),
    status: o.status || 'PENDING',
    date: o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
  });

  const fetchAppointments = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('appointments').select('*').eq('client_id', user.id).order('date', { ascending: false });
    setAppointments((data || []).map(mapAppointment));
  };

  const fetchOrders = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('orders').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
    setOrders((data || []).map(mapOrder));
  };

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SHOP') return;
    if (!user?.id) return;
    fetchAppointments();
    fetchOrders();
    const subA = supabase.channel('appointments').on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `client_id=eq.${user.id}` }, () => fetchAppointments()).subscribe();
    const subO = supabase.channel('orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `client_id=eq.${user.id}` }, () => fetchOrders()).subscribe();
    return () => {
      subA.unsubscribe();
      subO.unsubscribe();
    };
  }, [user?.id, user?.role]);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('*, services(*), professionals(*), products(*)');
    if (data) {
      setShops(data.map((s: any) => ({
        ...s,
        id: s.id,
        ownerId: s.owner_id,
        cnpjOrCpf: s.cnpj_cpf,
        pixKey: s.pix_key,
        profileImage: s.profile_image,
        bannerImage: s.banner_image,
        subscriptionActive: s.subscription_active,
        subscriptionAmount: s.subscription_amount != null ? Number(s.subscription_amount) : 99,
        asaasAccountId: s.asaas_account_id,
        asaasWalletId: s.asaas_wallet_id,
        services: (s.services || []).map((sv: any) => ({
          id: sv.id,
          name: sv.name,
          description: sv.description || '',
          price: Number(sv.price),
          duration: Number(sv.duration),
        })),
        professionals: (s.professionals || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          specialty: p.specialty || '',
          avatar: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`,
        })),
        products: (s.products || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          price: Number(p.price),
          promoPrice: p.promo_price != null ? Number(p.promo_price) : undefined,
          category: p.category || 'Geral',
          image: p.image || 'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=1974',
          stock: Number(p.stock) || 0,
        })),
      })));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (user?.role === 'SHOP') return <Navigate to="/parceiros" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  if (!user) {
    const handleClientLogin = async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao entrar.' };
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (profile?.role === 'barbearia' || profile?.role === 'admin') {
        await supabase.auth.signOut();
        return { error: 'Esta área é só para clientes. Parceiros e administradores devem usar o link "Sou parceiro" no topo.' };
      }
      return { error: null };
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={APP_LOGO_SRC} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm bg-white" />
            <h1 className="font-display text-xl font-bold text-gray-800 leading-tight">{APP_NAME}</h1>
          </div>
          <a href="/parceiros" className="text-sm text-gray-500 hover:text-indigo-600">Sou parceiro</a>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto min-h-0">
          <p className="text-gray-500 text-sm mb-4">
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
          <p className="mt-4 text-sm text-gray-500">
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
            addNotification('Aguardando pagamento', 'Assim que o PIX for confirmado, seu agendamento aparecerá como pago.', 'INFO');
            setCurrentView('client-appointments');
          }}
          onOrder={() => {
            refetchAppointmentsAndOrders();
            addNotification('Aguardando pagamento', 'Assim que o PIX for confirmado, seu pedido aparecerá como pago.', 'INFO');
            setCurrentView('client-orders');
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
