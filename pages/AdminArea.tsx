import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import AdminDashboard from '../views/AdminDashboard';
import AdminWallet from '../views/AdminWallet';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import { fetchShopsForAdmin } from '../services/supabase/shops';

export default function AdminArea() {
  const { user, loading, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);
  const [currentView, setCurrentView] = useState<'admin-dashboard' | 'admin-wallet'>('admin-dashboard');

  const fetchShops = async () => {
    const list = await fetchShopsForAdmin(supabase);
    setShops(list);
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
  if (user.role === 'STAFF' || user.role === 'SHOP') return <Navigate to="/parceiros" replace />;
  if (user.role === 'PENDING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
        <p className="text-gray-700 text-center max-w-sm">Carregando perfil de administrador… Se persistir, confira no Supabase se seu usuário tem role «admin» em public.profiles.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700"
          >
            Tentar novamente
          </button>
          <button type="button" onClick={() => void signOut()} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100">
            Sair
          </button>
        </div>
      </div>
    );
  }
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
    <Layout user={user} onLogout={handleLogout} onNavigate={setCurrentView} currentView={currentView} notifications={notifications} onMarkRead={markAllAsRead}>
      {currentView === 'admin-dashboard' && <AdminDashboard shops={shops} setShops={setShopsState} onShopCreated={fetchShops} />}
      {currentView === 'admin-wallet' && <AdminWallet />}
    </Layout>
  );
}
