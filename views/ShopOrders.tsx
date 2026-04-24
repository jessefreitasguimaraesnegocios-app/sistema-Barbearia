import React, { useEffect, useMemo, useState } from 'react';
import { Shop, ShopPartnerOrderRow, type ShopOrderHandoverItemSnapshot } from '../types';

interface ShopOrdersProps {
  shop: Shop;
  orders: ShopPartnerOrderRow[];
  onMarkDelivered: (orderId: string) => Promise<void>;
  /** Paginação da lista por `created_at` (histórico além da primeira página). */
  ordersHasMore?: boolean;
  ordersLoadingMore?: boolean;
  onLoadMoreOrders?: () => void | Promise<void>;
}

function formatOrderWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatHandoverDetail(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Histórico “do dia”: mesma data local que `now` (zera visualmente à meia-noite). */
function isSameLocalCalendarDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function lineItemsForHistory(
  order: ShopPartnerOrderRow,
  shop: Shop
): { label: string; qty: number; lineTotal: number }[] {
  const snap = order.handedOverItemsSnapshot;
  if (snap?.length) {
    return snap.map((it: ShopOrderHandoverItemSnapshot) => ({
      label: it.name?.trim() || 'Produto',
      qty: it.quantity,
      lineTotal: it.price * it.quantity,
    }));
  }
  return order.items.map((it) => {
    const name = shop.products.find((p) => p.id === it.productId)?.name ?? 'Produto';
    return { label: name, qty: it.quantity, lineTotal: it.price * it.quantity };
  });
}

const ShopOrders: React.FC<ShopOrdersProps> = ({
  shop,
  orders,
  onMarkDelivered,
  ordersHasMore = false,
  ordersLoadingMore = false,
  onLoadMoreOrders,
}) => {
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [dayTick, setDayTick] = useState(0);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setDayTick((n) => n + 1), 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') setDayTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const now = useMemo(() => new Date(), [dayTick]);

  const paidOrders = useMemo(
    () => orders.filter((o) => o.status === 'PAID').sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [orders]
  );

  const handoverHistoryToday = useMemo(() => {
    return orders
      .filter(
        (o) =>
          o.status === 'DELIVERED' &&
          o.handedOverAtIso &&
          isSameLocalCalendarDay(o.handedOverAtIso, now)
      )
      .sort((a, b) => (b.handedOverAtIso ?? '').localeCompare(a.handedOverAtIso ?? ''));
  }, [orders, now]);

  const handleDelivered = async (orderId: string) => {
    const confirmed = window.confirm(
      'Confirmar retirada?\n\nAo confirmar, o pedido será marcado como retirado pelo cliente.'
    );
    if (!confirmed) return;
    setDeliveringId(orderId);
    try {
      await onMarkDelivered(orderId);
    } finally {
      setDeliveringId(null);
    }
  };

  const toggleHistory = (id: string) => {
    setOpenHistoryId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-8 animate-fade-in pb-24">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Pedidos da lojinha</h2>
        <p className="text-gray-500 mt-1">
          Apenas pedidos <strong>já pagos</strong> aparecem aqui. Marque quando o cliente retirar na loja.
        </p>
      </header>

      {paidOrders.length === 0 ? (
        <div className="bg-white rounded-4xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-200 text-4xl mb-4">
            <i className="fas fa-shopping-bag" />
          </div>
          <p className="text-gray-600 font-medium">Nenhum pedido aguardando retirada.</p>
          <p className="text-sm text-gray-400 mt-2">Quando um cliente pagar na lojinha, o pedido aparece aqui.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {paidOrders.map((order) => {
            const busy = deliveringId === order.id;
            return (
              <li
                key={order.id}
                className="bg-white rounded-4xl border border-gray-100 shadow-sm p-5 md:p-6 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <img
                    src={
                      order.clientAvatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(order.clientDisplayName)}&background=random`
                    }
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <h3 className="text-lg font-bold text-gray-900">{order.clientDisplayName}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">
                        Pago
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatOrderWhen(order.createdAtIso)}</p>
                    <ul className="mt-3 space-y-2">
                      {order.items.map((it, idx) => {
                        const product = shop.products.find((p) => p.id === it.productId);
                        const name = product?.name ?? 'Produto';
                        return (
                          <li
                            key={`${order.id}-${it.productId}-${idx}`}
                            className="flex justify-between text-sm text-gray-700 gap-3"
                          >
                            <span>
                              <span className="font-semibold text-gray-900">{name}</span>
                              <span className="text-gray-400"> × {it.quantity}</span>
                            </span>
                            <span className="font-medium text-indigo-600 whitespace-nowrap">
                              R$ {(it.price * it.quantity).toFixed(2).replace('.', ',')}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 pt-3 border-t border-gray-100 text-right text-sm">
                      <span className="text-gray-500">Total </span>
                      <span className="text-lg font-black text-gray-900">
                        R$ {order.total.toFixed(2).replace('.', ',')}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelivered(order.id)}
                  className="w-full py-4 rounded-2xl font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                >
                  {busy ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      Confirmando…
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle" />
                      Pedido retirado pelo cliente
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ordersHasMore && onLoadMoreOrders ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={ordersLoadingMore}
            onClick={() => void onLoadMoreOrders()}
            className="px-6 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {ordersLoadingMore ? 'Carregando…' : 'Carregar mais pedidos (histórico)'}
          </button>
        </div>
      ) : null}

      <section className="bg-white rounded-4xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Histórico de retiradas (hoje)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Quem liberou o pedido e o resumo no momento da confirmação. A lista considera só retiradas marcadas{' '}
              <strong>hoje</strong> (meia-noite local zera o painel).
            </p>
          </div>
        </div>

        {handoverHistoryToday.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            Ainda não há retiradas registadas hoje. Ao confirmar &quot;Pedido retirado&quot;, o registo aparece aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {handoverHistoryToday.map((order) => {
              const open = openHistoryId === order.id;
              const lines = lineItemsForHistory(order, shop);
              const when = order.handedOverAtIso ? formatHandoverDetail(order.handedOverAtIso) : '';
              const who = order.handedOverByLabel?.trim() || 'Equipe';
              return (
                <li
                  key={order.id}
                  className="rounded-2xl border border-gray-100 bg-gray-50/70 overflow-hidden dark:border-zinc-800 dark:bg-zinc-950/90"
                >
                  <button
                    type="button"
                    onClick={() => toggleHistory(order.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100/80 transition-colors dark:hover:bg-zinc-900/95"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 truncate">{order.clientDisplayName}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        <span className="text-emerald-700 font-semibold">Retirado</span>
                        {when ? ` · ${when}` : ''}
                        {' · '}
                        <span className="text-gray-600">por {who}</span>
                      </p>
                      <p className="text-xs font-black text-gray-800 mt-1">
                        Total R$ {order.total.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <span
                      className="shrink-0 w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-500"
                      aria-hidden
                    >
                      <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-xs`} />
                    </span>
                  </button>
                  {open ? (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/95">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-3 mb-2">
                        Resumo da compra (no momento da retirada)
                      </p>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        {lines.map((ln, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span>
                              <span className="font-semibold text-gray-900">{ln.label}</span>
                              <span className="text-gray-400"> × {ln.qty}</span>
                            </span>
                            <span className="font-medium text-indigo-600 whitespace-nowrap">
                              R$ {ln.lineTotal.toFixed(2).replace('.', ',')}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 pt-2 border-t border-gray-100 text-right text-sm">
                        <span className="text-gray-500">Total </span>
                        <span className="font-black text-gray-900">
                          R$ {order.total.toFixed(2).replace('.', ',')}
                        </span>
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ShopOrders;
