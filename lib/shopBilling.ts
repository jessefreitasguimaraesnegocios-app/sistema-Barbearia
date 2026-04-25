import type { Shop } from '../types';

export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'blocked' | 'canceled';

const DAY_MS = 24 * 60 * 60 * 1000;

function asDateOrNull(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isTrialActive(shop: Pick<Shop, 'trialEndsAt'>): boolean {
  const trialEnd = asDateOrNull(shop.trialEndsAt);
  if (!trialEnd) return false;
  return Date.now() <= trialEnd.getTime();
}

export function trialDaysRemaining(shop: Pick<Shop, 'trialEndsAt'>): number {
  const trialEnd = asDateOrNull(shop.trialEndsAt);
  if (!trialEnd) return 0;
  const diffMs = trialEnd.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / DAY_MS);
}

export function resolveShopBillingStatus(
  shop: Pick<Shop, 'subscriptionActive' | 'billingStatus' | 'trialEndsAt'>
): BillingStatus {
  if (shop.subscriptionActive) return 'active';
  if (isTrialActive(shop)) return 'trialing';
  if (shop.billingStatus === 'past_due') return 'past_due';
  if (shop.billingStatus === 'canceled') return 'canceled';
  if (shop.billingStatus === 'blocked') return 'blocked';
  return 'blocked';
}

export function isShopAllowedToOperate(
  shop: Pick<Shop, 'subscriptionActive' | 'billingStatus' | 'trialEndsAt'>
): boolean {
  const status = resolveShopBillingStatus(shop);
  return status === 'active' || status === 'trialing';
}

export function billingStatusLabel(status: BillingStatus): string {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'trialing':
      return 'Em teste';
    case 'past_due':
      return 'Em atraso';
    case 'canceled':
      return 'Cancelada';
    case 'blocked':
    default:
      return 'Bloqueada';
  }
}
