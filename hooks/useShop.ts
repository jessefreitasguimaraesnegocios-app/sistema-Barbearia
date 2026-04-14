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

/** Loja única do parceiro (dono/equipe): bundle shops + services + professionals + products. */
export function useShop(shopId: string | undefined, reloadKey = 0) {
  const [shop, setShop] = useState<Shop | null>(null);
  const shopRef = useRef<Shop | null>(null);
  shopRef.current = shop;

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

    const channel = supabase
      .channel(`shop-bundle-rt-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shopId}` },
        () => {
          void (async () => {
            const row = await fetchPartnerShopRowOnly(supabase, shopId);
            if (row) setShop((prev) => (prev ? mergePartnerShopScalarRow(prev, row) : prev));
          })();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services', filter: `shop_id=eq.${shopId}` },
        () => {
          void (async () => {
            const services = await fetchPartnerServicesForShop(supabase, shopId);
            setShop((prev) => (prev ? { ...prev, services } : prev));
          })();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professionals', filter: `shop_id=eq.${shopId}` },
        () => {
          void (async () => {
            const split = shopRef.current?.splitPercent ?? 95;
            const professionals = await fetchPartnerProfessionalsForShop(supabase, shopId, split);
            setShop((prev) => (prev ? { ...prev, professionals } : prev));
          })();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `shop_id=eq.${shopId}` },
        () => {
          void (async () => {
            const products = await fetchPartnerProductsForShop(supabase, shopId);
            setShop((prev) => (prev ? { ...prev, products } : prev));
          })();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shopId]);

  return { shop, setShop, reloadShop };
}
