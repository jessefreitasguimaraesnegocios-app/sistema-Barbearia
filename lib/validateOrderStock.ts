import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderLineItem = { productId: string; quantity: number };

/**
 * Garante estoque suficiente por produto (soma quantidades no pedido).
 * Usado antes de criar cobrança Asaas (create-payment / API).
 */
export async function validateOrderLineItemsStock(
  client: SupabaseClient,
  shopId: string,
  items: OrderLineItem[]
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const byPid = new Map<string, number>();
  for (const it of items) {
    const pid = String(it.productId ?? '').trim();
    const q = Math.max(0, Math.floor(Number(it.quantity) || 0));
    if (!pid || q <= 0) continue;
    byPid.set(pid, (byPid.get(pid) || 0) + q);
  }
  if (byPid.size === 0) {
    return { ok: false, status: 400, error: 'Pedido sem itens válidos.' };
  }
  const ids = [...byPid.keys()];
  const { data: rows, error } = await client.from('products').select('id, stock').in('id', ids).eq('shop_id', shopId);
  if (error) {
    return { ok: false, status: 500, error: 'Falha ao validar estoque. Tente novamente.' };
  }
  const stockMap = new Map<string, number>(
    (rows || []).map((r: { id: string; stock?: number | null }) => [String(r.id), Math.max(0, Number(r.stock) || 0)])
  );
  for (const [pid, need] of byPid) {
    if (!stockMap.has(pid)) {
      return { ok: false, status: 400, error: 'Um ou mais produtos não pertencem a esta loja.' };
    }
    const avail = stockMap.get(pid)!;
    if (avail < need) {
      return {
        ok: false,
        status: 409,
        error: 'Estoque insuficiente para um ou mais itens. Atualize o carrinho e tente novamente.',
      };
    }
  }
  return { ok: true };
}
