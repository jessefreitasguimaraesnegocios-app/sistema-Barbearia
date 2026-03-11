import React, { useState, useEffect, useCallback } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';

interface AccountStatus {
  general: string;
  documentation: string;
  commercialInfo: string;
  bankAccountInfo: string;
}

interface OnboardingDocument {
  id: string;
  title: string;
  description?: string;
  status?: string;
  onboardingUrl?: string;
}

interface OnboardingData {
  success: boolean;
  accountStatus: AccountStatus | null;
  documents: OnboardingDocument[];
  error?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  AWAITING_APPROVAL: 'Em análise',
};

interface ShopOnboardingProps {
  shop: Shop;
}

const ShopOnboarding: React.FC<ShopOnboardingProps> = ({ shop }) => {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchOnboarding = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError('Faça login novamente para ver os documentos.');
        setLoading(false);
        return;
      }
      const res = await fetch(`${window.location.origin}/api/partner/onboarding`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as OnboardingData & { error?: string };
      if (!res.ok) {
        setError(json?.error ?? 'Erro ao carregar. Tente novamente.');
        setLoading(false);
        return;
      }
      setData({
        success: json.success,
        accountStatus: json.accountStatus ?? null,
        documents: json.documents ?? [],
        error: json.error,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnboarding();
  }, [fetchOnboarding]);

  const copyLink = (url: string, docId: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedId(docId);
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => alert('Não foi possível copiar. Copie manualmente.')
    );
  };

  const shareWhatsApp = (url: string, title: string) => {
    const text = encodeURIComponent(
      `Olá! Preciso enviar meus documentos para aprovação da conta de pagamentos.\n\n${title}\nLink: ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4" />
        <p className="text-gray-500 font-medium">Carregando dados da sua conta...</p>
      </div>
    );
  }

  const status = data?.accountStatus;
  const documents = data?.documents ?? [];
  const hasLink = documents.some((d) => d.onboardingUrl);
  const generalLabel = status ? STATUS_LABEL[status.general] ?? status.general : '—';

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Documentos e aprovação</h2>
        <p className="text-gray-500 mt-1">
          Envie os documentos da sua loja para liberar o recebimento de pagamentos.
        </p>
      </header>

      {data?.error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <i className="fas fa-info-circle text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{data.error}</p>
            <p className="text-xs text-amber-700 mt-2">
              Se você já habilitou o &quot;Gerenciamento de Chaves de API de Subcontas&quot; no Asaas, confira se o IP do servidor está na Whitelist de IP (Integrações → Mecanismos de Segurança). Depois clique em &quot;Tentar gerar link&quot;.
            </p>
            <button
              type="button"
              onClick={() => fetchOnboarding()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-sm font-semibold transition-colors"
            >
              <i className="fas fa-sync-alt" />
              Tentar gerar link
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3">
          <i className="fas fa-exclamation-circle text-red-500 mt-0.5" />
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchOnboarding}
            className="ml-auto text-sm font-semibold text-red-600 hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {status && (
        <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Status da conta</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-gray-600 font-medium">Aprovação geral</span>
              <span
                className={`font-bold ${
                  status.general === 'APPROVED'
                    ? 'text-green-600'
                    : status.general === 'REJECTED'
                    ? 'text-red-600'
                    : 'text-amber-600'
                }`}
              >
                {generalLabel}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-gray-600 font-medium">Documentação</span>
              <span className="font-bold text-gray-800">
                {STATUS_LABEL[status.documentation] ?? status.documentation}
              </span>
            </div>
          </div>
          {status.general === 'APPROVED' && (
            <p className="mt-4 text-sm text-green-600 font-medium flex items-center gap-2">
              <i className="fas fa-check-circle" />
              Sua conta está aprovada. Você já pode receber pagamentos.
            </p>
          )}
        </section>
      )}

      {hasLink && (
        <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Enviar documentos</h3>
          <p className="text-gray-500 text-sm mb-6">
            Clique no botão abaixo para abrir o link seguro e enviar seus documentos (RG/CNH, selfie etc.).
            Você também pode copiar o link ou enviar por WhatsApp.
          </p>
          <ul className="space-y-4">
            {documents
              .filter((d) => d.onboardingUrl)
              .map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{doc.title}</p>
                    {doc.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={doc.onboardingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      <i className="fas fa-external-link-alt" />
                      Enviar documentos
                    </a>
                    <button
                      type="button"
                      onClick={() => copyLink(doc.onboardingUrl!, doc.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      {copiedId === doc.id ? (
                        <>
                          <i className="fas fa-check text-green-500" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <i className="fas fa-copy" />
                          Copiar link
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => shareWhatsApp(doc.onboardingUrl!, doc.title)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#20bd5a] transition-colors"
                    >
                      <i className="fab fa-whatsapp text-lg" />
                      Enviar por WhatsApp
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {!loading && !error && data && !hasLink && documents.length === 0 && !data.error && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-gray-500">
          <i className="fas fa-file-alt text-4xl mb-3 opacity-50" />
          <p>Nenhum documento pendente no momento.</p>
          <button
            type="button"
            onClick={fetchOnboarding}
            className="mt-3 text-sm text-indigo-600 font-semibold hover:underline"
          >
            Atualizar
          </button>
        </div>
      )}

      {!loading && data && (hasLink || status) && (
        <p className="text-xs text-gray-400">
          Após enviar os documentos, a análise pode levar até 48 horas. Você será notificado quando
          a conta for aprovada.
        </p>
      )}
    </div>
  );
};

export default ShopOnboarding;
