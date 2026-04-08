export type AsaasRuntimeMode = 'production' | 'sandbox';

/**
 * Em sandbox usa split_percent_sandbox quando definido; senão split_percent.
 * Em produção usa apenas split_percent.
 */
export function resolveShopSplitPercent(
  mode: AsaasRuntimeMode,
  shop: { split_percent?: unknown; split_percent_sandbox?: unknown }
): number {
  const prod = shop.split_percent != null ? Number(shop.split_percent) : NaN;
  const sand = shop.split_percent_sandbox != null ? Number(shop.split_percent_sandbox) : NaN;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  if (mode === 'sandbox') {
    if (!Number.isNaN(sand)) return clamp(sand);
    if (!Number.isNaN(prod)) return clamp(prod);
    return 95;
  }
  if (!Number.isNaN(prod)) return clamp(prod);
  return 95;
}
