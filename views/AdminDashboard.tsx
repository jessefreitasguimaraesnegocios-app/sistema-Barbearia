
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import {
  fetchAdminShopById,
  type AdminShopsAggregateStats,
} from '../services/supabase/shops';
import { APP_NAME } from '../lib/branding';
import { shopTypeAdminPillClass, shopTypeShortLabel } from '../lib/shopTypeDisplay';
import { MP_PREAPPROVAL_PLAN_OPTIONS } from '../lib/platformMercadoPagoPlans';

type RuntimeMode = 'production' | 'sandbox';

type AdminAlertType = 'success' | 'info' | 'warning' | 'error';

function showAdminAlert(type: AdminAlertType, message: string, details?: string) {
  const titleByType: Record<AdminAlertType, string> = {
    success: 'Sucesso',
    info: 'Informação',
    warning: 'Atenção',
    error: 'Erro',
  };
  const base = `Portal Admin - ${titleByType[type]}\n\n${message}`;
  if (!details) {
    alert(base);
    return;
  }
  const trimmed = details.trim();
  if (!trimmed) {
    alert(base);
    return;
  }
  const safeDetails = trimmed.slice(0, 500);
  alert(`${base}\n\nDetalhes: ${safeDetails}${trimmed.length > 500 ? '...' : ''}`);
}

async function adminAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

/** Evita SyntaxError quando a função retorna HTML (500) em vez de JSON. */
async function parseAdminDeleteResponse(res: Response): Promise<{ success: boolean; error?: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { success?: boolean; error?: string };
    return {
      success: data.success === true,
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  } catch {
    return {
      success: false,
      error:
        res.status >= 500
          ? 'Erro no servidor. Confira os logs na Vercel e as variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'
          : 'Resposta inválida do servidor.',
    };
  }
}

/** Evita SyntaxError quando o edge retorna HTML (500) em vez de JSON. */
async function parseSubscriptionPatchResponse(
  res: Response
): Promise<{ success: boolean; shop?: Shop; error?: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as {
      success?: boolean;
      shop?: Shop;
      error?: string;
      details?: string;
    };
    const baseErr = typeof data.error === 'string' ? data.error : undefined;
    const details =
      typeof data.details === 'string' && data.details.trim() !== '' ? data.details.trim().slice(0, 400) : '';
    return {
      success: data.success === true,
      shop: data.shop,
      error: details ? (baseErr ? `${baseErr} (${details})` : details) : baseErr,
    };
  } catch {
    const error =
      res.status === 502
        ? 'Resposta inválida do serviço de autenticação.'
        : res.status >= 500
          ? 'Erro no servidor. Tente de novo em instantes.'
          : 'Resposta inválida do servidor.';
    return { success: false, error };
  }
}

// Máscara telefone BR: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Máscara CPF (11 dígitos) ou CNPJ (14 dígitos) – apenas números
function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Rascunho local da linha financeira (mensalidade / splits / ID Asaas) — persiste só com Salvar. */
type ShopFinancialDraft = {
  subscriptionAmount: number;
  splitPercent: number;
  splitPercentSandbox: number;
  asaasPlatformSubscriptionId: string;
  mercadoPagoPreapprovalPlanId: string;
};

function shopToFinancialDraft(shop: Shop): ShopFinancialDraft {
  return {
    subscriptionAmount: shop.subscriptionAmount ?? 99,
    splitPercent: shop.splitPercent ?? 95,
    splitPercentSandbox: shop.splitPercentSandbox ?? shop.splitPercent ?? 95,
    asaasPlatformSubscriptionId: shop.asaasPlatformSubscriptionId ?? '',
    mercadoPagoPreapprovalPlanId: shop.mpPreapprovalPlanId ?? MP_PREAPPROVAL_PLAN_OPTIONS[0].id,
  };
}

function financialDraftDirty(shop: Shop, draft: ShopFinancialDraft): boolean {
  const o = shopToFinancialDraft(shop);
  return (
    draft.subscriptionAmount !== o.subscriptionAmount ||
    draft.splitPercent !== o.splitPercent ||
    draft.splitPercentSandbox !== o.splitPercentSandbox ||
    draft.asaasPlatformSubscriptionId.trim() !== o.asaasPlatformSubscriptionId.trim() ||
    draft.mercadoPagoPreapprovalPlanId !== o.mercadoPagoPreapprovalPlanId
  );
}

