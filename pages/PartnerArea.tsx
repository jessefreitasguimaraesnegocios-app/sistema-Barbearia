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
      supabase
        .from('shops')
        .select('*, services(*), professionals(*), products(*)')
        .eq('id', user.shopId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            supabase.from('shops').select('*').eq('id', user.shopId).single().then(({ data: d }) => {
              if (d) {
                const s = mapShopFromDb(d);
                setMyShop(s);
                setShops([s]);
              }
            });
            return;
          }
          if (data) {
            const s = mapShopFromDb(data);
            setMyShop(s);
            setShops([s]);
          }
        });
    }
  }, [user?.shopId]);

  function mapShopFromDb(d: any): Shop {
    const services = (d.services || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      price: Number(s.price),
      duration: Number(s.duration),
    }));
    const professionals = (d.professionals || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      specialty: p.specialty || '',
      avatar: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`,
    }));
    const products = (d.products || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      price: Number(p.price),
      promoPrice: p.promo_price != null ? Number(p.promo_price) : undefined,
      category: p.category || 'Geral',
      image: p.image || 'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=1974',
      stock: Number(p.stock) || 0,
    }));
    return {
      ...d,
      id: d.id,
      ownerId: d.owner_id,
      cnpjOrCpf: d.cnpj_cpf,
      pixKey: d.pix_key,
      profileImage: d.profile_image,
      bannerImage: d.banner_image,
      subscriptionActive: d.subscription_active,
      subscriptionAmount: d.subscription_amount != null ? Number(d.subscription_amount) : 99,
      asaasAccountId: d.asaas_account_id,
      asaasWalletId: d.asaas_wallet_id,
      services,
      professionals,
      products,
    };
  }

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

  const updateShop = async (updated: Shop) => {
    if (!myShop?.id) return;
    const shopId = myShop.id;

    const { error: shopError } = await supabase
      .from('shops')
      .update({
        name: updated.name,
        description: updated.description ?? null,
        profile_image: updated.profileImage ?? null,
        banner_image: updated.bannerImage ?? null,
        primary_color: updated.primaryColor ?? null,
        theme: updated.theme ?? 'MODERN',
      })
      .eq('id', shopId);

    if (shopError) {
      alert('Erro ao salvar: ' + shopError.message);
      return;
    }

    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    for (const s of updated.services || []) {
      if (isUuid(s.id)) {
        await supabase.from('services').update({
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          duration: Number(s.duration),
        }).eq('id', s.id).eq('shop_id', shopId);
      } else {
        await supabase.from('services').insert({
          shop_id: shopId,
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          duration: Number(s.duration),
        });
      }
    }

    for (const p of updated.professionals || []) {
      if (isUuid(p.id)) {
        await supabase.from('professionals').update({
          name: p.name,
          specialty: p.specialty ?? null,
          avatar: p.avatar ?? null,
        }).eq('id', p.id).eq('shop_id', shopId);
      } else {
        await supabase.from('professionals').insert({
          shop_id: shopId,
          name: p.name,
          specialty: p.specialty ?? null,
          avatar: p.avatar ?? null,
        });
      }
    }

    for (const p of updated.products || []) {
      if (isUuid(p.id)) {
        await supabase.from('products').update({
          name: p.name,
          description: p.description ?? null,
          price: Number(p.price),
          promo_price: p.promoPrice ?? null,
          category: p.category ?? 'Geral',
          image: p.image ?? null,
          stock: Number(p.stock) || 0,
        }).eq('id', p.id).eq('shop_id', shopId);
      } else {
        await supabase.from('products').insert({
          shop_id: shopId,
          name: p.name,
          description: p.description ?? null,
          price: Number(p.price),
          promo_price: p.promoPrice ?? null,
          category: p.category ?? 'Geral',
          image: p.image ?? null,
          stock: Number(p.stock) || 0,
        });
      }
    }

    setMyShop(updated);
    setShops([updated]);
    setNotifications(prev => [{
      id: Math.random().toString(36).slice(2),
      title: 'Alterações salvas',
      message: 'As configurações da loja foram atualizadas com sucesso.',
      type: 'SUCCESS',
      timestamp: new Date(),
      read: false,
    }, ...prev]);

    const { data: refreshed } = await supabase
      .from('shops')
      .select('*, services(*), professionals(*), products(*)')
      .eq('id', shopId)
      .single();
    if (refreshed) {
      setMyShop(mapShopFromDb(refreshed));
      setShops([mapShopFromDb(refreshed)]);
    }
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
