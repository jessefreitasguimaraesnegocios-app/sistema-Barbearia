export function formatDbTime(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).slice(0, 5);
}

export function normalizeSplitPercent(value: unknown, fallback = 95): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}
