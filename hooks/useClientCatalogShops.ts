import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shop } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientCatalogEntry } from '../services/supabase/shops';
import {
  CLIENT_CATALOG_PAGE_SIZE,
  fetchClientCatalogPage,
  fetchClientCatalogUpdatedSince,
} from '../services/supabase/shops';
import {
  entriesToShops,
  mergeCatalogEntries,
  readClientCatalogCache,
  writeClientCatalogCache,
} from '../lib/clientCatalogCache';

const REALTIME_DEBOUNCE_MS = 450;

type UseClientCatalogShopsOptions = {
  client: SupabaseClient;
  /** Quando false, não hidrata nem subscreve realtime. */
  enabled: boolean;
};

/**
 * Catálogo público: pinta primeiro do localStorage, sincroniza com API em background
 * (páginas + incremental por `updated_at`) e mantém Realtime com debounce.
 */
export function useClientCatalogShops({ client, enabled }: UseClientCatalogShopsOptions) {
  const [shops, setShops] = useState<Shop[]>(() => entriesToShops(readClientCatalogCache()?.entries ?? []));
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let accumulated = mergeCatalogEntries([], cached?.entries ?? []);
    for (;;) {
      const page = await fetchClientCatalogPage(client, from, from + CLIENT_CATALOG_PAGE_SIZE - 1);
      accumulated = mergeCatalogEntries(accumulated, page);
      applyMergedEntries(accumulated);
      if (!page.length || page.length < CLIENT_CATALOG_PAGE_SIZE) break;
      from += CLIENT_CATALOG_PAGE_SIZE;
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
        scheduleFlush();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => scheduleFlush())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => scheduleFlush())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => scheduleFlush())
      .subscribe();

    return () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
      rtTimer.current = null;
      void client.removeChannel(channel);
    };
  }, [applyMergedEntries, client, enabled, syncFromNetwork]);

  return { shops, catalogRefreshing, refreshCatalog: syncFromNetwork };
}
