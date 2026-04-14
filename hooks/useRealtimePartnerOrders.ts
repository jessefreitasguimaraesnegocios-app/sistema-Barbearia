import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShopPartnerOrderRow } from '../types';
import {
  mapDbRowToShopPartnerOrderRow,
  sortPartnerOrdersNewestFirst,
} from '../services/supabase/partnerShopActivity';

async function fetchProfileAndMergeOrderRow(
  client: SupabaseClient,
  raw: Record<string, unknown>,
  setShopPartnerOrderRows: Dispatch<SetStateAction<ShopPartnerOrderRow[]>>
): Promise<void> {
  const clientId = String(raw.client_id ?? '');
  if (!clientId) return;
  const { data } = await client.from('profiles').select('full_name, avatar_url').eq('id', clientId).maybeSingle();
  const prof = data as { full_name?: string | null; avatar_url?: string | null } | null;
  setShopPartnerOrderRows((prev) =>
    sortPartnerOrdersNewestFirst(
      prev.map((r) => (r.id === String(raw.id) ? mapDbRowToShopPartnerOrderRow(raw, prof) : r))
    )
  );
}

/**
 * Realtime em `public.orders` da loja: merge local (sem refetch da lista inteira).
 * Perfil do cliente: reutiliza nomes já em memória; caso novo, um GET mínimo a `profiles`.
 */
export function useRealtimePartnerOrders(
  client: SupabaseClient,
  shopId: string | undefined,
  setShopPartnerOrderRows: Dispatch<SetStateAction<ShopPartnerOrderRow[]>>
): void {
  useEffect(() => {
    if (!shopId) return;

    const channel = client
      .channel(`partner-orders-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shopId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Record<string, unknown> | undefined;
            const id = oldRow?.id != null ? String(oldRow.id) : '';
            if (!id) return;
            setShopPartnerOrderRows((old) => old.filter((x) => x.id !== id));
            return;
          }

          const rawNew = payload.new as Record<string, unknown> | undefined;
          if (!rawNew || rawNew.id == null) return;
          if (String(rawNew.shop_id) !== shopId) return;

          const nextBase = mapDbRowToShopPartnerOrderRow(rawNew, null);

          if (payload.eventType === 'INSERT') {
            setShopPartnerOrderRows((old) => {
              const existingSame = old.find((x) => x.id === nextBase.id);
              if (existingSame) {
                return sortPartnerOrdersNewestFirst(
                  old.map((x) =>
                    x.id === nextBase.id
                      ? {
                          ...nextBase,
                          clientDisplayName: existingSame.clientDisplayName,
                          clientAvatarUrl: existingSame.clientAvatarUrl,
                        }
                      : x
                  )
                );
              }
              const reuse = old.find((x) => x.clientId === nextBase.clientId);
              const withLabel: ShopPartnerOrderRow = reuse
                ? {
                    ...nextBase,
                    clientDisplayName: reuse.clientDisplayName,
                    clientAvatarUrl: reuse.clientAvatarUrl,
                  }
                : nextBase;
              const merged = sortPartnerOrdersNewestFirst([...old.filter((x) => x.id !== withLabel.id), withLabel]);
              if (!reuse) void fetchProfileAndMergeOrderRow(client, rawNew, setShopPartnerOrderRows);
              return merged;
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setShopPartnerOrderRows((old) => {
              const id = nextBase.id;
              const prevRow = old.find((x) => x.id === id);
              const sameClient = prevRow && prevRow.clientId === nextBase.clientId;
              const next: ShopPartnerOrderRow =
                sameClient && prevRow
                  ? {
                      ...nextBase,
                      clientDisplayName: prevRow.clientDisplayName,
                      clientAvatarUrl: prevRow.clientAvatarUrl,
                    }
                  : nextBase;
              const idx = old.findIndex((x) => x.id === id);
              if (idx === -1) {
                const merged = sortPartnerOrdersNewestFirst([...old, next]);
                if (!sameClient) void fetchProfileAndMergeOrderRow(client, rawNew, setShopPartnerOrderRows);
                return merged;
              }
              const copy = [...old];
              copy[idx] = next;
              if (!sameClient) void fetchProfileAndMergeOrderRow(client, rawNew, setShopPartnerOrderRows);
              return sortPartnerOrdersNewestFirst(copy);
            });
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, shopId, setShopPartnerOrderRows]);
}
