import React, { useState, useEffect, useCallback } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import { type BillingStatus, billingStatusLabel } from '../lib/shopBilling';
import { mercadoPagoSubscriptionCheckoutUrl } from '../lib/platformMercadoPagoPlans';

interface WalletTransaction {
  id: string;
  value: number;
  balance?: number;
  type: string;
  date: string;
  description?: string;
}

interface WalletData {
  success: boolean;
  balance: number;
  transactions: WalletTransaction[];
  error?: string;
}

const PIX_KEY_TYPES = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Chave aleatória' },
] as const;

function trimEnvString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const PLATFORM_SUB_CHECKOUT_URL = trimEnvString(import.meta.env.VITE_PLATFORM_SUBSCRIPTION_CHECKOUT_URL);
const PLATFORM_SUB_MANAGE_URL = trimEnvString(import.meta.env.VITE_PLATFORM_SUBSCRIPTION_MANAGE_URL);

function platformSubscriptionHrefEnvFallback(billingStatus: BillingStatus): string {
  if (billingStatus === 'active') {
    return PLATFORM_SUB_MANAGE_URL || PLATFORM_SUB_CHECKOUT_URL;
  }
  return PLATFORM_SUB_CHECKOUT_URL || PLATFORM_SUB_MANAGE_URL;
}

