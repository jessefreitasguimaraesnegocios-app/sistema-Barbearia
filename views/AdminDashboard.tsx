
import React, { useState, useEffect } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import { APP_NAME } from '../lib/branding';
import { shopTypeAdminPillClass, shopTypeShortLabel } from '../lib/shopTypeDisplay';

type RuntimeMode = 'production' | 'sandbox';

async function adminAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

/** Evita SyntaxError quando o edge retorna HTML (500) em vez de JSON. */
async function parseSubscriptionPatchResponse(
  res: Response
): Promise<{ success: boolean; shop?: Shop; error?: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { success?: boolean; shop?: Shop; error?: string };
    return {
      success: data.success === true,
      shop: data.shop,
      error: typeof data.error === 'string' ? data.error : undefined,
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
};

function shopToFinancialDraft(shop: Shop): ShopFinancialDraft {
  return {
    subscriptionAmount: shop.subscriptionAmount ?? 99,
    splitPercent: shop.splitPercent ?? 95,
    splitPercentSandbox: shop.splitPercentSandbox ?? shop.splitPercent ?? 95,
    asaasPlatformSubscriptionId: shop.asaasPlatformSubscriptionId ?? '',
  };
}

function financialDraftDirty(shop: Shop, draft: ShopFinancialDraft): boolean {
  const o = shopToFinancialDraft(shop);
  return (
    draft.subscriptionAmount !== o.subscriptionAmount ||
    draft.splitPercent !== o.splitPercent ||
    draft.splitPercentSandbox !== o.splitPercentSandbox ||
    draft.asaasPlatformSubscriptionId.trim() !== o.asaasPlatformSubscriptionId.trim()
  );
}

interface AdminDashboardProps {
  shops: Shop[];
  setShops: (shops: Shop[]) => void;
  onShopCreated?: () => void | Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ shops, setShops, onShopCreated }) => {
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
    subscriptionAmount: 99,
    splitPercent: 95,
    splitPercentSandbox: 95,
  });

  const [financialDrafts, setFinancialDrafts] = useState<Record<string, ShopFinancialDraft>>({});
  const [savingFinancialShopId, setSavingFinancialShopId] = useState<string | null>(null);

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
        clearFinancialDraft(shop.id);
      } else {
        alert(data.error || 'Erro ao salvar alterações financeiras.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao salvar alterações.');
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
        alert('Sessão expirada. Faça login novamente para cadastrar parceiros.');
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
        splitPercent: Number.isFinite(sp) ? sp : 95,
        splitPercentSandbox: Number.isFinite(sps) ? sps : 95,
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
        alert(details ? `${msg}\n\nDetalhe: ${details.slice(0, 500)}${details.length > 500 ? '...' : ''}` : msg);
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
          subscriptionAmount: 99,
          splitPercent: 95,
          splitPercentSandbox: 95,
        });
        alert(
          'Estabelecimento cadastrado. O dono já pode entrar com o e-mail e a senha informados. Dados bancários e contas de recebimento cadastre no teu sistema externo.'
        );
      } else {
        const msg = data?.details || data?.error || 'Erro ao cadastrar barbearia.';
        alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } catch (error) {
      console.error('Error creating shop:', error);
      if ((error instanceof DOMException || error instanceof Error) && error.name === 'AbortError') {
        alert(
          'O cadastro passou do tempo limite (servidor ou rede lentos). Tenta outra vez; se repetir, confirma no Supabase se a função create-shop está deployada e vê os logs.'
        );
      } else {
        alert('Erro de conexão ao cadastrar barbearia.');
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
        clearFinancialDraft(shop.id);
      } else {
        alert(data.error || 'Erro ao atualizar assinatura.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao atualizar assinatura.');
    }
  };

  const activeRevenue = shops
    .filter(s => s.subscriptionActive)
    .reduce((sum, s) => sum + (s.subscriptionAmount ?? 99), 0);

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
        alert('CEP não encontrado.');
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
      alert('Erro ao buscar CEP. Tente novamente.');
    } finally {
      setLoadingCep(false);
    }
  };

  const deleteShop = async (shop: Shop) => {
    if (!window.confirm(`Excluir o estabelecimento "${shop.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}`, { method: 'DELETE', headers: await adminAuthHeaders() });
      const data = await response.json();
      if (data.success) {
        clearFinancialDraft(shop.id);
        setShops(shops.filter(s => s.id !== shop.id));
      } else {
        alert(data.error || 'Erro ao excluir estabelecimento.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao excluir estabelecimento.');
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
          alert(data.error || 'Não foi possível carregar o ambiente de pagamento.');
        }
        return;
      }
      setRuntimeMode(data.mode === 'sandbox' ? 'sandbox' : 'production');
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao carregar o ambiente de pagamento.');
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
        alert(data.error || 'Não foi possível trocar o ambiente de pagamento.');
        return;
      }
      setRuntimeMode(data.mode === 'sandbox' ? 'sandbox' : 'production');
      setShowRuntimeModeModal(false);
      setRuntimeConfirmInput('');
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao trocar o ambiente de pagamento.');
    } finally {
      setRuntimeModeLoading(false);
    }
  };

  React.useEffect(() => {
    void loadRuntimeMode();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-display font-bold text-gray-900">Portal do Administrador</h2>
          <p className="text-gray-500">Gerenciamento global da plataforma {APP_NAME}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide ${
              runtimeMode === 'sandbox' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}
            title="Ambiente atual usado pelos pagamentos e webhook Asaas"
          >
            {runtimeModeLoading ? 'Carregando...' : runtimeMode === 'sandbox' ? 'Sandbox ativo' : 'Produção ativa'}
          </div>
          <button
            type="button"
            onClick={requestToggleRuntimeMode}
            disabled={runtimeModeLoading}
            className="bg-slate-900 text-white px-4 py-3 rounded-2xl text-sm font-bold shadow-sm hover:bg-black transition-all disabled:opacity-60"
          >
            Alternar ambiente
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"
          >
            <i className="fas fa-plus"></i> Adicionar Parceiro
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Total de Parceiros</p>
          <p className="text-4xl font-black text-indigo-600">{shops.length}</p>
        </div>
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Assinaturas Ativas</p>
          <p className="text-4xl font-black text-green-500">{shops.filter(s => s.subscriptionActive).length}</p>
        </div>
        <div className="bg-white p-8 rounded-4xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">MRR Estimado</p>
          <p className="text-4xl font-black text-indigo-900">R$ {activeRevenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-4xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50">
          <h3 className="text-xl font-bold text-gray-900">Lista de Parceiros</h3>
          <p className="text-sm text-gray-500 mt-2">
            Mensalidade, splits e ID da assinatura Asaas só são gravados no banco ao clicar em{' '}
            <span className="font-semibold text-gray-700">Salvar</span> na linha do parceiro.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Estabelecimento</th>
                <th className="px-8 py-4">Tipo</th>
                <th className="px-8 py-4">Status Assinatura</th>
                <th className="px-8 py-4">Mensalidade</th>
                <th className="px-8 py-4">Assin. plataforma (Asaas)</th>
                <th className="px-8 py-4">% Split (produção)</th>
                <th className="px-8 py-4">% Split (sandbox)</th>
                <th className="px-8 py-4">Asaas ID</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shops.map((shop) => {
                const fd = getFinancialDraft(shop);
                const rowFinancialDirty = financialDraftDirty(shop, fd);
                return (
                <tr
                  key={shop.id}
                  className={`transition-colors ${rowFinancialDirty ? 'bg-amber-50/50' : 'hover:bg-gray-50'}`}
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
      </div>

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
                Cadastro enxuto: só o necessário para o estabelecimento e o acesso do dono. Dados bancários, PIX e contas de recebimento ficam no teu outro sistema.
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
