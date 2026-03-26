import type { CSSProperties } from 'react';

/** Cor de fallback alinhada ao indigo padrão do app */
export const DEFAULT_SHOP_PRIMARY = '#4f46e5';

export function normalizeShopPrimaryColor(input: string | undefined | null): string {
  if (input == null || !String(input).trim()) return DEFAULT_SHOP_PRIMARY;
  const s = String(input).trim();
  if (/^#[\da-fA-F]{3}$/.test(s)) return s;
  if (/^#[\da-fA-F]{6}$/.test(s)) return s;
  if (/^#[\da-fA-F]{8}$/.test(s)) return s;
  if (/^[\da-fA-F]{6}$/.test(s)) return `#${s}`;
  return DEFAULT_SHOP_PRIMARY;
}

export function shopPrimaryStyleVars(primary: string | undefined | null): CSSProperties {
  return {
    '--shop-primary': normalizeShopPrimaryColor(primary),
  } as CSSProperties;
}
