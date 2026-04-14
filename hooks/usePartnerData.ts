import { useState, useEffect, useCallback, useRef } from 'react';
import type { Appointment, ShopPartnerOrderRow } from '../types';
import { supabase } from '../src/lib/supabase';
import {
  appendPartnerOrdersRecentPage,
  loadPartnerShopActivity,
  fetchPartnerAppointments,
  PARTNER_ORDERS_RECENT_PAGE_SIZE,
  sortPartnerOrdersNewestFirst,
} from '../services/supabase/partnerShopActivity';
import { useRealtimeAppointments } from './useRealtimeAppointments';
import { useRealtimePartnerOrders } from './useRealtimePartnerOrders';

/** Agenda + pedidos da loja (parceiro), com filtro opcional por profissional (STAFF). */
export function usePartnerData(shopId: string | undefined, staffProfessionalId: string | undefined) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [shopPartnerOrderRows, setShopPartnerOrderRows] = useState<ShopPartnerOrderRow[]>([]);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const recentOrdersOffsetRef = useRef(0);

  useRealtimeAppointments({
    client: supabase,
    enabled: Boolean(shopId),
    channelName: `partner-appointments-${shopId ?? 'none'}-${staffProfessionalId ?? 'owner'}`,
    postgresChangesFilter: shopId ? `shop_id=eq.${shopId}` : '',
    sortMode: 'partner',
    setAppointments,
    staffProfessionalId: staffProfessionalId ?? undefined,
  });

  useRealtimePartnerOrders(supabase, shopId, setShopPartnerOrderRows);

  const reloadPartnerData = useCallback(async () => {
    if (!shopId) {
      setAppointments([]);
      setShopPartnerOrderRows([]);
      setOrdersHasMore(false);
      recentOrdersOffsetRef.current = 0;
      return;
    }
    const { appointments: nextApt, shopPartnerOrderRows: nextRows, ordersHasMore: more } =
      await loadPartnerShopActivity(supabase, shopId, staffProfessionalId);
    setAppointments(nextApt);
    setShopPartnerOrderRows(nextRows);
    setOrdersHasMore(more);
    /** Próxima página segue só o cursor da query por `created_at` (range), não o tamanho da lista fundida. */
    recentOrdersOffsetRef.current = PARTNER_ORDERS_RECENT_PAGE_SIZE;
  }, [shopId, staffProfessionalId]);

  const loadMorePartnerOrders = useCallback(async () => {
    if (!shopId || ordersLoadingMore || !ordersHasMore) return;
    setOrdersLoadingMore(true);
    const start = recentOrdersOffsetRef.current;
    try {
      const { rows, hasMore } = await appendPartnerOrdersRecentPage(
        supabase,
        shopId,
        start,
        start + PARTNER_ORDERS_RECENT_PAGE_SIZE - 1
      );
      recentOrdersOffsetRef.current += rows.length;
      setOrdersHasMore(hasMore);
      setShopPartnerOrderRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of rows) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            merged.push(r);
          }
        }
        return sortPartnerOrdersNewestFirst(merged);
      });
    } finally {
      setOrdersLoadingMore(false);
    }
  }, [shopId, ordersLoadingMore, ordersHasMore]);

  const reloadAppointmentsOnly = useCallback(async () => {
    if (!shopId) {
      setAppointments([]);
      return;
    }
    const next = await fetchPartnerAppointments(supabase, shopId, staffProfessionalId);
    setAppointments(next);
  }, [shopId, staffProfessionalId]);

  useEffect(() => {
    void reloadPartnerData();
  }, [reloadPartnerData]);

  return {
    appointments,
    shopPartnerOrderRows,
    ordersHasMore,
    ordersLoadingMore,
    loadMorePartnerOrders,
    reloadPartnerData,
    reloadAppointmentsOnly,
  };
}
