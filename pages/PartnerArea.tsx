import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ShopDashboard from '../views/ShopDashboard';
import ShopCustomization from '../views/ShopCustomization';
import { LoginForm } from '../components/LoginForm';
import { Shop, Appointment, Order } from '../types';
import { supabase } from '../src/lib/supabase';

export default function PartnerArea() {
  const { user, loading, signIn, signOut } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'shop-dashboard' | 'shop-customization'>('shop-dashboard');
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  useEffect(() => {
    if (user?.shopId) {
      supabase.from('shops').select('*').eq('id', user.shopId).single().then(({ data }) => {
        if (data) {
          const s = {
            ...data,
            id: data.id,
            ownerId: data.owner_id,
            cnpjOrCpf: data.cnpj_cpf,
            pixKey: data.pix_key,
            profileImage: data.profile_image,
            bannerImage: data.banner_image,
            subscriptionActive: data.subscription_active,
            subscriptionAmount: data.subscription_amount != null ? Number(data.subscription_amount) : 99,
            asaasAccountId: data.asaas_account_id,
            asaasWalletId: data.asaas_wallet_id,
            services: [],
            professionals: [],
            products: [],
          };
          setMyShop(s);
          setShops([s]);
        }
      });
    }
  }, [user?.shopId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (user && user.role !== 'SHOP') return <Navigate to="/" replace />;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <a href="/" className="absolute top-4 left-4 text-gray-500 hover:text-indigo-600 text-sm">← Voltar ao site</a>
        <LoginForm
          title="Acesso parceiro"
          subtitle="Barbearias e salões: entre com seu e-mail e senha"
          onSubmit={signIn}
          submitLabel="Entrar"
          onSuccess={() => {}}
        />
      </div>
    );
  }

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const updateShop = (updated: Shop) => {
    setMyShop(updated);
    setShops([updated]);
  };

  if (!myShop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={signOut} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
      {currentView === 'shop-dashboard' && <ShopDashboard shop={myShop} appointments={appointments} orders={orders} />}
      {currentView === 'shop-customization' && <ShopCustomization shop={myShop} onSave={updateShop} />}
    </Layout>
  );
}
