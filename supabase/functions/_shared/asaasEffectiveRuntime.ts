/** Same semantics as `lib/payments/resolve-shop-split.ts` (Edge bundle cannot import repo lib). */

export type AsaasRuntimeModeEdge = "production" | "sandbox";

export function asaasRuntimeModeFromPlatformRow(
  data: { asaas_mode?: string } | null | undefined,
): AsaasRuntimeModeEdge {
  return data?.asaas_mode === "sandbox" ? "sandbox" : "production";
}

export function parseShopAsaasRuntimeOverride(raw: unknown): AsaasRuntimeModeEdge | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "sandbox") return "sandbox";
  if (s === "production") return "production";
  return null;
}

export function resolveEffectiveAsaasRuntimeMode(
  platformMode: AsaasRuntimeModeEdge,
  shopOverride: AsaasRuntimeModeEdge | null,
): AsaasRuntimeModeEdge {
  return shopOverride ?? platformMode;
}
