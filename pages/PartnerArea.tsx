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
  const [customizationRefreshKey, setCustomizationRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  useEffect(() => {
    if (!user?.shopId) return;
    const shopId = user.shopId;
    (async () => {
      const { data: shopRow, error: shopErr } = await supabase
        .from('shops')
        .select('*')
        .eq('id', shopId)
        .single();
      if (shopErr || !shopRow) return;
      const { data: servicesData } = await supabase.from('services').select('*').eq('shop_id', shopId);
      const { data: professionalsData } = await supabase.from('professionals').select('*').eq('shop_id', shopId);
      const { data: productsData } = await supabase.from('products').select('*').eq('shop_id', shopId);
      const s = mapShopFromDb({
        ...shopRow,
        services: servicesData || [],
        professionals: professionalsData || [],
        products: productsData || [],
      });
      setMyShop(s);
      setShops([s]);
    })();
  }, [user?.shopId]);

  function mapShopFromDb(d: any): Shop {
    const rawServices = (d.services || []);
    const rawProfessionals = (d.professionals || []);
    const rawProducts = (d.products || []);

    const dedupeByKey = <T,>(arr: T[], keyFn: (x: T) => string): T[] => {
      const seen = new Set<string>();
      return arr.filter((x) => {
        const k = keyFn(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    const services = dedupeByKey(rawServices, (s: any) => `${s.name}|${Number(s.price)}|${Number(s.duration)}`).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      price: Number(s.price),
      duration: Number(s.duration),
    }));
    const professionals = dedupeByKey(rawProfessionals, (p: any) => `${(p.name || '').trim()}|${(p.specialty || '').trim()}`).map((p: any) => ({
      id: p.id,
      name: p.name,
      specialty: p.specialty || '',
      avatar: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`,
    }));
    const products = dedupeByKey(rawProducts, (p: any) => `${(p.name || '').trim()}|${Number(p.price)}|${(p.category || 'Geral').trim()}`).map((p: any) => ({
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
        <div className="absolute top-4 left-4 flex items-center gap-4">
          <a href="/" className="text-gray-500 hover:text-indigo-600 text-sm">← Voltar ao site</a>
          <span className="text-gray-300">|</span>
          <a href="/" className="text-gray-500 hover:text-indigo-600 text-sm">Sou cliente</a>
        </div>
        <LoginForm
          title="Acesso parceiro"
          subtitle="Barbearias e salões: entre somente com o e-mail e senha do estabelecimento"
          onSubmit={signIn}
          submitLabel="Entrar"
          onSuccess={() => {}}
        />
        <p className="mt-4 text-xs text-gray-400 text-center max-w-sm">
          Esta área é exclusiva para donos de barbearias e salões. Cliente? Use a página inicial.
        </p>
      </div>
    );
  }

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const updateShop = async (updated: Shop) => {
    if (!myShop?.id) return;
    const shopId = myShop.id;

    try {
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

    if (shopError) throw new Error(shopError.message);

    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { data: oldServices } = await supabase.from('services').select('id').eq('shop_id', shopId);
    const { data: oldProfessionals } = await supabase.from('professionals').select('id').eq('shop_id', shopId);
    const { data: oldProducts } = await supabase.from('products').select('id').eq('shop_id', shopId);

    const keepServiceIds = (updated.services || []).filter((s) => isUuid(s.id)).map((s) => s.id);
    const keepProIds = (updated.professionals || []).filter((p) => isUuid(p.id)).map((p) => p.id);
    const keepProductIds = (updated.products || []).filter((p) => isUuid(p.id)).map((p) => p.id);

    for (const s of updated.services || []) {
      if (isUuid(s.id)) {
        const { error: e } = await supabase.from('services').update({
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          duration: Number(s.duration),
        }).match({ id: s.id, shop_id: shopId });
        if (e) throw new Error(`Serviços: ${e.message}`);
      } else {
        const { error: e } = await supabase.from('services').insert({
          shop_id: shopId,
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          duration: Number(s.duration),
        });
        if (e) throw new Error(`Serviços: ${e.message}`);
      }
    }

    for (const p of updated.professionals || []) {
      if (isUuid(p.id)) {
        const { error: e } = await supabase.from('professionals').update({
          name: p.name,
          specialty: p.specialty ?? null,
          avatar: p.avatar ?? null,
        }).match({ id: p.id, shop_id: shopId });
        if (e) throw new Error(`Equipe: ${e.message}`);
      } else {
        const { error: e } = await supabase.from('professionals').insert({
          shop_id: shopId,
          name: p.name,
          specialty: p.specialty ?? null,
          avatar: p.avatar ?? null,
        });
        if (e) throw new Error(`Equipe: ${e.message}`);
      }
    }

    for (const p of updated.products || []) {
      if (isUuid(p.id)) {
        const { error: e } = await supabase.from('products').update({
          name: p.name,
          description: p.description ?? null,
          price: Number(p.price),
          promo_price: p.promoPrice ?? null,
          category: p.category ?? 'Geral',
          image: p.image ?? null,
          stock: Number(p.stock) || 0,
        }).match({ id: p.id, shop_id: shopId });
        if (e) throw new Error(`Produtos: ${e.message}`);
      } else {
        const { error: e } = await supabase.from('products').insert({
          shop_id: shopId,
          name: p.name,
          description: p.description ?? null,
          price: Number(p.price),
          promo_price: p.promoPrice ?? null,
          category: p.category ?? 'Geral',
          image: p.image ?? null,
          stock: Number(p.stock) || 0,
        });
        if (e) throw new Error(`Produtos: ${e.message}`);
      }
    }

    const toDeleteServiceIds = (oldServices || []).map((r) => r.id).filter((id) => !keepServiceIds.includes(id));
    const toDeleteProIds = (oldProfessionals || []).map((r) => r.id).filter((id) => !keepProIds.includes(id));
    const toDeleteProductIds = (oldProducts || []).map((r) => r.id).filter((id) => !keepProductIds.includes(id));
    for (const id of toDeleteServiceIds) {
      const { error: e } = await supabase.from('services').delete().match({ id, shop_id: shopId });
      if (e) throw new Error(`Excluir serviço: ${e.message}`);
    }
    for (const id of toDeleteProIds) {
      const { error: e } = await supabase.from('professionals').delete().match({ id, shop_id: shopId });
      if (e) throw new Error(`Excluir equipe: ${e.message}`);
    }
    for (const id of toDeleteProductIds) {
      const { error: e } = await supabase.from('products').delete().match({ id, shop_id: shopId });
      if (e) throw new Error(`Excluir produto: ${e.message}`);
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
      .select('*')
      .eq('id', shopId)
      .single();
    if (refreshed) {
      const { data: sData } = await supabase.from('services').select('*').eq('shop_id', shopId);
      const { data: pData } = await supabase.from('professionals').select('*').eq('shop_id', shopId);
      const { data: prodData } = await supabase.from('products').select('*').eq('shop_id', shopId);
      const full = mapShopFromDb({
        ...refreshed,
        services: sData || [],
        professionals: pData || [],
        products: prodData || [],
      });
      setMyShop(full);
      setShops([full]);
    }
    setCustomizationRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.';
      alert(msg);
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
      {currentView === 'shop-customization' && <ShopCustomization key={`customize-${myShop.id}-${currentView}-${customizationRefreshKey}`} shop={myShop} onSave={updateShop} />}
    </Layout>
  );
}
