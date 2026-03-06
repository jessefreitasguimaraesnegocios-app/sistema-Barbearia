import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ClientHome from '../views/ClientHome';
import ShopDetails from '../views/ShopDetails';
import ClientAppointments from '../views/ClientAppointments';
import ClientOrders from '../views/ClientOrders';
import { LoginForm } from '../components/LoginForm';
import { Shop, Appointment, Order } from '../types';
import { supabase } from '../src/lib/supabase';

export default function ClientArea() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'client-home' | 'shop-details' | 'client-appointments' | 'client-orders'>('client-home');
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  useEffect(() => {
    fetchShops();
  }, []);

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
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <i className="fas fa-scissors"></i>
            </div>
            <h1 className="font-display text-xl font-bold text-gray-800">BeautyHub</h1>
          </div>
          <a href="/parceiros" className="text-sm text-gray-500 hover:text-indigo-600">Sou parceiro</a>
        </header>
        <main className="max-w-7xl mx-auto p-4 md:p-8">
          {selectedShop ? (
            <>
              <ShopDetails
                shop={selectedShop}
                user={{ id: '', name: 'Visitante', email: '', role: 'CLIENT' }}
                onBook={() => alert('Entre na sua conta para agendar.')}
                onOrder={() => alert('Entre na sua conta para pedir.')}
                onBack={() => setSelectedShop(null)}
              />
            </>
          ) : (
            <>
              <ClientHome shops={shops} onSelectShop={setSelectedShop} />
              <div className="flex flex-col items-center justify-center mt-12">
                <p className="text-gray-500 text-sm mb-4">
                  {showSignUp ? 'Crie sua conta para agendar' : 'Entre para agendar e ver seus agendamentos'}
                </p>
                <LoginForm
                  title={showSignUp ? 'Criar conta' : 'Entrar'}
                  subtitle={showSignUp ? 'E-mail e senha (mín. 6 caracteres)' : 'Use seu e-mail e senha'}
                  onSubmit={showSignUp ? signUp : signIn}
                  submitLabel={showSignUp ? 'Criar conta' : 'Entrar'}
                  onSuccess={() => {}}
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
              </div>
            </>
          )}
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

  if (currentView === 'shop-details' && selectedShop) {
    return (
      <Layout user={user} onLogout={signOut} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
        <ShopDetails
          shop={selectedShop}
          user={user}
          onBook={apt => {
            setAppointments(a => [...a, apt]);
            addNotification('Agendamento confirmado', `Seu horário na ${selectedShop.name} está garantido!`, 'SUCCESS');
            setCurrentView('client-appointments');
          }}
          onOrder={order => {
            setOrders(o => [...o, order]);
            addNotification('Pedido recebido', `Pedido de R$ ${order.total.toFixed(2)} processado.`, 'SUCCESS');
          }}
          onBack={() => setCurrentView('client-home')}
        />
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={signOut} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
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
    </Layout>
  );
}
