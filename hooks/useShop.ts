import { useState, useEffect, useCallback, useRef } from 'react';
import type { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import {
  fetchPartnerShopBundle,
  fetchPartnerProductsForShop,
  fetchPartnerProfessionalsForShop,
  fetchPartnerServicesForShop,
  fetchPartnerShopRowOnly,
} from '../services/supabase/shops';
import { mergePartnerShopScalarRow } from '../services/supabase/mapPartnerShop';

/** Debounce: um único `postgres_changes` em `shops` cobre catálogo filho (trigger em `updated_at`). */
const SHOP_CATALOG_RT_DEBOUNCE_MS = 280;

/** Loja única do parceiro (dono/equipe): bundle shops + services + professionals + products. */
export function useShop(shopId: string | undefined, reloadKey = 0) {
  const [shop, setShop] = useState<Shop | null>(null);
  const shopRef = useRef<Shop | null>(null);
  shopRef.current = shop;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadShop = useCallback(async () => {
    if (!shopId) {
      setShop(null);
      return;
    }
    const res = await fetchPartnerShopBundle(supabase, shopId);
    setShop(res.ok ? res.shop : null);
  }, [shopId]);

  useEffect(() => {
    void reloadShop();
  }, [shopId, reloadKey, reloadShop]);

  useEffect(() => {
    if (!shopId) return;

    const flushCatalogFromShopPulse = () => {
      void (async () => {
        const prev = shopRef.current;
        if (!prev) {
          const res = await fetchPartnerShopBundle(supabase, shopId);
          if (res.ok) setShop(res.shop);
          return;
        }
        const row = await fetchPartnerShopRowOnly(supabase, shopId);
        const split = prev.splitPercent ?? 95;
        const [services, professionals, products] = await Promise.all([
          fetchPartnerServicesForShop(supabase, shopId),
          fetchPartnerProfessionalsForShop(supabase, shopId, split),
          fetchPartnerProductsForShop(supabase, shopId),
        ]);
        let next = prev;
        if (row) next = mergePartnerShopScalarRow(next, row);
        setShop({ ...next, services, professionals, products });
      })();
    };

    const scheduleFlush = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        flushCatalogFromShopPulse();
      }, SHOP_CATALOG_RT_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`shop-bundle-rt-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shopId}` },
        () => {
          scheduleFlush();
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [shopId]);

  return { shop, setShop, reloadShop };
}
