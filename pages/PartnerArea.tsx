import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ShopDashboard from '../views/ShopDashboard';
import ShopCustomization from '../views/ShopCustomization';
import ShopOnboarding from '../views/ShopOnboarding';
import ShopWallet from '../views/ShopWallet';
import ShopOrders from '../views/ShopOrders';
import { LoginForm } from '../components/LoginForm';
import { Shop, Appointment, Order, ShopPartnerOrderRow } from '../types';
import { supabase } from '../src/lib/supabase';

export default function PartnerArea() {
  const { user, loading, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [shopPartnerOrderRows, setShopPartnerOrderRows] = useState<ShopPartnerOrderRow[]>([]);
  const [currentView, setCurrentView] = useState<
    'shop-dashboard' | 'shop-onboarding' | 'shop-wallet' | 'shop-customization' | 'shop-orders'
  >('shop-dashboard');

  const dashboardOrders: Order[] = React.useMemo(
    () =>
      shopPartnerOrderRows.map(({ createdAtIso, clientDisplayName, clientAvatarUrl, ...rest }) => rest),
    [shopPartnerOrderRows]
  );
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

  const loadAppointmentsAndOrders = React.useCallback(async () => {
    if (!myShop?.id) return;
    const shopId = myShop.id;

    const { data: aptRows, error: aptErr } = await supabase
      .from('appointments')
      .select('id, client_id, shop_id, service_id, professional_id, date, time, status, amount')
      .eq('shop_id', shopId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    if (!aptErr && aptRows) {
      const mapped: Appointment[] = aptRows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        clientId: String(r.client_id),
        shopId: String(r.shop_id),
        serviceId: String(r.service_id),
        professionalId: String(r.professional_id),
        date: typeof r.date === 'string' ? r.date.split('T')[0] : String(r.date),
        time: typeof r.time === 'string' ? String(r.time).slice(0, 8) : String(r.time),
        status: (r.status as Appointment['status']) || 'PENDING',
        amount: Number(r.amount) || 0,
      }));
      setAppointments(mapped);
    }

    const { data: ordRows, error: ordErr } = await supabase
      .from('orders')
      .select('id, client_id, shop_id, items, total, status, created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (ordErr || !ordRows) {
      setShopPartnerOrderRows([]);
      return;
    }

    const clientIds = [...new Set(ordRows.map((r) => String((r as { client_id: string }).client_id)))];
    const profById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
    if (clientIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', clientIds);
      for (const p of profs ?? []) {
        const row = p as { id: string; full_name?: string | null; avatar_url?: string | null };
        profById.set(String(row.id), { full_name: row.full_name, avatar_url: row.avatar_url });
      }
    }

    const rows: ShopPartnerOrderRow[] = ordRows.map((r: Record<string, unknown>) => {
      const pid = String(r.client_id);
      const createdRaw = r.created_at ? String(r.created_at) : new Date().toISOString();
      const prof = profById.get(pid);
      const nameFromProf = prof?.full_name?.trim();
      return {
        id: String(r.id),
        clientId: pid,
        shopId: String(r.shop_id),
        items: Array.isArray(r.items) ? (r.items as Order['items']) : [],
        total: Number(r.total) || 0,
        status: (r.status as Order['status']) || 'PENDING',
        date: new Date(createdRaw).toLocaleDateString('pt-BR'),
        createdAtIso: createdRaw,
        clientDisplayName: nameFromProf || `Cliente #${pid.slice(0, 8)}`,
        clientAvatarUrl: prof?.avatar_url?.trim() || null,
      };
    });
    setShopPartnerOrderRows(rows);
  }, [myShop?.id]);

  useEffect(() => {
    loadAppointmentsAndOrders();
  }, [loadAppointmentsAndOrders]);

  const refreshAppointments = React.useCallback(async () => {
    if (!myShop?.id) return;
    const shopId = myShop.id;
    const { data: aptRows, error: aptErr } = await supabase
      .from('appointments')
      .select('id, client_id, shop_id, service_id, professional_id, date, time, status, amount')
      .eq('shop_id', shopId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    if (!aptErr && aptRows) {
      const mapped: Appointment[] = aptRows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        clientId: String(r.client_id),
        shopId: String(r.shop_id),
        serviceId: String(r.service_id),
        professionalId: String(r.professional_id),
        date: typeof r.date === 'string' ? r.date.split('T')[0] : String(r.date),
        time: typeof r.time === 'string' ? String(r.time).slice(0, 8) : String(r.time),
        status: (r.status as Appointment['status']) || 'PENDING',
        amount: Number(r.amount) || 0,
      }));
      setAppointments(mapped);
    }
  }, [myShop?.id]);

  const markAppointmentCompleted = React.useCallback(async (aptId: string) => {
    if (!myShop?.id) return;
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'COMPLETED' })
      .eq('id', aptId)
      .eq('shop_id', myShop.id);
    if (error) {
      alert('Não foi possível marcar o atendimento como concluído. Tente novamente.');
      return;
    }
    await refreshAppointments();
  }, [myShop?.id, refreshAppointments]);

  const markOrderDelivered = React.useCallback(
    async (orderId: string) => {
      if (!myShop?.id) return;
      const { error } = await supabase
        .from('orders')
        .update({ status: 'DELIVERED' })
        .eq('id', orderId)
        .eq('shop_id', myShop.id)
        .eq('status', 'PAID');
      if (error) {
        alert('Não foi possível marcar o pedido como entregue. Tente novamente.');
        return;
      }
      await loadAppointmentsAndOrders();
    },
    [myShop?.id, loadAppointmentsAndOrders]
  );

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
      primaryColor: d.primary_color || '#1a1a1a',
      theme: d.theme || 'MODERN',
      subscriptionActive: d.subscription_active,
      subscriptionAmount: d.subscription_amount != null ? Number(d.subscription_amount) : 99,
      splitPercent: d.split_percent != null ? Number(d.split_percent) : 95,
      passFeesToCustomer: d.pass_fees_to_customer === true,
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

  if (user && user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user && user.role === 'CLIENT') return <Navigate to="/" replace />;

  if (!user) {
    const handlePartnerAdminLogin = async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao entrar.' };
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (profile?.role === 'cliente') {
        await supabase.auth.signOut();
        return { error: 'Esta área é só para parceiros e administradores. Use a página inicial para entrar como cliente.' };
      }
      return { error: null };
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center">
          <a href="/" className="text-sm text-gray-500 hover:text-indigo-600">← Voltar (sou cliente)</a>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <i className="fas fa-scissors"></i>
            </div>
            <span className="font-display text-lg font-bold text-gray-800">BeautyHub</span>
          </div>
          <div className="w-24" aria-hidden />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto min-h-0">
          <LoginForm
            title="Acesso parceiro"
            subtitle="Barbearias e salões: entre somente com o e-mail e senha do estabelecimento"
            onSubmit={handlePartnerAdminLogin}
            submitLabel="Entrar"
            onSuccess={() => {}}
          />
          <p className="mt-4 text-xs text-gray-400 text-center max-w-sm">
            Área exclusiva para parceiros (estabelecimentos) e administradores. Cliente? Use a página inicial.
          </p>
        </main>
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
        pass_fees_to_customer: updated.passFeesToCustomer === true,
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

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  if (!myShop) {
    return (
      <Layout
        user={user}
        onLogout={handleLogout}
        onNavigate={setCurrentView}
        currentView={currentView}
        notifications={notifications}
        onMarkRead={markAllAsRead}
        partnerBrandPrimary={myShop?.primaryColor}
      >
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-gray-500">
            <i className="fas fa-spinner fa-spin text-4xl mb-4"></i>
            <p className="font-medium">Carregando dados da sua loja...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      onNavigate={setCurrentView}
      currentView={currentView}
      notifications={notifications}
      onMarkRead={markAllAsRead}
      partnerBrandPrimary={myShop.primaryColor}
    >
      {currentView === 'shop-dashboard' && (
        <ShopDashboard
          shop={myShop}
          appointments={appointments}
          orders={dashboardOrders}
          onMarkAppointmentCompleted={markAppointmentCompleted}
          onGoToOnboarding={() => setCurrentView('shop-onboarding')}
        />
      )}
      {currentView === 'shop-onboarding' && <ShopOnboarding shop={myShop} />}
      {currentView === 'shop-wallet' && <ShopWallet shop={myShop} />}
      {currentView === 'shop-orders' && (
        <ShopOrders shop={myShop} orders={shopPartnerOrderRows} onMarkDelivered={markOrderDelivered} />
      )}
      {currentView === 'shop-customization' && <ShopCustomization key={`customize-${myShop.id}-${currentView}-${customizationRefreshKey}`} shop={myShop} onSave={updateShop} />}
    </Layout>
  );
}
