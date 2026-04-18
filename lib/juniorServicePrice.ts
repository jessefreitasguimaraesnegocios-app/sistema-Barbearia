import type { Professional } from '../types';

export function clampJuniorPricePercent(n: number): number {
  return Math.min(90, Math.max(50, Math.round(n)));
}

/**
 * Preço cobrado pelo serviço com o profissional escolhido (tabela × % júnior, ou integral).
 */
export function effectiveServicePriceForProfessional(
  tablePrice: number,
  professional: Pick<Professional, 'juniorPricePercent'> | null | undefined
): number {
  const base = Number(tablePrice);
  if (!Number.isFinite(base)) return 0;
  const j = professional?.juniorPricePercent;
  if (j == null || !Number.isFinite(j)) return Math.round(base * 100) / 100;
  const p = clampJuniorPricePercent(j);
  return Math.round(base * (p / 100) * 100) / 100;
}

export function juniorPricePercentFromDb(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 50 || n > 90) return null;
  return clampJuniorPricePercent(n);
}