interface AdminDashboardProps {
  shops: Shop[];
  setShops: (shops: Shop[] | ((prev: Shop[]) => Shop[])) => void;
  adminStats: AdminShopsAggregateStats;
  onRefreshAdminStats: () => void | Promise<void>;
  shopsHasMore: boolean;
  onLoadMoreShops: () => void | Promise<void>;
  onShopCreated?: () => void | Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  shops,
  setShops,
  adminStats,
  onRefreshAdminStats,
  shopsHasMore,
  onLoadMoreShops,
  onShopCreated,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRuntimeModeModal, setShowRuntimeModeModal] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('production');
  const [runtimeModeLoading, setRuntimeModeLoading] = useState(false);
  const [runtimeConfirmInput, setRuntimeConfirmInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'BARBER',
    cnpjCpf: '',
    email: '',
    phone: '',
    password: '',
    postalCode: '',
    address: '',
    subscriptionAmount: MP_PREAPPROVAL_PLAN_OPTIONS[0].amountHint,
    trialDays: 15 as 15 | 30,
    splitPercent: 95,
    splitPercentSandbox: 95,
    mercadoPagoPreapprovalPlanId: MP_PREAPPROVAL_PLAN_OPTIONS[0].id,
  });

  const [financialDrafts, setFinancialDrafts] = useState<Record<string, ShopFinancialDraft>>({});
  const [savingFinancialShopId, setSavingFinancialShopId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedShopDetail, setSelectedShopDetail] = useState<Shop | null>(null);
  const [selectedShopDetailLoading, setSelectedShopDetailLoading] = useState(false);
  const [showEditShopModal, setShowEditShopModal] = useState(false);
  const [shopSearch, setShopSearch] = useState('');
  const [savingRuntimeShopId, setSavingRuntimeShopId] = useState<string | null>(null);

  useEffect(() => {
    const ids = new Set(shops.map((s) => s.id));
    setFinancialDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [shops]);

  const getFinancialDraft = (shop: Shop): ShopFinancialDraft =>
    financialDrafts[shop.id] ?? shopToFinancialDraft(shop);

  const filteredShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((s) => {
      const typeLabel = shopTypeShortLabel(s.type).toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        String(s.email || '').toLowerCase().includes(q) ||
        typeLabel.includes(q)
      );
    });
  }, [shops, shopSearch]);

  const selectedShop = useMemo(() => {
    if (!selectedShopId) return null;
    if (selectedShopDetail?.id === selectedShopId) return selectedShopDetail;
    return shops.find((s) => s.id === selectedShopId) ?? null;
  }, [selectedShopDetail, selectedShopId, shops]);

  useEffect(() => {
    if (!selectedShopId) return;
    if (!shops.some((s) => s.id === selectedShopId)) {
      setSelectedShopId(null);
      setSelectedShopDetail(null);
      setShowEditShopModal(false);
    }
  }, [shops, selectedShopId]);

  const patchFinancialDraft = (shop: Shop, patch: Partial<ShopFinancialDraft>) => {
    setFinancialDrafts((prev) => {
      const base = prev[shop.id] ?? shopToFinancialDraft(shop);
      return { ...prev, [shop.id]: { ...base, ...patch } };
    });
  };

  const clearFinancialDraft = (shopId: string) => {
    setFinancialDrafts((prev) => {
      if (!(shopId in prev)) return prev;
      const next = { ...prev };
      delete next[shopId];
      return next;
    });
  };

  const openEditShop = useCallback((shop: Shop) => {
    setSelectedShopId(shop.id);
    setSelectedShopDetail(shop);
    setShowEditShopModal(true);
    setSelectedShopDetailLoading(true);
    void (async () => {
      try {
        const detailed = await fetchAdminShopById(supabase, shop.id);
        if (detailed) setSelectedShopDetail((prev) => (prev?.id === shop.id ? detailed : prev));
      } finally {
        setSelectedShopDetailLoading(false);
      }
    })();
  }, []);

  const saveShopFinancialDraft = async (shop: Shop) => {
    const draft = financialDrafts[shop.id];
    if (!draft || !financialDraftDirty(shop, draft)) return;

    const orig = shopToFinancialDraft(shop);
    const body: Record<string, unknown> = {};
    if (draft.subscriptionAmount !== orig.subscriptionAmount) body.subscriptionAmount = draft.subscriptionAmount;
    if (draft.splitPercent !== orig.splitPercent) body.splitPercent = draft.splitPercent;
    if (draft.splitPercentSandbox !== orig.splitPercentSandbox) body.splitPercentSandbox = draft.splitPercentSandbox;
    const dTrim = draft.asaasPlatformSubscriptionId.trim();
    const oTrim = orig.asaasPlatformSubscriptionId.trim();
    if (dTrim !== oTrim) {
      body.asaasPlatformSubscriptionId = dTrim === '' ? null : dTrim.slice(0, 200);
    }
    if (draft.mercadoPagoPreapprovalPlanId !== orig.mercadoPagoPreapprovalPlanId) {
      body.mercadoPagoPreapprovalPlanId = draft.mercadoPagoPreapprovalPlanId;
    }

    if (Object.keys(body).length === 0) return;

    setSavingFinancialShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: 'PATCH',
        headers: await adminAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await parseSubscriptionPatchResponse(response);
      if (data.success && data.shop) {
        setShops((prev) => prev.map((s) => (s.id === shop.id ? (data.shop as Shop) : s)));
        setSelectedShopDetail((prev) => (prev?.id === shop.id ? (data.shop as Shop) : prev));
        clearFinancialDraft(shop.id);
        void onRefreshAdminStats();
      } else {
        showAdminAlert('error', data.error || 'Não foi possível salvar as alterações financeiras deste parceiro.');
      }
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao salvar alterações financeiras. Tente novamente.');
    } finally {
      setSavingFinancialShopId(null);
    }
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showAdminAlert('warning', 'Sua sessão expirou. Faça login novamente para cadastrar parceiros.');
        setIsSubmitting(false);
        return;
      }

      const subAmt = Number(formData.subscriptionAmount);
      const sp = Math.min(100, Math.max(0, Math.floor(Number(formData.splitPercent))));
      const sps = Math.min(100, Math.max(0, Math.floor(Number(formData.splitPercentSandbox))));
      const phoneDigits = formData.phone.replace(/\D/g, '');
      const cepDigits = formData.postalCode.replace(/\D/g, '').slice(0, 8);
      const body = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: phoneDigits.length > 0 ? formData.phone : undefined,
        cpfCnpj: formData.cnpjCpf.replace(/\D/g, '') || undefined,
        password: formData.password,
        type: formData.type,
        address: formData.address.trim() || undefined,
        postalCode: cepDigits.length === 8 ? cepDigits : undefined,
        subscriptionAmount: Number.isFinite(subAmt) && subAmt >= 0 ? subAmt : 99,
        trialDays: formData.trialDays,
        splitPercent: Number.isFinite(sp) ? sp : 95,
        splitPercentSandbox: Number.isFinite(sps) ? sps : 95,
        mercadoPagoPreapprovalPlanId: formData.mercadoPagoPreapprovalPlanId,
      };

      let responseOk: boolean;
      let responseStatus: number;
      let data: Record<string, unknown>;

      const createShopTimeoutMs = 75_000;
      const abortController = new AbortController();
      const abortTimer = window.setTimeout(() => abortController.abort(), createShopTimeoutMs);
      let apiRes: Response;
      try {
        apiRes = await fetch(`${window.location.origin}/api/admin/create-shop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
          signal: abortController.signal,
        });
      } finally {
        window.clearTimeout(abortTimer);
      }

      if (apiRes.status === 404) {
        const { data: invokeData, error } = await supabase.functions.invoke('create-shop', {
          body,
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        responseOk = !error;
        responseStatus = error ? 401 : 200;
        if (error) {
          let errBody: Record<string, unknown> = {};
          const err = error as { context?: { json?: () => Promise<unknown> } };
          if (typeof err.context?.json === 'function') {
            try {
              errBody = (await err.context.json()) as Record<string, unknown>;
            } catch {
              /* ignore */
            }
          }
          data = {
            success: false,
            error: (errBody?.error as string) || error.message,
            details: errBody?.details,
          };
        } else {
          data = (invokeData as Record<string, unknown>) || {};
        }
      } else {
        responseOk = apiRes.ok;
        responseStatus = apiRes.status;
        data = (await apiRes.json().catch(() => ({}))) as Record<string, unknown>;
      }

      if (import.meta.env.DEV) {
        console.log('[create-shop] response:', { status: responseStatus, data });
      }

      if (!responseOk) {
        const msg = (data?.error as string) || (responseStatus === 401 ? 'Sessão expirada. Faça login novamente.' : 'Erro ao cadastrar barbearia.');
        const details = data?.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : '';
        showAdminAlert('error', msg, details);
        return;
      }
      if (data?.success) {
        await onShopCreated?.();
        setShowAddModal(false);
        setFormData({
          name: '',
          type: 'BARBER',
          cnpjCpf: '',
          email: '',
          phone: '',
          password: '',
          postalCode: '',
          address: '',
          subscriptionAmount: MP_PREAPPROVAL_PLAN_OPTIONS[0].amountHint,
          trialDays: 15 as 15 | 30,
          splitPercent: 95,
          splitPercentSandbox: 95,
          mercadoPagoPreapprovalPlanId: MP_PREAPPROVAL_PLAN_OPTIONS[0].id,
        });
        showAdminAlert(
          'success',
          'Estabelecimento cadastrado com sucesso.',
          'O responsável já pode entrar com o e-mail e a senha informados. Os dados bancários e contas de recebimento devem ser cadastrados no seu sistema externo.'
        );
      } else {
        const msg = data?.details || data?.error || 'Erro ao cadastrar barbearia.';
        showAdminAlert('error', typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } catch (error) {
      console.error('Error creating shop:', error);
      if ((error instanceof DOMException || error instanceof Error) && error.name === 'AbortError') {
        showAdminAlert(
          'warning',
          'O cadastro excedeu o tempo limite. Tente novamente.',
          'Se o problema continuar, confirme no Supabase se a função create-shop está deployada e valide os logs da Vercel/Supabase.'
        );
      } else {
        showAdminAlert('error', 'Falha de conexão ao cadastrar estabelecimento. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSubscription = async (shop: Shop) => {
    const next = !shop.subscriptionActive;
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: 'PATCH',
        headers: await adminAuthHeaders(),
        body: JSON.stringify({ subscriptionActive: next })
      });
      const data = await parseSubscriptionPatchResponse(response);
      if (data.success && data.shop) {
        setShops(shops.map(s => s.id === shop.id ? data.shop : s));
        setSelectedShopDetail((prev) => (prev?.id === shop.id ? (data.shop as Shop) : prev));
        clearFinancialDraft(shop.id);
        void onRefreshAdminStats();
      } else {
        showAdminAlert('error', data.error || 'Não foi possível atualizar a assinatura do parceiro.');
      }
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao atualizar a assinatura. Tente novamente.');
    }
  };

  const handleCnpjCpfChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 14);
    setFormData(prev => ({ ...prev, cnpjCpf: formatCnpjCpf(digits) }));
  };

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, phone: formatPhone(digits) }));
  };

  const fetchAddressByCep = async () => {
    const cepDigits = formData.postalCode.replace(/\D/g, '');
    if (cepDigits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data?.erro) {
        showAdminAlert('info', 'CEP não encontrado. Confira o número informado.');
        return;
      }
      const streetPart = [data.logradouro, data.bairro].filter(Boolean).join(', ');
      const cityPart = [data.localidade, data.uf].filter(Boolean).join('/');
      const composed = [streetPart, cityPart].filter(Boolean).join(' - ');
      const cepPretty = formatCep(cepDigits);
      const withCep = composed
        ? `${composed}${cepPretty ? ` — CEP ${cepPretty}` : ''}`
        : cepPretty
          ? `CEP ${cepPretty}`
          : '';
      if (withCep) {
        setFormData((prev) => ({ ...prev, address: withCep }));
      }
    } catch {
      showAdminAlert('error', 'Não foi possível consultar o CEP agora. Tente novamente.');
    } finally {
      setLoadingCep(false);
    }
  };

  const effectiveAsaasRuntimeForShop = (shop: Shop): RuntimeMode =>
    shop.asaasRuntimeMode ?? runtimeMode;

  const patchShopAsaasRuntimeMode = async (shop: Shop, value: '' | 'production' | 'sandbox') => {
    setSavingRuntimeShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: 'PATCH',
        headers: await adminAuthHeaders(),
        body: JSON.stringify({
          asaasRuntimeMode: value === '' ? 'default' : value,
        }),
      });
      const data = await parseSubscriptionPatchResponse(response);
      if (data.success && data.shop) {
        setShops((prev) => prev.map((s) => (s.id === shop.id ? (data.shop as Shop) : s)));
        setSelectedShopDetail((prev) => (prev?.id === shop.id ? (data.shop as Shop) : prev));
      } else {
        showAdminAlert('error', data.error || 'Não foi possível atualizar o ambiente de pagamento deste parceiro.');
      }
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao atualizar o ambiente de pagamento.');
    } finally {
      setSavingRuntimeShopId(null);
    }
  };

  const deleteShop = async (shop: Shop) => {
    if (!window.confirm(`Excluir o estabelecimento "${shop.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}`, { method: 'DELETE', headers: await adminAuthHeaders() });
      const data = await parseAdminDeleteResponse(response);
      if (data.success) {
        clearFinancialDraft(shop.id);
        setShops(shops.filter(s => s.id !== shop.id));
        setSelectedShopDetail((prev) => (prev?.id === shop.id ? null : prev));
        void onRefreshAdminStats();
      } else {
        showAdminAlert('error', data.error || 'Não foi possível excluir o estabelecimento.');
      }
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao excluir o estabelecimento. Tente novamente.');
    }
  };

  const loadRuntimeMode = async () => {
    setRuntimeModeLoading(true);
    try {
      const response = await fetch('/api/admin/runtime-mode', {
        method: 'GET',
        headers: await adminAuthHeaders(),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; mode?: RuntimeMode; error?: string };
      if (!response.ok || !data.success) {
        if (response.status !== 401) {
          showAdminAlert('error', data.error || 'Não foi possível carregar o ambiente global de pagamento.');
        }
        return;
      }
      setRuntimeMode(data.mode === 'sandbox' ? 'sandbox' : 'production');
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao carregar o ambiente global de pagamento.');
    } finally {
      setRuntimeModeLoading(false);
    }
  };

  const requestToggleRuntimeMode = () => {
    setRuntimeConfirmInput('');
    setShowRuntimeModeModal(true);
  };

  const confirmToggleRuntimeMode = async () => {
    const nextMode: RuntimeMode = runtimeMode === 'sandbox' ? 'production' : 'sandbox';
    setRuntimeModeLoading(true);
    try {
      const response = await fetch('/api/admin/runtime-mode', {
        method: 'PATCH',
        headers: await adminAuthHeaders(),
        body: JSON.stringify({
          mode: nextMode,
          confirmationText: runtimeConfirmInput.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; mode?: RuntimeMode; error?: string };
      if (!response.ok || !data.success) {
        showAdminAlert('error', data.error || 'Não foi possível trocar o ambiente global de pagamento.');
        return;
      }
      setRuntimeMode(data.mode === 'sandbox' ? 'sandbox' : 'production');
      setShowRuntimeModeModal(false);
      setRuntimeConfirmInput('');
    } catch (e) {
      console.error(e);
      showAdminAlert('error', 'Falha de conexão ao trocar o ambiente global de pagamento.');
    } finally {
      setRuntimeModeLoading(false);
    }
  };

  React.useEffect(() => {
    void loadRuntimeMode();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-gray-900">Portal do Administrador</h2>
          <p className="text-gray-500">Gerenciamento global da plataforma {APP_NAME}.</p>
        </div>
        <div className="grid w-full max-w-md grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:max-w-none sm:flex-wrap sm:items-stretch">
          <div className="flex min-w-0 flex-col gap-2">
            <div
              className={`inline-flex h-11 w-full items-center justify-center rounded-xl border px-3 text-center text-xs font-black uppercase tracking-wide ${
                runtimeMode === 'sandbox'
                  ? 'border-amber-300 bg-amber-200 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-100'
                  : 'border-emerald-300 bg-emerald-200 text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-100'
              }`}
              title="Modo global da plataforma. Lojas com 'Padrão da plataforma' seguem este valor; outras podem fixar produção ou sandbox só para si."
            >
              {runtimeModeLoading ? 'Carregando...' : runtimeMode === 'sandbox' ? 'Sandbox ativo' : 'Produção ativa'}
            </div>
            <button
              type="button"
              onClick={requestToggleRuntimeMode}
              disabled={runtimeModeLoading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-black disabled:opacity-60"
            >
              Alternar ambiente
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex min-h-[96px] min-w-[130px] items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg transition-all hover:bg-indigo-700 sm:min-h-11 sm:min-w-0 sm:rounded-xl"
          >
            <i className="fas fa-plus"></i>
            <span className="text-center leading-tight">Adicionar Parceiro</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Total de Parceiros</p>
          <p className="text-4xl font-black text-indigo-600">{adminStats.totalShops}</p>
        </div>
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Assinaturas Ativas</p>
          <p className="text-4xl font-black text-green-500">{adminStats.activeSubscriptions}</p>
        </div>
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">MRR Estimado</p>
          <p className="text-4xl font-black text-indigo-900">R$ {adminStats.mrrEstimate.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-4xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50">
          <h3 className="text-xl font-bold text-gray-900">Lista de Parceiros</h3>
          <p className="text-sm text-gray-500 mt-2">
            Mensalidade, splits e ID da assinatura Asaas só são gravados no banco ao clicar em{' '}
            <span className="font-semibold text-gray-700">Salvar</span> na linha do parceiro.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-sm">
              <i className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
              <input
                type="text"
                placeholder="Buscar parceiro por nome, e-mail ou tipo"
                value={shopSearch}
                onChange={(e) => setShopSearch(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <div className="text-xs text-gray-500 sm:text-right">
              {filteredShops.length} de {shops.length} parceiros exibidos
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3 md:hidden">
          {filteredShops.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              Nenhum parceiro encontrado para este filtro.
            </div>
          ) : (
            filteredShops.map((shop) => {
              const fd = getFinancialDraft(shop);
              const rowFinancialDirty = financialDraftDirty(shop, fd);
              const isSelected = selectedShopId === shop.id;
              return (
                <div
                  key={shop.id}
                  className={`rounded-3xl border p-4 shadow-sm transition-all ${
                    isSelected ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <img src={shop.profileImage} className="h-12 w-12 rounded-xl object-cover" alt="" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-gray-900">{shop.name}</p>
                      <p className="truncate text-xs text-gray-500">{shop.email}</p>
                      <span
                        className={`mt-2 inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${shopTypeAdminPillClass(shop.type)}`}
                      >
                        {shopTypeShortLabel(shop.type)}
                      </span>
                      <div className="mt-3 space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Ambiente Asaas (loja)
                        </label>
                        <select
                          value={shop.asaasRuntimeMode ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === 'production' || v === 'sandbox') {
                              void patchShopAsaasRuntimeMode(shop, v);
                            }
                          }}
                          disabled={savingRuntimeShopId === shop.id}
                          className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-xs font-semibold text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                        >
                          <option value="">Padrão da plataforma</option>
                          <option value="production">Produção (fixo)</option>
                          <option value="sandbox">Sandbox (fixo)</option>
                        </select>
                        <p className="text-[10px] text-gray-400">
                          Efetivo:{' '}
                          {effectiveAsaasRuntimeForShop(shop) === 'sandbox' ? 'Sandbox' : 'Produção'}
                        </p>
                      </div>
                    </div>
                    {rowFinancialDirty ? (
                      <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">
                        Alterado
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-gray-50 p-2.5">
                      <p className="text-gray-400">Mensalidade</p>
                      <p className="font-bold text-gray-900">R$ {Number(fd.subscriptionAmount).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-2.5">
                      <p className="text-gray-400">Assinatura</p>
                      <p className={`font-bold ${shop.subscriptionActive ? 'text-green-600' : 'text-red-500'}`}>
                        {shop.subscriptionActive ? 'Ativa' : 'Inativa'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-2.5">
                      <p className="text-gray-400">Split prod.</p>
                      <p className="font-bold text-gray-900">{Number(fd.splitPercent).toFixed(0)}%</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-2.5">
                      <p className="text-gray-400">Split sandbox</p>
                      <p className="font-bold text-gray-900">{Number(fd.splitPercentSandbox).toFixed(0)}%</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedShopId(shop.id)}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {isSelected ? 'Selecionado' : 'Selecionar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditShop(shop)}
                      className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-black"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Estabelecimento</th>
                <th className="px-8 py-4">Tipo</th>
                <th className="px-8 py-4 w-52">Ambiente Asaas</th>
                <th className="px-8 py-4">Status Assinatura</th>
                <th className="px-8 py-4">Mensalidade</th>
                <th className="px-8 py-4">Plano Mercado Pago</th>
                <th className="px-8 py-4">Assin. plataforma (Asaas)</th>
                <th className="px-8 py-4">% Split (produção)</th>
                <th className="px-8 py-4">% Split (sandbox)</th>
                <th className="px-8 py-4">Asaas ID</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredShops.map((shop) => {
                const fd = getFinancialDraft(shop);
                const rowFinancialDirty = financialDraftDirty(shop, fd);
                return (
                <tr
                  key={shop.id}
                  className={`transition-colors ${
                    selectedShopId === shop.id
                      ? 'bg-indigo-50/60'
                      : rowFinancialDirty
                        ? 'bg-amber-50/50'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <img src={shop.profileImage} className="w-10 h-10 rounded-xl object-cover" alt="" />
                      <div>
                        <p className="font-bold text-gray-900">{shop.name}</p>
                        <p className="text-xs text-gray-500">{shop.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${shopTypeAdminPillClass(shop.type)}`}
                    >
                      {shopTypeShortLabel(shop.type)}
                    </span>
                  </td>
                  <td className="px-8 py-6 align-top">
                    <div className="flex flex-col gap-1.5 max-w-52">
                      <select
                        value={shop.asaasRuntimeMode ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || v === 'production' || v === 'sandbox') {
                            void patchShopAsaasRuntimeMode(shop, v);
                          }
                        }}
                        disabled={savingRuntimeShopId === shop.id}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3 pr-7 text-xs font-semibold text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                        title="Padrão = segue o chip global no topo. Fixo = sempre este ambiente para esta loja."
                      >
                        <option value="">Padrão da plataforma</option>
                        <option value="production">Produção (fixo)</option>
                        <option value="sandbox">Sandbox (fixo)</option>
                      </select>
                      <span className="text-[10px] text-gray-400">
                        Efetivo: {effectiveAsaasRuntimeForShop(shop) === 'sandbox' ? 'Sandbox' : 'Produção'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${shop.subscriptionActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-medium">{shop.subscriptionActive ? 'Ativa' : 'Inativa'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">R$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-20 p-2 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-600"
                        value={fd.subscriptionAmount}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v >= 0) patchFinancialDraft(shop, { subscriptionAmount: v });
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6 align-top min-w-[200px]">
                    <select
                      value={fd.mercadoPagoPreapprovalPlanId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const opt = MP_PREAPPROVAL_PLAN_OPTIONS.find((o) => o.id === id);
                        patchFinancialDraft(shop, {
                          mercadoPagoPreapprovalPlanId: id,
                          ...(opt ? { subscriptionAmount: opt.amountHint } : {}),
                        });
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-xs font-semibold text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      title="Checkout da mensalidade da plataforma (link Mercado Pago)"
                    >
                      {MP_PREAPPROVAL_PLAN_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-8 py-6 max-w-56">
                    <input
                      type="text"
                      placeholder="sub_…"
                      title="ID da assinatura na conta Asaas mãe (mensalidade)"
                      className="w-full min-w-0 p-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-mono text-gray-800 focus:ring-2 focus:ring-indigo-600"
                      value={fd.asaasPlatformSubscriptionId}
                      onChange={(e) => patchFinancialDraft(shop, { asaasPlatformSubscriptionId: e.target.value })}
                    />
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">%</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-16 p-2 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-600"
                        value={fd.splitPercent}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v >= 0 && v <= 100) patchFinancialDraft(shop, { splitPercent: v });
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">%</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          title="Usado quando o gateway está em modo sandbox"
                          className="w-16 p-2 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-amber-600"
                          value={fd.splitPercentSandbox}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                              patchFinancialDraft(shop, { splitPercentSandbox: v });
                            }
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">Gateway sandbox</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-mono text-gray-400">
                        {shop.asaasAccountId || (shop.asaasWalletId ? 'OK' : '—')}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {(() => {
                          const fin = shop.financeProvisionStatus ?? (shop.asaasWalletId ? 'active' : 'pending');
                          if (fin === 'active') return 'Financeiro: ativo';
                          if (fin === 'pending') return 'Financeiro: pendente';
                          if (fin === 'processing') return 'Financeiro: processando';
                          if (fin === 'awaiting_callback') return 'Financeiro: aguardando callback';
                          if (fin === 'failed') return 'Financeiro: falhou';
                          return `Financeiro: ${fin}`;
                        })()}
                      </span>
                      {shop.financeProvisionLastError && shop.financeProvisionStatus === 'failed' && (
                        <span className="text-[10px] text-red-500 line-clamp-2" title={shop.financeProvisionLastError}>
                          {shop.financeProvisionLastError}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedShopId(shop.id)}
                        className={`text-sm font-bold hover:underline ${
                          selectedShopId === shop.id ? 'text-indigo-700' : 'text-indigo-500'
                        }`}
                      >
                        {selectedShopId === shop.id ? 'Selecionado' : 'Selecionar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveShopFinancialDraft(shop)}
                        disabled={!rowFinancialDirty || savingFinancialShopId === shop.id}
                        className="text-sm font-bold px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {savingFinancialShopId === shop.id ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSubscription(shop)}
                        className={`text-sm font-bold ${shop.subscriptionActive ? 'text-red-500' : 'text-green-600'} hover:underline`}
                      >
                        {shop.subscriptionActive ? 'Suspender' : 'Reativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditShop(shop)}
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteShop(shop)}
                        className="text-sm font-bold text-gray-500 hover:text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shopsHasMore ? (
          <div className="p-6 border-t border-gray-50 flex justify-center">
            <button
              type="button"
              onClick={() => void onLoadMoreShops()}
              className="px-6 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Carregar mais estabelecimentos
            </button>
          </div>
        ) : null}
      </div>

      {showEditShopModal && selectedShop ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl animate-scale-in">
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-5 py-4 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Editar parceiro</p>
                  <h3 className="truncate text-xl font-bold text-gray-900">{selectedShop.name}</h3>
                  <p className="truncate text-xs text-gray-500">{selectedShop.email}</p>
                  {selectedShopDetailLoading ? (
                    <p className="mt-1 text-[11px] text-gray-400">Carregando detalhes completos...</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditShopModal(false)}
                  className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800"
                  aria-label="Fechar edição"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-5 py-5 sm:px-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Mensalidade (R$/mês)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={getFinancialDraft(selectedShop).subscriptionAmount}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v >= 0) {
                        patchFinancialDraft(selectedShop, { subscriptionAmount: v });
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Plano Mercado Pago (link de assinatura)
                  </label>
                  <select
                    value={getFinancialDraft(selectedShop).mercadoPagoPreapprovalPlanId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const opt = MP_PREAPPROVAL_PLAN_OPTIONS.find((o) => o.id === id);
                      patchFinancialDraft(selectedShop, {
                        mercadoPagoPreapprovalPlanId: id,
                        ...(opt ? { subscriptionAmount: opt.amountHint } : {}),
                      });
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3.5 text-sm font-semibold text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {MP_PREAPPROVAL_PLAN_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assinatura plataforma (Asaas)</label>
                  <input
                    type="text"
                    placeholder="sub_..."
                    value={getFinancialDraft(selectedShop).asaasPlatformSubscriptionId}
                    onChange={(e) =>
                      patchFinancialDraft(selectedShop, { asaasPlatformSubscriptionId: e.target.value })
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">% Split produção</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={getFinancialDraft(selectedShop).splitPercent}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                        patchFinancialDraft(selectedShop, { splitPercent: v });
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">% Split sandbox</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={getFinancialDraft(selectedShop).splitPercentSandbox}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                        patchFinancialDraft(selectedShop, { splitPercentSandbox: v });
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3.5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Resumo rápido</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-gray-700">
                    Tipo: {shopTypeShortLabel(selectedShop.type)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${
                      selectedShop.subscriptionActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {selectedShop.subscriptionActive ? 'Assinatura ativa' : 'Assinatura inativa'}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-gray-700">
                    Asaas ID: {selectedShop.asaasAccountId || selectedShop.asaasWalletId || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 border-t border-gray-100 bg-white px-5 py-4 sm:px-8">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditShopModal(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => toggleSubscription(selectedShop)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${
                    selectedShop.subscriptionActive
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}
                >
                  {selectedShop.subscriptionActive ? 'Suspender assinatura' : 'Reativar assinatura'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveShopFinancialDraft(selectedShop)}
                  disabled={
                    !financialDraftDirty(selectedShop, getFinancialDraft(selectedShop)) ||
                    savingFinancialShopId === selectedShop.id
                  }
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingFinancialShopId === selectedShop.id ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteShop(selectedShop)}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
                >
                  Excluir parceiro
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 min-h-screen">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] min-h-0 flex flex-col rounded-2xl sm:rounded-4xl shadow-2xl animate-scale-in overflow-hidden my-auto">
            <div className="shrink-0 px-4 pt-6 pb-2 sm:p-6 sm:pb-4 md:p-8 md:pb-6 border-b border-gray-100">
              <div className="flex justify-between items-center gap-4">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Novo Parceiro</h3>
                <button type="button" onClick={() => setShowAddModal(false)} className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors" aria-label="Fechar">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-1">
                Cadastro enxuto: só o necessário para o estabelecimento e o acesso do dono. Dados bancários, PIX e contas de recebimento ficam no seu outro sistema.
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4 sm:px-6 sm:pb-8 md:px-8 md:pb-10">
             <form onSubmit={handleAddShop} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Nome do estabelecimento</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Ex.: Vintage Barber Shop" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase ml-2">Tipo de estabelecimento</p>
                  <p className="text-xs text-gray-500 ml-2 -mt-1">
                    Escolhe conforme o negócio: isso define o perfil no catálogo (barbearia, salão ou manicure).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'BARBER' })}
                      aria-pressed={formData.type === 'BARBER'}
                      className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center font-bold transition-all border-2 ${
                        formData.type === 'BARBER'
                          ? 'border-indigo-600 bg-indigo-50 text-slate-900 shadow-md ring-2 ring-indigo-600/20'
                          : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${
                          formData.type === 'BARBER' ? 'bg-slate-900 text-white' : 'bg-gray-200 text-gray-600'
                        }`}
                        aria-hidden
                      >
                        <i className="fas fa-cut" />
                      </span>
                      Barbearia
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'SALON' })}
                      aria-pressed={formData.type === 'SALON'}
                      className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center font-bold transition-all border-2 ${
                        formData.type === 'SALON'
                          ? 'border-pink-500 bg-pink-50 text-pink-900 shadow-md ring-2 ring-pink-500/20'
                          : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${
                          formData.type === 'SALON' ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-600'
                        }`}
                        aria-hidden
                      >
                        <i className="fas fa-heart" />
                      </span>
                      Salão
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'MANICURE' })}
                      aria-pressed={formData.type === 'MANICURE'}
                      className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center font-bold transition-all border-2 ${
                        formData.type === 'MANICURE'
                          ? 'border-teal-600 bg-teal-50 text-teal-900 shadow-md ring-2 ring-teal-600/20'
                          : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${
                          formData.type === 'MANICURE' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
                        }`}
                        aria-hidden
                      >
                        <i className="fas fa-hand-sparkles" />
                      </span>
                      Manicure
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">CNPJ ou CPF (opcional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Se já tiver, informe aqui"
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.cnpjCpf}
                    onChange={(e) => handleCnpjCpfChange(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">E-mail do dono (login)</label>
                  <input 
                    required
                    type="email" 
                    autoComplete="username"
                    placeholder="dono@estabelecimento.com" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Senha inicial do dono</label>
                  <input 
                    required
                    type="password" 
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">O dono entra em «Sou parceiro» com este e-mail e esta senha.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 block">Endereço (opcional)</label>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">CEP</label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="00000-000"
                        maxLength={9}
                        className="w-full p-4 pr-12 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                        value={formData.postalCode}
                        onChange={(e) =>
                          setFormData({ ...formData, postalCode: formatCep(e.target.value) })
                        }
                        onBlur={() => {
                          void fetchAddressByCep();
                        }}
                      />
                      {loadingCep && (
                        <span
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                          aria-hidden
                        >
                          <i className="fas fa-spinner fa-spin" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Preenche o CEP e sai do campo para buscar rua, bairro e cidade (ViaCEP). Depois podes editar a linha abaixo e acrescentar número, complemento, etc.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Linha de endereço</label>
                    <input
                      type="text"
                      placeholder="Ex.: Rua das Flores, 100, Centro — São Paulo/SP — CEP 01310-100"
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Plano Mercado Pago (mensalidade)</label>
                  <select
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600 text-sm font-semibold text-gray-800"
                    value={formData.mercadoPagoPreapprovalPlanId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const opt = MP_PREAPPROVAL_PLAN_OPTIONS.find((o) => o.id === id);
                      setFormData({
                        ...formData,
                        mercadoPagoPreapprovalPlanId: id,
                        subscriptionAmount: opt ? opt.amountHint : formData.subscriptionAmount,
                      });
                    }}
                  >
                    {MP_PREAPPROVAL_PLAN_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    O dono da loja usa o botão «Assinar» na aba Saque para abrir o checkout deste plano no Mercado Pago.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Telefone (opcional)</label>
                    <input 
                      type="tel" 
                      inputMode="numeric"
                      placeholder="(11) 99999-9999" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Mensalidade (R$/mês)</label>
                    <input 
                      type="number" 
                      min={0}
                      step={1}
                      placeholder="99" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.subscriptionAmount}
                      onChange={e => setFormData({...formData, subscriptionAmount: Math.max(0, Number(e.target.value) || 99)})}
                    />
                    <p className="text-xs text-gray-400 mt-1">Valor de referência na plataforma (podes ajustar depois na tabela).</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Teste grátis</label>
                    <select
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.trialDays}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          trialDays: Number(e.target.value) === 30 ? 30 : 15,
                        })
                      }
                    >
                      <option value={15}>15 dias</option>
                      <option value={30}>30 dias</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Após o trial, a loja precisa pagar para seguir operando.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">% Split Asaas (produção)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.splitPercent}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          splitPercent: Math.max(0, Math.min(100, Math.floor(Number(e.target.value)) || 95)),
                        })
                      }
                    />
                    <p className="text-xs text-gray-400 mt-1">Percentual para a subconta quando o gateway está em produção.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">% Split Asaas (sandbox)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-amber-600"
                      value={formData.splitPercentSandbox}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          splitPercentSandbox: Math.max(0, Math.min(100, Math.floor(Number(e.target.value)) || 95)),
                        })
                      }
                    />
                    <p className="text-xs text-gray-400 mt-1">Usado quando a plataforma está em modo sandbox.</p>
                  </div>
                </div>

                <button 
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold mt-4 shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Cadastrar estabelecimento
                </button>
             </form>
            </div>
          </div>
        </div>
      )}

      {showRuntimeModeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-in">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Alternar ambiente de pagamento</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Atual: <strong>{runtimeMode === 'sandbox' ? 'Sandbox' : 'Produção'}</strong>. Próximo:{' '}
                  <strong>{runtimeMode === 'sandbox' ? 'Produção' : 'Sandbox'}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRuntimeModeModal(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-800 hover:bg-gray-100"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="mt-5 space-y-2">
              <p className="text-sm text-gray-700">
                Para confirmar, digite <span className="font-black">CONFIRMAR</span>.
              </p>
              <input
                type="text"
                value={runtimeConfirmInput}
                onChange={(e) => setRuntimeConfirmInput(e.target.value)}
                placeholder="Digite CONFIRMAR"
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRuntimeModeModal(false)}
                className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100"
                disabled={runtimeModeLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmToggleRuntimeMode}
                disabled={runtimeModeLoading || runtimeConfirmInput.trim() !== 'CONFIRMAR'}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"
              >
                {runtimeModeLoading ? 'Trocando...' : 'Confirmar troca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
