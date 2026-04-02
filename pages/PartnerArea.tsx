import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ShopDashboard from '../views/ShopDashboard';
import ShopCustomization from '../views/ShopCustomization';
import ShopOnboarding from '../views/ShopOnboarding';
import ShopWallet from '../views/ShopWallet';
import ShopOrders from '../views/ShopOrders';
import ShopAgenda, { type AgendaSchedulePayload } from '../views/ShopAgenda';
import { LoginForm } from '../components/LoginForm';
import { Shop, Order, PartnerAgendaAppointment } from '../types';
import { supabase } from '../src/lib/supabase';
import { APP_NAME, APP_LOGO_SRC } from '../lib/branding';
import { isClientOnlyRole } from '../lib/profileRole';
import { normalizeSplitPercent } from '../services/supabase/_format';
import { useShop } from '../hooks/useShop';
import { usePartnerData } from '../hooks/usePartnerData';

export default function PartnerArea() {
  const { user, loading, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [shopReloadKey, setShopReloadKey] = useState(0);
  const { shop: myShop, setShop: setMyShop, reloadShop } = useShop(user?.shopId, shopReloadKey);
  const staffProfessionalId = user?.professionalId;
  const {
    appointments,
    shopPartnerOrderRows,
    reloadPartnerData,
    reloadAppointmentsOnly,
  } = usePartnerData(myShop?.id, staffProfessionalId);
  const [currentView, setCurrentView] = useState<
    | 'shop-dashboard'
    | 'shop-agenda'
    | 'shop-onboarding'
    | 'shop-wallet'
    | 'shop-customization'
    | 'shop-orders'
  >('shop-dashboard');
  const [agendaAppointments, setAgendaAppointments] = useState<PartnerAgendaAppointment[]>([]);

  const dashboardOrders: Order[] = React.useMemo(
    () =>
      shopPartnerOrderRows.map(({ createdAtIso: _c, clientDisplayName: _n, clientAvatarUrl: _a, ...rest }) => rest),
    [shopPartnerOrderRows]
  );
  const [customizationRefreshKey, setCustomizationRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: 'SUCCESS' | 'INFO' | 'WARNING'; timestamp: Date; read: boolean }[]>([]);

  const isShopOwner = user?.role === 'SHOP';
  const isStaff = user?.role === 'STAFF';

  useEffect(() => {
    if (!isStaff) return;
    if (currentView === 'shop-customization' || currentView === 'shop-onboarding') {
      setCurrentView('shop-dashboard');
    }
  }, [isStaff, currentView]);

  useEffect(() => {
    if (!myShop?.id) {
      setAgendaAppointments([]);
      return;
    }
    if (appointments.length === 0) {
      setAgendaAppointments([]);
      return;
    }
    const clientIds = [...new Set(appointments.map((a) => a.clientId))];
    let cancelled = false;
    (async () => {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, phone').in('id', clientIds);
      if (cancelled) return;
      const map = new Map(
        (profs ?? []).map((p: { id: string; full_name?: string | null; phone?: string | null }) => [String(p.id), p])
      );
      const rows: PartnerAgendaAppointment[] = appointments.map((a) => {
        const pr = map.get(a.clientId);
        return {
          ...a,
          clientDisplayName: pr?.full_name?.trim() || `Cliente #${a.clientId.slice(0, 8)}`,
          clientPhone: pr?.phone?.trim() || null,
        };
      });
      setAgendaAppointments(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [myShop?.id, appointments]);

  const markAppointmentCompleted = React.useCallback(async (aptId: string) => {
    if (!myShop?.id) return;
    let upd = supabase
      .from('appointments')
      .update({ status: 'COMPLETED' })
      .eq('id', aptId)
      .eq('shop_id', myShop.id);
    if (staffProfessionalId) upd = upd.eq('professional_id', staffProfessionalId);
    const { error } = await upd;
    if (error) {
      alert('Não foi possível marcar o atendimento como concluído. Tente novamente.');
      return;
    }
    await reloadAppointmentsOnly();
  }, [myShop?.id, staffProfessionalId, reloadAppointmentsOnly]);

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
      await reloadPartnerData();
    },
    [myShop?.id, reloadPartnerData]
  );

  const saveAgendaSettings = React.useCallback(
    async (payload: AgendaSchedulePayload) => {
      if (!myShop?.id || !isShopOwner) return;
      const { error } = await supabase
        .from('shops')
        .update({
          workday_start: payload.workdayStart,
          workday_end: payload.workdayEnd,
          lunch_start: payload.lunchStart,
          lunch_end: payload.lunchEnd,
          agenda_slot_minutes: payload.agendaSlotMinutes,
        })
        .eq('id', myShop.id);
      if (error) throw new Error(error.message);
      setMyShop((prev) =>
        prev
          ? {
              ...prev,
              workdayStart: payload.workdayStart,
              workdayEnd: payload.workdayEnd,
              lunchStart: payload.lunchStart,
              lunchEnd: payload.lunchEnd,
              agendaSlotMinutes: payload.agendaSlotMinutes,
            }
          : null
      );
    },
    [myShop?.id, isShopOwner, setMyShop]
  );

  const rescheduleAppointment = React.useCallback(
    async (appointmentId: string, date: string, timeHHMMSS: string) => {
      if (!myShop?.id) return;
      let upd = supabase
        .from('appointments')
        .update({ date, time: timeHHMMSS })
        .eq('id', appointmentId)
        .eq('shop_id', myShop.id);
      if (staffProfessionalId) upd = upd.eq('professional_id', staffProfessionalId);
      const { error } = await upd;
      if (error) throw new Error(error.message);
      await reloadAppointmentsOnly();
    },
    [myShop?.id, staffProfessionalId, reloadAppointmentsOnly]
  );

  const cancelAppointmentPartner = React.useCallback(
    async (appointmentId: string) => {
      if (!myShop?.id) return;
      let upd = supabase
        .from('appointments')
        .update({ status: 'CANCELLED' })
        .eq('id', appointmentId)
        .eq('shop_id', myShop.id);
      if (staffProfessionalId) upd = upd.eq('professional_id', staffProfessionalId);
      const { error } = await upd;
      if (error) throw new Error(error.message);
      await reloadAppointmentsOnly();
    },
    [myShop?.id, staffProfessionalId, reloadAppointmentsOnly]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (user?.role === 'PENDING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
        <p className="text-gray-700 text-center max-w-sm">
          Sessão ativa, mas o perfil não veio do servidor (RLS ou rede). Tente de novo. Donos de loja com perfil desatualizado: rode a migration «resync shop owner» no Supabase.
        </p>
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

  if (user && user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user && user.role === 'CLIENT') return <Navigate to="/" replace />;

  if (!user) {
    const handlePartnerAdminLogin = async (email: string, password: string) => {
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
        return { error: 'Não foi possível validar seu perfil. Tente de novo; se persistir, contate o suporte.' };
      }
      if (!profile || isClientOnlyRole(profile.role)) {
        await supabase.auth.signOut();
        return {
          error:
            'Este login está como cliente em profiles: o id do seu e-mail (Authentication → User UID) precisa ser o mesmo da linha com role admin ou barbearia. Ajuste com UPDATE em public.profiles ou corrija o role dessa linha.',
        };
      }
      await refreshProfile();
      return { error: null };
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center">
          <a href="/" className="text-sm text-gray-500 hover:text-indigo-600">← Voltar (sou cliente)</a>
          <div className="flex items-center gap-2">
            <img src={APP_LOGO_SRC} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm bg-white" />
            <span className="font-display text-lg font-bold text-gray-800 leading-tight">{APP_NAME}</span>
          </div>
          <div className="w-24" aria-hidden />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto min-h-0">
          <LoginForm
            title="Acesso parceiro"
            subtitle="Dono da barbearia ou funcionário: use o e-mail e senha fornecidos pelo estabelecimento"
            onSubmit={handlePartnerAdminLogin}
            submitLabel="Entrar"
            onSuccess={() => {}}
          />
          <p className="mt-4 text-xs text-gray-400 text-center max-w-sm">
            Área para donos, equipe e administradores. Cliente? Use a página inicial.
          </p>
        </main>
      </div>
    );
  }

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const updateShop = async (updated: Shop) => {
    if (!myShop?.id || !isShopOwner) return;
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
          desired_net_receipt: null,
        }).match({ id: s.id, shop_id: shopId });
        if (e) throw new Error(`Serviços: ${e.message}`);
      } else {
        const { error: e } = await supabase.from('services').insert({
          shop_id: shopId,
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          duration: Number(s.duration),
          desired_net_receipt: null,
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
          email: p.email?.trim() || null,
          phone: p.phone?.trim() || null,
          cpf_cnpj: p.cpfCnpj?.replace(/\D/g, '') || null,
          birth_date: p.birthDate?.trim() || null,
          split_percent: normalizeSplitPercent(p.splitPercent, updated.splitPercent ?? 95),
        }).match({ id: p.id, shop_id: shopId });
        if (e) throw new Error(`Equipe: ${e.message}`);
      } else {
        const { error: e } = await supabase.from('professionals').insert({
          shop_id: shopId,
          name: p.name,
          specialty: p.specialty ?? null,
          avatar: p.avatar ?? null,
          email: p.email?.trim() || null,
          phone: p.phone?.trim() || null,
          cpf_cnpj: p.cpfCnpj?.replace(/\D/g, '') || null,
          birth_date: p.birthDate?.trim() || null,
          split_percent: normalizeSplitPercent(p.splitPercent, updated.splitPercent ?? 95),
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
          desired_net_receipt: null,
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
          desired_net_receipt: null,
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
    setNotifications(prev => [{
      id: Math.random().toString(36).slice(2),
      title: 'Alterações salvas',
      message: 'As configurações da loja foram atualizadas com sucesso.',
      type: 'SUCCESS',
      timestamp: new Date(),
      read: false,
    }, ...prev]);

    await reloadShop();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        await fetch('/api/partner/professionals/provision-wallets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ shopId }),
        });
      }
    } catch {
      // Provisionamento de subconta é best-effort; não bloqueia salvamento.
    }

    await reloadShop();
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
          onGoToOnboarding={isShopOwner ? () => setCurrentView('shop-onboarding') : undefined}
          staffMode={isStaff}
        />
      )}
      {currentView === 'shop-agenda' && (
        <ShopAgenda
          shop={myShop}
          appointments={agendaAppointments}
          allowEditShopSchedule={isShopOwner}
          onSaveSchedule={async (p) => {
            try {
              await saveAgendaSettings(p);
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Erro ao salvar horários.');
            }
          }}
          onReschedule={async (id, date, time) => {
            try {
              await rescheduleAppointment(id, date, time);
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Erro ao remarcar.');
            }
          }}
          onCancel={async (id) => {
            try {
              await cancelAppointmentPartner(id);
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Erro ao cancelar.');
            }
          }}
        />
      )}
      {currentView === 'shop-onboarding' && <ShopOnboarding shop={myShop} />}
      {currentView === 'shop-wallet' && <ShopWallet shop={myShop} />}
      {currentView === 'shop-orders' && (
        <ShopOrders shop={myShop} orders={shopPartnerOrderRows} onMarkDelivered={markOrderDelivered} />
      )}
      {currentView === 'shop-customization' && (
        <ShopCustomization
          key={`customize-${myShop.id}-${currentView}-${customizationRefreshKey}`}
          shop={myShop}
          onSave={updateShop}
          onStaffAccessCreated={() => setShopReloadKey((k) => k + 1)}
        />
      )}
    </Layout>
  );
}
