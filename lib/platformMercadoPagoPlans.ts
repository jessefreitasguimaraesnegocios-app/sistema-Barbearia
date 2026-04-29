/** IDs dos planos de assinatura (Mercado Pago) — checkout da mensalidade da plataforma. */
export const MP_PREAPPROVAL_PLAN_299_99 = '6711928bd21d4f3fb587c38925eef5ab';
export const MP_PREAPPROVAL_PLAN_159_99 = '4e35683f6b69425c93785bf3db667517';

export const MP_PREAPPROVAL_PLAN_IDS = [MP_PREAPPROVAL_PLAN_299_99, MP_PREAPPROVAL_PLAN_159_99] as const;

export type MpPreapprovalPlanId = (typeof MP_PREAPPROVAL_PLAN_IDS)[number];

export const MP_PREAPPROVAL_PLAN_OPTIONS: ReadonlyArray<{ id: MpPreapprovalPlanId; label: string; amountHint: number }> = [
  { id: MP_PREAPPROVAL_PLAN_299_99, label: 'Mensalidade R$ 299,99 (Mercado Pago)', amountHint: 299.99 },
  { id: MP_PREAPPROVAL_PLAN_159_99, label: 'Mensalidade R$ 159,99 (Mercado Pago)', amountHint: 159.99 },
];

export function isAllowedMpPreapprovalPlanId(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const t = raw.trim();
  return (MP_PREAPPROVAL_PLAN_IDS as readonly string[]).includes(t);
}

export function mercadoPagoSubscriptionCheckoutUrl(planId: string): string {
  const id = planId.trim();
  return `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${encodeURIComponent(id)}`;
}
