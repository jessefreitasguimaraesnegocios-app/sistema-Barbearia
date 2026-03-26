/** Dados mínimos da API GET /api/partner/onboarding para decidir se o painel deve lembrar o parceiro. */

export interface PartnerOnboardingAccountStatus {
  general: string;
  documentation: string;
}

export interface PartnerOnboardingDocument {
  onboardingUrl?: string;
}

export function shouldShowPartnerOnboardingBanner(payload: {
  accountStatus: PartnerOnboardingAccountStatus | null;
  documents: PartnerOnboardingDocument[];
  /** Campo `error` em respostas 200 com success (ex.: chave subconta, loja sem wallet) */
  apiMessage?: string;
}): boolean {
  const msg = payload.apiMessage?.trim();
  if (msg) return true;

  const hasLink = payload.documents.some((d) => d.onboardingUrl);
  if (hasLink) return true;

  if (payload.documents.length > 0 && !hasLink) return true;

  const st = payload.accountStatus;
  if (!st) return false;

  if (st.general !== 'APPROVED') return true;
  if (st.documentation !== 'APPROVED') return true;

  return false;
}
