
import React, { useState } from 'react';
import { Order, Shop, User } from '../types';

interface ClientOrdersProps {
  orders: Order[];
  shops: Shop[];
  user: User;
  onNavigate?: (view: string) => void;
}

const ClientOrders: React.FC<ClientOrdersProps> = ({ orders, shops, user, onNavigate }) => {
  const userOrders = orders.filter(o => o.clientId === user.id);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Meus Pedidos</h2>
        <p className="text-gray-500">Histórico de compras de produtos em nossas lojas.</p>
      </header>

      {userOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userOrders.map(order => {
            const shop = shops.find(s => s.id === order.shopId);
            return (
              <div key={order.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-4 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <img src={shop?.profileImage} className="w-12 h-12 rounded-xl object-cover" alt="" />
                    <div>
                      <h3 className="font-bold text-gray-900">{shop?.name}</h3>
                      <p className="text-xs text-gray-500">Pedido #{order.id.substr(0, 6)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${order.status === 'PAID' ? 'bg-green-100 text-green-600' : order.status === 'PENDING' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                    {order.status === 'PAID' ? 'Pago' : order.status === 'PENDING' ? 'Aguardando pagamento' : order.status === 'DELIVERED' ? 'Entregue' : order.status}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 font-bold uppercase">Data</p>
                    <p className="text-sm font-medium text-gray-900">{order.date}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-xs text-gray-400 font-bold uppercase">Total</p>
                    <p className="text-lg font-black text-indigo-600">R$ {order.total.toFixed(2)}</p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedOrder(order)}
                  className="w-full mt-2 bg-gray-50 hover:bg-indigo-50 text-indigo-600 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-eye"></i> Detalhes do Pedido
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 shadow-inner group">
          <div className="relative mb-10">
             {/* Decorative circles */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-50 rounded-full scale-0 group-hover:scale-100 transition-transform duration-700 opacity-50"></div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-indigo-100 rounded-full scale-0 group-hover:scale-110 transition-transform duration-1000 opacity-30"></div>
             
             {/* Animated Shopping Cart */}
             <div className="relative animate-playful-bounce text-6xl text-indigo-500 drop-shadow-2xl">
                <i className="fas fa-shopping-basket"></i>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-white">
                  0
                </div>
             </div>
          </div>

          <div className="text-center space-y-3 max-w-sm">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">Opa! Nada por aqui ainda...</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Sua sacola está louca para ser preenchida! Explore as lojinhas dos nossos parceiros e descubra produtos que você vai amar.
            </p>
          </div>

          <button 
            onClick={() => onNavigate && onNavigate('client-home')}
            className="mt-10 group relative flex items-center gap-3 bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:shadow-indigo-200 transition-all transform active:scale-95"
          >
            <span>Explorar Lojinhas</span>
            <i className="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          </button>
          
          <div className="mt-8 flex gap-3">
             <span className="w-2 h-2 rounded-full bg-indigo-200"></span>
             <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
             <span className="w-2 h-2 rounded-full bg-indigo-200"></span>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white w-full max-w-md mx-auto my-auto rounded-[2.5rem] shadow-2xl overflow-hidden animate-modal-bounce-in shrink-0">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Detalhes do Pedido</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-900 p-2">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
               <div className="space-y-4">
                 {selectedOrder.items.map((item, idx) => {
                   const shop = shops.find(s => s.id === selectedOrder.shopId);
                   const product = shop?.products.find(p => p.id === item.productId);
                   return (
                     <div key={idx} className="flex gap-4">
                        <img src={product?.image} className="w-14 h-14 rounded-xl object-cover" alt="" />
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-gray-900">{product?.name}</h4>
                          <p className="text-xs text-gray-500">{item.quantity}x R$ {item.price.toFixed(2)}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">R$ {(item.quantity * item.price).toFixed(2)}</p>
                     </div>
                   );
                 })}
               </div>

               <div className="pt-6 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>R$ {selectedOrder.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Frete</span>
                    <span className="text-green-600 font-bold">Grátis</span>
                  </div>
                  <div className="flex justify-between text-xl pt-4 border-t border-gray-200">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-black text-indigo-600">R$ {selectedOrder.total.toFixed(2)}</span>
                  </div>
               </div>

               <div className="bg-indigo-50 p-4 rounded-2xl flex items-center gap-3">
                  <i className="fas fa-info-circle text-indigo-600"></i>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase leading-tight">
                    O estabelecimento entrará em contato para combinar a entrega ou retirada dos seus produtos.
                  </p>
               </div>
            </div>

            <div className="p-6 pt-0">
               <button 
                 onClick={() => setSelectedOrder(null)}
                 className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold"
               >
                 Fechar
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientOrders;
