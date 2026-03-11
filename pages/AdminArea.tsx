import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import AdminDashboard from '../views/AdminDashboard';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';

export default function AdminArea() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('*');
    if (data) {
      setShops(data.map((s: Record<string, unknown>) => ({
        ...s,
        id: s.id,
        ownerId: s.owner_id,
        cnpjOrCpf: s.cnpj_cpf,
        pixKey: s.pix_key,
        profileImage: s.profile_image,
        bannerImage: s.banner_image,
        subscriptionActive: s.subscription_active,
        subscriptionAmount: s.subscription_amount != null ? Number(s.subscription_amount) : 99,
        splitPercent: s.split_percent != null ? Number(s.split_percent) : 95,
        asaasAccountId: s.asaas_account_id,
        asaasWalletId: s.asaas_wallet_id,
        asaasApiKeyConfigured: !!(s.asaas_api_key && String(s.asaas_api_key).trim()),
        services: [],
        professionals: [],
        products: [],
      })));
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchShops();
  }, [user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/parceiros" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const setShopsState = (next: Shop[] | ((prev: Shop[]) => Shop[])) => {
    setShops(typeof next === 'function' ? next(shops) : next);
  };
  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  return (
    <Layout user={user} onLogout={handleLogout} onNavigate={() => {}} currentView="admin-dashboard" notifications={notifications} onMarkRead={markAllAsRead}>
      <AdminDashboard shops={shops} setShops={setShopsState} onShopCreated={fetchShops} />
    </Layout>
  );
}
