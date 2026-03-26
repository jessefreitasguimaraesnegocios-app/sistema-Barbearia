import React, { useMemo, useState } from 'react';
import { Shop, ShopPartnerOrderRow } from '../types';

interface ShopOrdersProps {
  shop: Shop;
  orders: ShopPartnerOrderRow[];
  onMarkDelivered: (orderId: string) => Promise<void>;
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

const ShopOrders: React.FC<ShopOrdersProps> = ({ shop, orders, onMarkDelivered }) => {
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  const paidOrders = useMemo(
    () => orders.filter((o) => o.status === 'PAID').sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [orders]
  );

  const handleDelivered = async (orderId: string) => {
    setDeliveringId(orderId);
    try {
      await onMarkDelivered(orderId);
    } finally {
      setDeliveringId(null);
    }
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
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-12 text-center">
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
                className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 md:p-6 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <img
                    src={
                      order.clientAvatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(order.clientDisplayName)}&background=random`
                    }
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-100 flex-shrink-0"
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
    </div>
  );
};

export default ShopOrders;
