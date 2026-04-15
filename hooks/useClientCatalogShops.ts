import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Shop } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientCatalogEntry } from '../services/supabase/shops';
import {
  CLIENT_CATALOG_PAGE_SIZE,
  fetchClientCatalogByShopIds,
  fetchClientCatalogPage,
  fetchClientCatalogUpdatedSince,
} from '../services/supabase/shops';
import {
  entriesToShops,
  mergeCatalogEntries,
  readClientCatalogCache,
  writeClientCatalogCache,
} from '../lib/clientCatalogCache';

/** Debounce após postgres_changes (lojas / catálogo); estoque em ShopDetails também tem canal dedicado. */
const REALTIME_DEBOUNCE_MS = 320;
/** Primeiro paint mais rápido quando cache está vazio (login/refresh frio). */
const CLIENT_CATALOG_FIRST_PAINT_PAGE_SIZE = 24;

type UseClientCatalogShopsOptions = {
  client: SupabaseClient;
  /** Quando false, não hidrata nem subscreve realtime. */
  enabled: boolean;
};

/**
 * Catálogo público: pinta primeiro do localStorage, sincroniza com API em background
 * (páginas + incremental por `updated_at`) e mantém Realtime com debounce.
 */
function addShopIdFromRealtimeRow(ref: MutableRefObject<Set<string>>, row: Record<string, unknown> | null | undefined) {
  const sid = row?.shop_id ?? row?.shopId;
  if (sid != null && String(sid).trim()) ref.current.add(String(sid));
}

export function useClientCatalogShops({ client, enabled }: UseClientCatalogShopsOptions) {
  const [shops, setShops] = useState<Shop[]>(() => entriesToShops(readClientCatalogCache()?.entries ?? []));
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lojas tocadas por Realtime; merge só com `updated_at > maxGlobal` perde mudanças se outra loja tem carimbo mais novo. */
  const pendingRealtimeShopIdsRef = useRef<Set<string>>(new Set());

  const applyMergedEntries = useCallback((merged: ClientCatalogEntry[]) => {
    writeClientCatalogCache(merged);
    setShops(entriesToShops(merged));
  }, []);

  const syncFromNetwork = useCallback(async () => {
    const cached = readClientCatalogCache();
    const since = cached?.maxRowUpdatedAt;

    if (since && since > '1970-01-01T00:00:00.001Z') {
      const incoming = await fetchClientCatalogUpdatedSince(client, since);
      if (!incoming.length) return;
      const merged = mergeCatalogEntries(cached?.entries ?? [], incoming);
      applyMergedEntries(merged);
      return;
    }

    let from = 0;
    let pageSize = cached?.entries?.length
      ? CLIENT_CATALOG_PAGE_SIZE
      : CLIENT_CATALOG_FIRST_PAINT_PAGE_SIZE;
    let accumulated = mergeCatalogEntries([], cached?.entries ?? []);
    for (;;) {
      const page = await fetchClientCatalogPage(client, from, from + pageSize - 1);
      accumulated = mergeCatalogEntries(accumulated, page);
      applyMergedEntries(accumulated);
      if (!page.length || page.length < pageSize) break;
      from += pageSize;
      /** Depois do primeiro lote, usa o tamanho normal para reduzir número de requests. */
      pageSize = CLIENT_CATALOG_PAGE_SIZE;
    }
  }, [applyMergedEntries, client]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setCatalogRefreshing(true);
    void (async () => {
      try {
        await syncFromNetwork();
      } catch {
        // Mantém cache em memória / localStorage
      } finally {
        if (!cancelled) setCatalogRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, syncFromNetwork]);

  useEffect(() => {
    if (!enabled) return;

    const flushRealtime = () => {
      void (async () => {
        try {
          const cached = readClientCatalogCache();
          const since = cached?.maxRowUpdatedAt;
          const pendingIds = [...pendingRealtimeShopIdsRef.current];
          pendingRealtimeShopIdsRef.current.clear();

          if (!cached?.entries?.length) {
            await syncFromNetwork();
            return;
          }

          let accumulated = mergeCatalogEntries([], cached.entries);
          let changed = false;

          if (since && since > '1970-01-01T00:00:00.001Z') {
            const incoming = await fetchClientCatalogUpdatedSince(client, since);
            if (incoming.length) {
              accumulated = mergeCatalogEntries(accumulated, incoming);
              changed = true;
            }
          }

          if (pendingIds.length) {
            const byIds = await fetchClientCatalogByShopIds(client, pendingIds);
            if (byIds.length) {
              accumulated = mergeCatalogEntries(accumulated, byIds);
              changed = true;
            }
          }

          if (changed) {
            applyMergedEntries(accumulated);
            return;
          }

          await syncFromNetwork();
        } catch {
          /* noop */
        }
      })();
    };

    const scheduleFlush = () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
      rtTimer.current = setTimeout(() => {
        rtTimer.current = null;
        flushRealtime();
      }, REALTIME_DEBOUNCE_MS);
    };

    const onShopDelete = (payload: { old?: Record<string, unknown> }) => {
      const raw = payload.old?.id;
      if (raw == null) return;
      const id = String(raw);
      const cached = readClientCatalogCache();
      if (!cached?.entries.length) {
        setShops((prev) => prev.filter((s) => s.id !== id));
        return;
      }
      const nextEntries = cached.entries.filter((e) => e.shop.id !== id);
      applyMergedEntries(nextEntries);
    };

    const channel = client
      .channel('client-catalog-shops')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'shops' }, (p) => onShopDelete(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, (p) => {
        if (p.eventType === 'DELETE') return;
        const row = (p.new ?? p.old) as Record<string, unknown> | undefined;
        if (row?.id != null) pendingRealtimeShopIdsRef.current.add(String(row.id));
        scheduleFlush();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, (p) => {
        addShopIdFromRealtimeRow(pendingRealtimeShopIdsRef, (p.new ?? p.old) as Record<string, unknown> | undefined);
        scheduleFlush();
      })
      .subscribe();

    return () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
      rtTimer.current = null;
      void client.removeChannel(channel);
    };
  }, [applyMergedEntries, client, enabled, syncFromNetwork]);

  return { shops, catalogRefreshing, refreshCatalog: syncFromNetwork };
}