function partnerSubscriptionCheckoutHref(shop: Shop, billingStatus: BillingStatus): string {
  const planId = shop.mpPreapprovalPlanId?.trim();
  if (planId) return mercadoPagoSubscriptionCheckoutUrl(planId);
  return platformSubscriptionHrefEnvFallback(billingStatus);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatTransactionType(type: string): string {
  const known: Record<string, string> = {
    PAYMENT_RECEIVED: 'Cobrança recebida',
    TRANSFER: 'Transferência (saque)',
    TRANSFER_FEE: 'Taxa de transferência',
    TRANSFER_REVERSAL: 'Estorno de transferência',
    PIX_TRANSACTION_CREDIT: 'Pix recebido',
    PIX_TRANSACTION_DEBIT: 'Pix enviado',
    PAYMENT_FEE: 'Taxa de cobrança',
    INTERNAL_TRANSFER_CREDIT: 'Crédito interno',
    INTERNAL_TRANSFER_DEBIT: 'Débito interno',
    CREDIT: 'Crédito',
    DEBIT: 'Débito',
  };
  return known[type] || type.replace(/_/g, ' ').toLowerCase();
}

interface ShopWalletProps {
  shop: Shop;
  billingStatus: BillingStatus;
  monthlyAmount: number;
  remainingTrialDays: number;
  isStaff?: boolean;
}

const ShopWallet: React.FC<ShopWalletProps> = ({ shop, billingStatus, monthlyAmount, remainingTrialDays, isStaff = false }) => {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [useBankAccount, setUseBankAccount] = useState(false);
  const [value, setValue] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [bankOwner, setBankOwner] = useState('');
  const [bankCpfCnpj, setBankCpfCnpj] = useState('');
  const [bankAgency, setBankAgency] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankDigit, setBankDigit] = useState('');
  const [bankCode, setBankCode] = useState('001');

  const subscriptionHref = partnerSubscriptionCheckoutHref(shop, billingStatus);
  const hasSubscriptionLink = subscriptionHref.length > 0;

  const statusPillClass =
    billingStatus === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : billingStatus === 'trialing'
        ? 'bg-blue-100 text-blue-700'
        : billingStatus === 'past_due'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-red-100 text-red-700';
  const billingHint =
    billingStatus === 'active'
      ? 'Seu estabelecimento está em dia e com acesso completo.'
      : billingStatus === 'trialing'
        ? `Teste grátis ativo. Restam ${remainingTrialDays} dia(s) para contratar a mensalidade.`
        : billingStatus === 'past_due'
          ? 'A assinatura está atrasada. Regularize para evitar bloqueio.'
          : 'Assinatura bloqueada. Regularize para voltar a operar normalmente.';

  const subscribePrimaryClass =
    'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700';

  const BillingSection = isStaff ? null : (
    <section className="rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assinatura da plataforma</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">R$ {monthlyAmount.toFixed(2)}/mês</h3>
          <p className="mt-1 text-sm text-gray-600">{billingHint}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusPillClass}`}>
          {billingStatusLabel(billingStatus)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasSubscriptionLink ? (
          <a
            href={subscriptionHref}
            target="_blank"
            rel="noopener noreferrer"
            className={subscribePrimaryClass}
          >
            Assinar
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Peça ao administrador para vincular o plano Mercado Pago da loja ou configure as variáveis VITE_PLATFORM_SUBSCRIPTION_* no .env."
            className={`${subscribePrimaryClass} cursor-not-allowed opacity-60`}
          >
            Assinar
          </button>
        )}
      </div>
      {!hasSubscriptionLink && (
        <p className="mt-3 text-sm text-gray-500">
          O link de pagamento ainda não está disponível para esta loja. O administrador pode definir o plano Mercado
          Pago no cadastro da loja; como alternativa de desenvolvimento, use{' '}
          <span className="font-mono text-xs">VITE_PLATFORM_SUBSCRIPTION_CHECKOUT_URL</span> no .env.
        </p>
      )}
    </section>
  );

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError('Faça login novamente para ver seu saldo.');
        setLoading(false);
        return;
      }
      const res = await fetch(`${window.location.origin}/api/partner/wallet`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as WalletData & { error?: string };
      if (!res.ok) {
        setError(json?.error ?? 'Erro ao carregar. Tente novamente.');
        setLoading(false);
        return;
      }
      setData({
        success: json.success,
        balance: json.balance ?? 0,
        transactions: json.transactions ?? [],
        error: json.error,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);
    const normalized = value.replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const numValue = parseFloat(normalized) || 0;
    if (numValue <= 0) {
      setWithdrawError('Informe um valor válido.');
      return;
    }
    if (!useBankAccount && !pixKey.trim()) {
      setWithdrawError('Informe a chave PIX.');
      return;
    }
    if (useBankAccount && (!bankOwner.trim() || !bankCpfCnpj.trim() || !bankAgency.trim() || !bankAccount.trim() || !bankDigit.trim())) {
      setWithdrawError('Preencha todos os dados da conta bancária.');
      return;
    }
    if (data && numValue > data.balance) {
      setWithdrawError('Saldo insuficiente.');
      return;
    }

    setWithdrawLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setWithdrawError('Sessão expirada. Faça login novamente.');
        setWithdrawLoading(false);
        return;
      }
      const body: Record<string, unknown> = {
        value: numValue,
        operationType: 'PIX',
      };
      if (useBankAccount) {
        body.bankAccount = {
          ownerName: bankOwner.trim(),
          cpfCnpj: bankCpfCnpj.replace(/\D/g, ''),
          agency: bankAgency.replace(/\D/g, ''),
          account: bankAccount.replace(/\D/g, ''),
          accountDigit: bankDigit.replace(/\D/g, ''),
          bank: { code: bankCode || '001' },
          bankAccountType: 'CONTA_CORRENTE',
        };
        body.operationType = 'TED';
      } else {
        body.pixAddressKey = pixKey.trim();
        body.pixAddressKeyType = pixKeyType;
      }
      const res = await fetch(`${window.location.origin}/api/partner/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; transfer?: { id: string; status: string } };
      if (!res.ok) {
        setWithdrawError(json?.error ?? 'Erro ao solicitar saque. Tente novamente.');
        setWithdrawLoading(false);
        return;
      }
      setValue('');
      setPixKey('');
      await fetchWallet();
      setWithdrawLoading(false);
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : 'Erro ao solicitar saque.');
      setWithdrawLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4" />
        <p className="text-gray-500 font-medium">Carregando saldo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-20">
        {BillingSection}
        <h2 className="text-3xl font-display font-bold text-gray-900">Saque e saldo</h2>
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-6 flex items-start gap-3">
          <i className="fas fa-exclamation-circle text-red-500 mt-0.5" />
          <div>
            <p className="font-medium">{error}</p>
            <p className="text-sm mt-1">Verifique se sua conta de pagamentos está aprovada e a chave da subconta configurada. Em <strong>Minha Loja</strong>, use o aviso de aprovação da conta ou fale com o suporte.</p>
            <button type="button" onClick={fetchWallet} className="mt-3 text-sm font-semibold text-red-600 hover:underline">
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  const balance = data?.balance ?? 0;
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {BillingSection}

      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Saque e saldo</h2>
        <p className="text-gray-500 mt-1">
          Consulte seu saldo, solicite um saque para sua chave PIX ou conta bancária e acompanhe o histórico.
        </p>
      </header>

      {/* Saldo */}
      <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Saldo disponível</h3>
        <p className="text-4xl font-bold text-gray-900">{formatCurrency(balance)}</p>
        <p className="text-xs text-gray-400 mt-2">Valor disponível para saque na conta Asaas da sua loja.</p>
      </section>

      {/* Saque */}
      <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Solicitar saque</h3>
        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full max-w-xs px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseBankAccount(false)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${!useBankAccount ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Chave PIX
            </button>
            <button
              type="button"
              onClick={() => setUseBankAccount(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${useBankAccount ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Conta bancária
            </button>
          </div>

          {!useBankAccount ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo da chave PIX</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as typeof pixKeyType)}
                  className="w-full max-w-xs px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  {PIX_KEY_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chave PIX</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder={pixKeyType === 'EMAIL' ? 'email@exemplo.com' : pixKeyType === 'PHONE' ? '11999999999' : 'Digite a chave'}
                  className="w-full max-w-md px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titular</label>
                <input
                  type="text"
                  value={bankOwner}
                  onChange={(e) => setBankOwner(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ</label>
                <input
                  type="text"
                  value={bankCpfCnpj}
                  onChange={(e) => setBankCpfCnpj(e.target.value)}
                  placeholder="Somente números"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco (código)</label>
                <input
                  type="text"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="Ex: 001"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agência</label>
                <input
                  type="text"
                  value={bankAgency}
                  onChange={(e) => setBankAgency(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conta</label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dígito</label>
                <input
                  type="text"
                  value={bankDigit}
                  onChange={(e) => setBankDigit(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {withdrawError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-center gap-2">
              <i className="fas fa-exclamation-circle shrink-0" />
              {withdrawError}
            </div>
          )}

          <button
            type="submit"
            disabled={withdrawLoading || balance <= 0}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {withdrawLoading ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Processando...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane" />
                Sacar
              </>
            )}
          </button>
        </form>
      </section>

      {/* Histórico */}
      <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Histórico de movimentações</h3>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma movimentação no período.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-3 pr-4 font-semibold">Data</th>
                  <th className="pb-3 pr-4 font-semibold">Descrição</th>
                  <th className="pb-3 pr-4 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 text-gray-600">
                      {t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">
                      {t.description || formatTransactionType(t.type)}
                    </td>
                    <td className={`py-3 text-right font-medium ${t.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {t.value >= 0 ? '+' : ''}{formatCurrency(t.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">Últimos 30 dias. Saques podem levar até 48h para serem processados.</p>
      </section>
    </div>
  );
};

export default ShopWallet;
