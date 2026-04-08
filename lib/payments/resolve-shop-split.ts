export type AsaasRuntimeMode = 'production' | 'sandbox';

function clampSplit(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * Resolve % split para uma linha (loja ou profissional) conforme o runtime.
 * Se profissional sem valores definidos, use como fallback o split já resolvido da loja.
 */
export function resolveSplitPercentForRuntime(
  mode: AsaasRuntimeMode,
  row: { split_percent?: unknown; split_percent_sandbox?: unknown },
  fallbackPercent: number
): number {
  const prod = row.split_percent != null ? Number(row.split_percent) : NaN;
  const sand = row.split_percent_sandbox != null ? Number(row.split_percent_sandbox) : NaN;

  if (mode === 'sandbox') {
    if (!Number.isNaN(sand)) return clampSplit(sand);
    if (!Number.isNaN(prod)) return clampSplit(prod);
    return clampSplit(fallbackPercent);
  }
  if (!Number.isNaN(prod)) return clampSplit(prod);
  return clampSplit(fallbackPercent);
}

/**
 * Loja: fallback final 95 se não houver colunas preenchidas.
 */
export function resolveShopSplitPercent(
  mode: AsaasRuntimeMode,
  shop: { split_percent?: unknown; split_percent_sandbox?: unknown }
): number {
  return resolveSplitPercentForRuntime(mode, shop, 95);
}
