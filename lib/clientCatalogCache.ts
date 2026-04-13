import type { Shop } from '../types';
import type { ClientCatalogEntry } from '../services/supabase/shops';

export const CLIENT_CATALOG_CACHE_STORAGE_KEY = 'barbeariaHub:clientCatalog:v2';

export type { ClientCatalogEntry };

export type PersistedClientCatalog = {
  v: 2;
  savedAt: string;
  maxRowUpdatedAt: string;
  entries: ClientCatalogEntry[];
};

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

export function computeMaxRowUpdatedAt(entries: ClientCatalogEntry[]): string {
  return entries.reduce((m, e) => maxIso(m, e.rowUpdatedAt), '1970-01-01T00:00:00.000Z');
}

/** Mescla por id da loja; ordena nome para lista estável na UI. */
export function mergeCatalogEntries(existing: ClientCatalogEntry[], incoming: ClientCatalogEntry[]): ClientCatalogEntry[] {
  const map = new Map<string, ClientCatalogEntry>();
  for (const e of existing) map.set(e.shop.id, e);
  for (const e of incoming) map.set(e.shop.id, e);
  return Array.from(map.values()).sort((a, b) => a.shop.name.localeCompare(b.shop.name, 'pt-BR', { sensitivity: 'base' }));
}

export function entriesToShops(entries: ClientCatalogEntry[]): Shop[] {
  return entries.map((e) => e.shop);
}

export function readClientCatalogCache(): PersistedClientCatalog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_CATALOG_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedClientCatalog>;
    if (parsed.v !== 2 || !Array.isArray(parsed.entries)) return null;
    return {
      v: 2,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      maxRowUpdatedAt:
        typeof parsed.maxRowUpdatedAt === 'string' ? parsed.maxRowUpdatedAt : computeMaxRowUpdatedAt(parsed.entries),
      entries: parsed.entries,
    };
  } catch {
    return null;
  }
}

export function writeClientCatalogCache(entries: ClientCatalogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedClientCatalog = {
      v: 2,
      savedAt: new Date().toISOString(),
      maxRowUpdatedAt: computeMaxRowUpdatedAt(entries),
      entries,
    };
    window.localStorage.setItem(CLIENT_CATALOG_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded ou modo privado — ignora; a UI continua com dados em memória
  }
}
