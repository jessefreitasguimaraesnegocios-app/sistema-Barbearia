
import React, { useState, useEffect } from 'react';
import { User, Shop, Appointment, Order, UserRole, AppNotification } from './types';
import { MOCK_USERS, MOCK_SHOPS } from './constants';
import Layout from './components/Layout';
import AuthView from './views/AuthView';
import ClientHome from './views/ClientHome';
import ShopDetails from './views/ShopDetails';
import ShopDashboard from './views/ShopDashboard';
import ShopCustomization from './views/ShopCustomization';
import AdminDashboard from './views/AdminDashboard';
import ClientAppointments from './views/ClientAppointments';
import ClientOrders from './views/ClientOrders';
import { supabase } from './src/lib/supabase';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<string>('auth');
  const [shops, setShops] = useState<Shop[]>(MOCK_SHOPS);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchShops();
  }, []);

  const fetchShops = async () => {
    const { data, error } = await supabase.from('shops').select('*');
    if (data) {
      // Map database fields to frontend interface if necessary
      const mappedShops = data.map((s: any) => ({
        ...s,
        id: s.id,
        ownerId: s.owner_id,
        cnpjOrCpf: s.cnpj_cpf,
        pixKey: s.pix_key,
        profileImage: s.profile_image,
        bannerImage: s.banner_image,
        subscriptionActive: s.subscription_active,
        asaasAccountId: s.asaas_account_id,
        asaasApiKey: s.asaas_api_key,
        asaasWalletId: s.asaas_wallet_id,
        services: [], // In a real app, fetch these from services table
        professionals: [], // In a real app, fetch these from professionals table
        products: [] // In a real app, fetch these from products table
      }));
      setShops(mappedShops);
    }
    if (error) console.error('Error fetching shops:', error);
  };

  const addNotification = (title: string, message: string, type: 'SUCCESS' | 'INFO' | 'WARNING' = 'INFO') => {
    const newNotif: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      timestamp: new Date(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);

    // System push notification simulation
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body: message, icon: '/favicon.ico' });
    }
  };

  const handleLogin = (email: string) => {
    const user = MOCK_USERS.find(u => u.email === email);
    if (user) {
      setCurrentUser(user);
      addNotification("Bem-vindo de volta!", `Olá ${user.name}, que bom ver você novamente.`, 'SUCCESS');
      if (user.role === 'ADMIN') setCurrentView('admin-dashboard');
      else if (user.role === 'SHOP') setCurrentView('shop-dashboard');
      else setCurrentView('client-home');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('auth');
    setSelectedShop(null);
  };

  const navigateToShop = (shop: Shop) => {
    setSelectedShop(shop);
    setCurrentView('shop-details');
  };

  const createAppointment = (apt: Appointment) => {
    setAppointments([...appointments, apt]);
    const shop = shops.find(s => s.id === apt.shopId);
    addNotification(
      "Agendamento Confirmado", 
      `Seu horário na ${shop?.name} para o dia ${apt.date} às ${apt.time} está garantido!`, 
      'SUCCESS'
    );
    
    // Simulate a reminder notification 10 seconds later
    setTimeout(() => {
      addNotification(
        "Lembrete de Agendamento",
        `Não se esqueça! Você tem um compromisso hoje na ${shop?.name}.`,
        'INFO'
      );
    }, 10000);

    setCurrentView('client-appointments');
  };

  const createOrder = (order: Order) => {
    setOrders([...orders, order]);
    const shop = shops.find(s => s.id === order.shopId);
    
    // Notification for Client
    addNotification(
      "Pedido Recebido", 
      `Seu pedido na ${shop?.name} de R$ ${order.total.toFixed(2)} foi processado com sucesso.`, 
      'SUCCESS'
    );

    // Notification for Shop (Simulated alert for the establishment)
    addNotification(
      "Nova Venda Realizada!",
      `A loja ${shop?.name} recebeu um novo pedido de R$ ${order.total.toFixed(2)}. Verifique o painel de vendas.`,
      'INFO'
    );
  };

  const updateShop = (updatedShop: Shop) => {
    setShops(shops.map(s => s.id === updatedShop.id ? updatedShop : s));
    addNotification("Loja Atualizada", "As alterações na sua vitrine foram salvas com sucesso.", "SUCCESS");
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const cancelAppointment = (appointmentId: string) => {
    setAppointments(prev => prev.map(apt => 
      apt.id === appointmentId ? { ...apt, status: 'CANCELLED' } : apt
    ));
    addNotification(
      "Agendamento Cancelado", 
      "Seu agendamento foi cancelado. Conforme nossa política, 50% do valor será reembolsado.", 
      'WARNING'
    );
  };

  const renderView = () => {
    if (!currentUser || currentView === 'auth') {
      return <AuthView onLogin={handleLogin} />;
    }

    switch (currentView) {
      case 'client-home':
        return <ClientHome shops={shops} onSelectShop={navigateToShop} />;
      case 'shop-details':
        return selectedShop ? (
          <ShopDetails 
            shop={selectedShop} 
            user={currentUser} 
            onBook={createAppointment} 
            onOrder={createOrder}
            onBack={() => setCurrentView('client-home')} 
          />
        ) : null;
      case 'client-appointments':
        return <ClientAppointments appointments={appointments} shops={shops} user={currentUser} onCancel={cancelAppointment} />;
      case 'client-orders':
        return <ClientOrders orders={orders} shops={shops} user={currentUser} onNavigate={setCurrentView} />;
      case 'shop-dashboard':
        const myShop = shops.find(s => s.ownerId === currentUser.id);
        return myShop ? <ShopDashboard shop={myShop} appointments={appointments} orders={orders} /> : <div>Sem loja cadastrada</div>;
      case 'shop-customization':
        const customShop = shops.find(s => s.ownerId === currentUser.id);
        return customShop ? <ShopCustomization shop={customShop} onSave={updateShop} /> : null;
      case 'admin-dashboard':
        return <AdminDashboard shops={shops} setShops={setShops} />;
      default:
        return <div>View not found</div>;
    }
  };

  return (
    <Layout 
      user={currentUser} 
      onLogout={handleLogout} 
      onNavigate={setCurrentView} 
      currentView={currentView}
      notifications={notifications}
      onMarkRead={markAllAsRead}
    >
      {renderView()}
    </Layout>
  );
};

export default App;
