
import React, { useState } from 'react';
import { Shop, Service, Professional, Appointment, User, Product, Order } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const PAYMENT_API_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/create-payment`
  : '/api/payments/create';

function getPaymentHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PAYMENT_API_URL.includes('supabase.co') && SUPABASE_ANON_KEY) {
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

interface ShopDetailsProps {
  shop: Shop;
  user: User;
  onRefetchAppointmentsAndOrders?: () => void;
  onBook: (appointment?: Appointment) => void;
  onOrder: (order?: Order) => void;
  onBack: () => void;
}

type PaymentMethod = 'PIX' | 'CREDIT' | 'DEBIT';

const ShopDetails: React.FC<ShopDetailsProps> = ({ shop, user, onRefetchAppointmentsAndOrders, onBook, onOrder, onBack }) => {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'STORE'>('SERVICES');
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPro, setSelectedPro] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentCustomerName, setPaymentCustomerName] = useState('');
  const [paymentCustomerEmail, setPaymentCustomerEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  
  // Pagamento PIX pendente: exibe link para pagar e botão "Já paguei"
  type PaymentPendingBooking = { invoiceUrl: string; amount: number; type: 'booking'; pendingBooking: Appointment };
  type PaymentPendingOrder = { invoiceUrl: string; amount: number; type: 'order'; pendingOrder: Order };
  const [paymentPending, setPaymentPending] = useState<PaymentPendingBooking | PaymentPendingOrder | null>(null);
  
  // Store States
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderProcessing, setIsOrderProcessing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const allTimes = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

  const isProfileComplete = !!(
    user.name && user.email && user.cpfCnpj &&
    (user.cpfCnpj.length === 11 || user.cpfCnpj.length === 14) &&
    user.phone
  );

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const availableTimes = !selectedDate
    ? allTimes
    : selectedDate < todayStr
      ? []
      : selectedDate > todayStr
        ? allTimes
        : allTimes.filter((t) => new Date(selectedDate + 'T' + t) > today);

  const handleBooking = async () => {
    if (!selectedService || !selectedPro || !selectedDate || !selectedTime || !selectedPaymentMethod) return;
    const useProfile = isProfileComplete;
    const cpfDigits = useProfile ? (user.cpfCnpj || '').replace(/\D/g, '') : (customerCpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      alert('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para a cobrança.');
      return;
    }
    const customerName = useProfile ? (user.name || '').trim() : (paymentCustomerName || user.name || '').trim();
    const customerEmail = useProfile ? (user.email || '').trim() : (paymentCustomerEmail || user.email || '').trim();
    if (!customerName || !customerEmail) {
      alert('Preencha nome e e-mail para a cobrança.');
      return;
    }
    const phoneForPayment = useProfile ? (user.phone || '').trim() : customerPhone.trim();
    
    setIsProcessing(true);
    
    try {
      const totalAmount = (selectedService.price + tipAmount);
      const response = await fetch(PAYMENT_API_URL, {
        method: 'POST',
        headers: getPaymentHeaders(),
        body: JSON.stringify({
          amount: totalAmount,
          tip: tipAmount,
          description: `Agendamento: ${selectedService.name} na ${shop.name}${tipAmount > 0 ? ' (inclui gorjeta)' : ''}`,
          customerName,
          customerEmail,
          customerCpfCnpj: cpfDigits,
          customerPhone: phoneForPayment || undefined,
          recordType: 'booking',
          booking: {
            shopId: shop.id,
            clientId: user.id,
            serviceId: selectedService.id,
            professionalId: selectedPro.id,
            date: selectedDate,
            time: selectedTime,
            amount: totalAmount,
            tip: tipAmount > 0 ? tipAmount : undefined,
          },
        })
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      if (!response.ok) {
        let message = response.statusText || `Erro ${response.status}`;
        if (isJson && text) try { message = JSON.parse(text).error || message; } catch (_) {}
        throw new Error(message);
      }
      const data = isJson && text ? JSON.parse(text) : {};
      console.log("Asaas Split Payment Response:", data);

      const invoiceUrl = data.invoiceUrl || data.payment?.invoiceUrl;
      if (!invoiceUrl) {
        setIsProcessing(false);
        alert('Cobrança criada, mas o link de pagamento não foi retornado. Tente novamente ou entre em contato.');
        return;
      }

      const newApt: Appointment = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: user.id,
        shopId: shop.id,
        serviceId: selectedService.id,
        professionalId: selectedPro.id,
        date: selectedDate,
        time: selectedTime,
        status: 'PENDING',
        amount: totalAmount,
        tip: tipAmount > 0 ? tipAmount : undefined
      };

      setIsProcessing(false);
      setPaymentPending({
        invoiceUrl,
        amount: totalAmount,
        type: 'booking',
        pendingBooking: { ...newApt, status: 'PAID' }
      });
      onRefetchAppointmentsAndOrders?.();
    } catch (error) {
      console.error("Payment error:", error);
      setIsProcessing(false);
      alert("Erro ao processar pagamento com Split Asaas.");
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product.id === product.id ? {...item, quantity: item.quantity + 1} : item));
    } else {
      setCart([...cart, {product, quantity: 1}]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleOrderPayment = async () => {
    const useProfile = isProfileComplete;
    const cpfDigits = useProfile ? (user.cpfCnpj || '').replace(/\D/g, '') : (customerCpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      alert('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para a cobrança.');
      return;
    }
    const customerName = useProfile ? (user.name || '').trim() : (paymentCustomerName || user.name || '').trim();
    const customerEmail = useProfile ? (user.email || '').trim() : (paymentCustomerEmail || user.email || '').trim();
    if (!customerName || !customerEmail) {
      alert('Preencha nome e e-mail para a cobrança.');
      return;
    }
    const phoneForPayment = useProfile ? (user.phone || '').trim() : customerPhone.trim();
    setIsOrderProcessing(true);
    
    try {
      const response = await fetch(PAYMENT_API_URL, {
        method: 'POST',
        headers: getPaymentHeaders(),
        body: JSON.stringify({
          amount: cartTotal,
          description: `Compra de Produtos na ${shop.name}`,
          customerName,
          customerEmail,
          customerCpfCnpj: cpfDigits,
          customerPhone: phoneForPayment || undefined,
          recordType: 'order',
          order: {
            shopId: shop.id,
            clientId: user.id,
            items: cart.map(item => ({
              productId: item.product.id,
              quantity: item.quantity,
              price: item.product.promoPrice ?? item.product.price,
            })),
            total: cartTotal,
          },
        })
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      if (!response.ok) {
        let message = response.statusText || `Erro ${response.status}`;
        if (isJson && text) try { message = JSON.parse(text).error || message; } catch (_) {}
        throw new Error(message);
      }
      const data = isJson && text ? JSON.parse(text) : {};
      console.log("Asaas Split Order Response:", data);

      const invoiceUrl = data.invoiceUrl || data.payment?.invoiceUrl;
      if (!invoiceUrl) {
        setIsOrderProcessing(false);
        alert('Cobrança criada, mas o link de pagamento não foi retornado. Tente novamente ou entre em contato.');
        return;
      }

      const newOrder: Order = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: user.id,
        shopId: shop.id,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.promoPrice || item.product.price
        })),
        total: cartTotal,
        status: 'PAID',
        date: new Date().toLocaleDateString('pt-BR')
      };

      setIsOrderProcessing(false);
      setPaymentPending({
        invoiceUrl,
        amount: cartTotal,
        type: 'order',
        pendingOrder: newOrder
      });
      onRefetchAppointmentsAndOrders?.();
    } catch (error) {
      console.error("Order payment error:", error);
      setIsOrderProcessing(false);
      alert("Erro ao processar pedido com Split Asaas.");
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.promoPrice || item.product.price) * item.quantity, 0);

  // Success Overlay Animation Component
  if (bookingSuccess) {
    return (
      <div className="fixed inset-0 z-[120] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
        <div className="relative mb-8">
           {/* Decorative background circle */}
           <div className="absolute inset-0 bg-indigo-100 rounded-full scale-[2] opacity-30 animate-pulse"></div>
           
           {/* Success Icon Animation Container */}
           <div className="relative w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-200 animate-bounce-in">
              <div className="flex flex-col items-center transition-all duration-1000">
                {/* Checkmark transforming into calendar icon simulation via sequencing or overlapping */}
                <i className="fas fa-check text-4xl animate-playful-bounce mb-1"></i>
                <div className="h-px w-6 bg-white/50 mb-1"></div>
                <i className="far fa-calendar-check text-2xl opacity-80"></i>
              </div>
           </div>
        </div>

        <div className="text-center space-y-3 px-6 max-w-sm">
           <h2 className="text-3xl font-black text-gray-900 tracking-tight">Tudo pronto!</h2>
           <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 my-4">
             <p className="text-gray-500 font-medium leading-relaxed text-sm">
               Seu horário com <span className="text-indigo-600 font-bold">{selectedPro?.name}</span> foi confirmado!
             </p>
             <div className="flex items-center justify-center gap-4 mt-2 text-indigo-600 font-bold text-xs uppercase tracking-widest">
               <span><i className="far fa-calendar-alt mr-1"></i> {selectedDate}</span>
               <span><i className="far fa-clock mr-1"></i> {selectedTime}</span>
             </div>
           </div>
           <p className="text-xs text-gray-400">
             Você receberá um lembrete em breve. Já deixamos tudo preparado para sua chegada!
           </p>
        </div>
        
        <div className="mt-12 flex gap-2">
           <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
           <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
           <div className="w-2 h-2 bg-indigo-200 rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  // Tela: complete o pagamento PIX (link + "Já paguei, finalizar")
  if (paymentPending) {
    const handlePaid = () => {
      const pending = paymentPending;
      setPaymentPending(null);
      if (pending.type === 'booking') {
        onBook();
      } else {
        setCart([]);
        setIsCartOpen(false);
        onOrder();
      }
    };
    return (
      <div className="fixed inset-0 z-[120] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
            <i className="fas fa-qrcode text-3xl text-emerald-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Pague com PIX</h2>
          <p className="text-gray-500 text-sm">
            A cobrança foi gerada. Abra a página abaixo para ver o QR Code ou o código PIX Copia e Cola, pague no app do seu banco e depois clique em &quot;Já paguei&quot;.
          </p>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Valor a pagar</p>
            <p className="text-3xl font-black text-indigo-600">R$ {paymentPending.amount.toFixed(2).replace('.', ',')}</p>
          </div>
          <a
            href={paymentPending.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors"
          >
            <i className="fas fa-external-link-alt mr-2"></i> Abrir página de pagamento PIX
          </a>
          <button
            type="button"
            onClick={handlePaid}
            className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-colors"
          >
            <i className="fas fa-check mr-2"></i> Já paguei, finalizar
          </button>
          <p className="text-xs text-gray-400">
            Ao clicar em &quot;Já paguei&quot;, seu agendamento/pedido será confirmado na lista.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-gray-500 hover:text-indigo-600 font-medium transition-colors">
        <i className="fas fa-arrow-left"></i> Voltar para busca
      </button>

      <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-gray-100">
        {/* Banner */}
        <div className="h-48 md:h-64 relative">
          <img src={shop.bannerImage} className="w-full h-full object-cover" alt="banner" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div className="absolute bottom-6 left-6 flex items-end gap-4 md:gap-6">
            <img src={shop.profileImage} className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-3xl border-4 border-white shadow-xl" alt="profile" />
            <div className="mb-1 md:mb-2">
              <h2 className="text-xl md:text-3xl font-bold text-white mb-1 font-display">{shop.name}</h2>
              <div className="flex items-center gap-3 text-white/90 text-xs md:text-sm">
                <span><i className="fas fa-star text-yellow-400 mr-1"></i> {shop.rating}</span>
                <span><i className="fas fa-map-marker-alt mr-1"></i> {shop.address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-100 p-2 gap-2 bg-gray-50/50">
          <button 
            onClick={() => setActiveTab('SERVICES')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'SERVICES' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <i className="fas fa-scissors"></i> Serviços
          </button>
          <button 
            onClick={() => setActiveTab('STORE')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'STORE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <i className="fas fa-shopping-bag"></i> Loja
          </button>
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'SERVICES' ? (
            <div className="animate-fade-in">
              {/* Progress Bar for Services */}
              <div className="flex justify-between mb-12 px-6 md:px-10 relative">
                 <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 z-0"></div>
                 <div className="absolute top-1/2 left-0 h-1 bg-indigo-600 -translate-y-1/2 z-0 transition-all duration-500" style={{ width: `${(step - 1) * 33}%` }}></div>
                 {[1, 2, 3, 4].map(s => (
                   <div key={s} className={`relative z-10 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-base font-bold transition-all ${step >= s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400 border-2 border-gray-100'}`}>
                     {s}
                   </div>
                 ))}
              </div>

              {/* Step Content */}
              <div className="min-h-[300px]">
                {step === 1 && (
                  <div className="animate-fade-in space-y-6">
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900">Escolha o serviço</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {shop.services.map(s => (
                        <button 
                          key={s.id} 
                          onClick={() => { setSelectedService(s); setStep(2); }}
                          className={`p-5 md:p-6 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] ${selectedService?.id === s.id ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-100 bg-white hover:border-indigo-200'}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-gray-900 text-base md:text-lg">{s.name}</span>
                            <span className="font-bold text-indigo-600">R$ {s.price}</span>
                          </div>
                          <p className="text-xs md:text-sm text-gray-500 mb-4">{s.description}</p>
                          <div className="flex items-center text-[10px] md:text-xs text-gray-400">
                            <i className="far fa-clock mr-1"></i> {s.duration} min
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="animate-fade-in space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900">Com quem?</h3>
                      <button onClick={() => setStep(1)} className="text-indigo-600 text-xs font-medium">Trocar serviço</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {shop.professionals.map(p => (
                        <button 
                          key={p.id} 
                          onClick={() => { setSelectedPro(p); setStep(3); }}
                          className={`p-4 md:p-6 rounded-2xl border-2 text-center transition-all ${selectedPro?.id === p.id ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-100 bg-white hover:border-indigo-200'}`}
                        >
                          <img src={p.avatar} className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl mx-auto mb-3 object-cover shadow-sm" alt={p.name} />
                          <h4 className="font-bold text-gray-900 text-sm md:text-base">{p.name}</h4>
                          <p className="text-[10px] text-indigo-600 font-medium uppercase truncate">{p.specialty}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="animate-fade-in space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900">Data e Hora</h3>
                      <button onClick={() => setStep(2)} className="text-indigo-600 text-xs font-medium">Trocar prof.</button>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                        {availableDates.map(date => (
                          <button 
                            key={date}
                            onClick={() => { setSelectedDate(date); setSelectedTime(''); }}
                            className={`flex-shrink-0 w-16 md:w-20 py-3 md:py-4 rounded-2xl border-2 transition-all flex flex-col items-center ${selectedDate === date ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-gray-100 text-gray-500'}`}
                          >
                            <span className="text-[10px] md:text-xs font-medium uppercase">{new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                            <span className="text-lg md:text-xl font-bold">{new Date(date + 'T12:00:00').getDate()}</span>
                          </button>
                        ))}
                      </div>

                      {selectedDate && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {availableTimes.map(t => (
                            <button 
                              key={t}
                              onClick={() => setSelectedTime(t)}
                              className={`py-2 md:py-3 rounded-xl border-2 text-xs md:text-sm font-bold transition-all ${selectedTime === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedTime && (
                      <button 
                        onClick={() => setStep(4)}
                        className="w-full bg-indigo-600 text-white py-4 md:py-5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all mt-6"
                      >
                        Próximo: Pagamento
                      </button>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="animate-fade-in space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900">Resumo e Pagamento</h3>
                      <button onClick={() => setStep(3)} className="text-indigo-600 text-xs font-medium">Alterar data</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Lado Esquerdo: Resumo */}
                      <div className="space-y-4">
                        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                           <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Seu Agendamento</h4>
                           <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Serviço</span>
                                <span className="text-sm font-bold text-gray-900">{selectedService?.name}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Com</span>
                                <span className="text-sm font-bold text-gray-900">{selectedPro?.name}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Data</span>
                                <span className="text-sm font-bold text-gray-900">{selectedDate}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Horário</span>
                                <span className="text-sm font-bold text-gray-900">{selectedTime}</span>
                              </div>
                              {tipAmount > 0 && (
                                <div className="flex justify-between items-center text-green-600">
                                  <span className="text-sm">Gorjeta</span>
                                  <span className="text-sm font-bold">+ R$ {tipAmount.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="font-bold text-gray-900">Total</span>
                                <span className="text-xl font-black text-indigo-600">R$ {(selectedService?.price + tipAmount).toFixed(2)}</span>
                              </div>
                           </div>
                        </div>

                        {/* Tip Selection */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Adicionar Gorjeta</h4>
                          <div className="grid grid-cols-4 gap-2">
                            {[0, 5, 10, 15].map((percent) => {
                              const amount = percent === 0 ? 0 : (selectedService?.price || 0) * (percent / 100);
                              return (
                                <button
                                  key={percent}
                                  onClick={() => setTipAmount(amount)}
                                  className={`py-2 rounded-xl border-2 text-[10px] font-bold transition-all ${
                                    (percent === 0 && tipAmount === 0) || (percent !== 0 && tipAmount === amount)
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'
                                  }`}
                                >
                                  {percent === 0 ? 'Não' : `${percent}%`}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3">
                            <input
                              type="number"
                              placeholder="Outro valor (R$)"
                              className="w-full p-3 rounded-xl bg-gray-50 border-none text-xs focus:ring-2 focus:ring-indigo-600"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) setTipAmount(val);
                                else if (e.target.value === '') setTipAmount(0);
                              }}
                            />
                          </div>
                          <p className="text-[9px] text-gray-400 mt-2 italic">
                            A gorjeta vai 100% para o profissional escolhido.
                          </p>
                        </div>
                      </div>

                      {/* Dados para cobrança: escondido se perfil completo */}
                      {isProfileComplete ? (
                        <div className="bg-green-50 p-6 rounded-3xl border border-green-100 shadow-sm">
                          <h4 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-2">Pagamento com os dados do seu perfil</h4>
                          <p className="text-sm text-gray-700">Usaremos <strong>{user.name}</strong> e seu CPF/telefone cadastrados. Nada a preencher.</p>
                          <p className="text-[10px] text-gray-500 mt-2">Para alterar, vá em <strong>Meu Perfil</strong> no menu.</p>
                        </div>
                      ) : (
                      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Dados para cobrança</h4>
                        <p className="text-[10px] text-gray-400 mb-4">Exigidos pelo gateway para gerar o PIX. Ou complete em Meu Perfil para não preencher aqui.</p>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
                            <input
                              type="text"
                              placeholder="Nome do titular da cobrança"
                              value={paymentCustomerName || user.name || ''}
                              onChange={(e) => setPaymentCustomerName(e.target.value)}
                              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
                            <input
                              type="email"
                              placeholder="e-mail@exemplo.com"
                              value={paymentCustomerEmail || user.email || ''}
                              onChange={(e) => setPaymentCustomerEmail(e.target.value)}
                              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">CPF ou CNPJ *</label>
                            <input
                              type="text"
                              placeholder="Somente números (11 ou 14 dígitos)"
                              value={customerCpf}
                              onChange={(e) => setCustomerCpf(e.target.value.replace(/\D/g, '').slice(0, 14))}
                              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                              maxLength={14}
                            />
                            <p className="text-[9px] text-gray-400 mt-1">Obrigatório pelo gateway para emissão da cobrança PIX.</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone (opcional)</label>
                            <input
                              type="text"
                              placeholder="Ex: 11999999999"
                              value={customerPhone}
                              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                              maxLength={11}
                            />
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Lado Direito: Opções de Pagamento */}
                      <div className="space-y-4">
                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Forma de Pagamento</h4>
                         <div className="grid grid-cols-1 gap-3">
                            <button 
                              onClick={() => setSelectedPaymentMethod('PIX')}
                              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'PIX' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}
                            >
                              <div className="w-10 h-10 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center">
                                <i className="fas fa-qrcode"></i>
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-gray-900">PIX</p>
                                <p className="text-[10px] text-gray-500">Liberação instantânea</p>
                              </div>
                              {selectedPaymentMethod === 'PIX' && <i className="fas fa-check-circle ml-auto text-indigo-600"></i>}
                            </button>

                            <button 
                              onClick={() => setSelectedPaymentMethod('CREDIT')}
                              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'CREDIT' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}
                            >
                              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                                <i className="fas fa-credit-card"></i>
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-gray-900">Cartão de Crédito</p>
                                <p className="text-[10px] text-gray-500">Em até 3x sem juros</p>
                              </div>
                              {selectedPaymentMethod === 'CREDIT' && <i className="fas fa-check-circle ml-auto text-indigo-600"></i>}
                            </button>

                            <button 
                              onClick={() => setSelectedPaymentMethod('DEBIT')}
                              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'DEBIT' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}
                            >
                              <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
                                <i className="fas fa-money-check"></i>
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-gray-900">Cartão de Débito</p>
                                <p className="text-[10px] text-gray-500">Pagamento à vista</p>
                              </div>
                              {selectedPaymentMethod === 'DEBIT' && <i className="fas fa-check-circle ml-auto text-indigo-600"></i>}
                            </button>
                         </div>

                         {selectedPaymentMethod === 'PIX' && (
                           <div className="animate-fade-in bg-gray-50 p-4 rounded-2xl border-2 border-dashed border-gray-200 text-center">
                              <div className="w-32 h-32 bg-white border border-gray-100 mx-auto mb-4 p-2 flex items-center justify-center">
                                <i className="fas fa-qrcode text-6xl text-gray-800"></i>
                              </div>
                              <p className="text-[10px] text-gray-400 font-medium mb-3 uppercase">Escaneie o código acima ou use o Copia e Cola</p>
                              <button className="bg-white border border-indigo-200 text-indigo-600 text-[10px] font-bold py-2 px-4 rounded-lg flex items-center gap-2 mx-auto">
                                <i className="fas fa-copy"></i> Copiar Código PIX
                              </button>
                           </div>
                         )}

                         {(selectedPaymentMethod === 'CREDIT' || selectedPaymentMethod === 'DEBIT') && (
                           <div className="animate-fade-in grid grid-cols-1 gap-3">
                              <input type="text" placeholder="Nome no Cartão" className="w-full p-3 rounded-xl bg-gray-50 border-none text-xs focus:ring-2 focus:ring-indigo-600" />
                              <div className="grid grid-cols-2 gap-3">
                                <input type="text" placeholder="MM/AA" className="w-full p-3 rounded-xl bg-gray-50 border-none text-xs focus:ring-2 focus:ring-indigo-600" />
                                <input type="text" placeholder="CVV" className="w-full p-3 rounded-xl bg-gray-50 border-none text-xs focus:ring-2 focus:ring-indigo-600" />
                              </div>
                           </div>
                         )}
                      </div>
                    </div>

                    <button 
                      disabled={isProcessing || !selectedPaymentMethod || (!isProfileComplete && ((customerCpf.replace(/\D/g, '').length !== 11 && customerCpf.replace(/\D/g, '').length !== 14) || !(paymentCustomerName || user.name || '').trim() || !(paymentCustomerEmail || user.email || '').trim()))}
                      onClick={handleBooking}
                      className="w-full bg-indigo-600 text-white py-4 md:py-5 rounded-3xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed mt-8"
                    >
                      {isProcessing ? (
                        <><i className="fas fa-spinner fa-spin"></i> Processando Pagamento...</>
                      ) : (
                        <><i className="fas fa-shield-check"></i> Finalizar Agendamento</>
                      )}
                    </button>
                    <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-bold">Ambiente 100% Seguro</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in space-y-8">
               <div className="flex justify-between items-center">
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Produtos Exclusivos</h3>
                  <div className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold">
                    {shop.products.length} itens disponíveis
                  </div>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6">
                 {shop.products.map(product => (
                   <div key={product.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                      <div className="h-32 md:h-40 relative overflow-hidden">
                        <img src={product.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={product.name} />
                        {product.promoPrice && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                            Oferta
                          </div>
                        )}
                      </div>
                      <div className="p-3 md:p-4">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{product.category}</p>
                        <h4 className="font-bold text-gray-800 text-sm md:text-base line-clamp-1">{product.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          {product.promoPrice ? (
                            <>
                              <span className="text-indigo-600 font-black">R$ {product.promoPrice.toFixed(2)}</span>
                              <span className="text-[10px] text-gray-300 line-through">R$ {product.price}</span>
                            </>
                          ) : (
                            <span className="text-indigo-600 font-black">R$ {product.price.toFixed(2)}</span>
                          )}
                        </div>
                        <button 
                          onClick={() => addToCart(product)}
                          className="w-full mt-3 py-2 rounded-xl border-2 border-indigo-100 text-indigo-600 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"
                        >
                          Adicionar
                        </button>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart Summary Drawer / Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-left">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                <i className="fas fa-shopping-basket text-indigo-600"></i> Meu Carrinho
              </h3>
              <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-gray-900 p-2">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {cart.length > 0 ? (
                cart.map(item => (
                  <div key={item.product.id} className="flex gap-4 group">
                    <img src={item.product.image} className="w-20 h-20 rounded-2xl object-cover shadow-sm" alt="" />
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-gray-900 text-sm">{item.product.name}</h4>
                        <button onClick={() => removeFromCart(item.product.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{item.product.category}</p>
                      <div className="flex justify-between items-center pt-2">
                        <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-2 py-1">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="text-gray-500 hover:text-indigo-600"><i className="fas fa-minus text-[10px]"></i></button>
                          <span className="text-sm font-bold text-gray-900 min-w-[20px] text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="text-gray-500 hover:text-indigo-600"><i className="fas fa-plus text-[10px]"></i></button>
                        </div>
                        <span className="font-black text-indigo-600">R$ {((item.product.promoPrice || item.product.price) * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="relative mb-8 group">
                    <div className="absolute inset-0 bg-indigo-50 rounded-full scale-150 blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-1000"></div>
                    <div className="relative animate-playful-bounce text-7xl text-indigo-400 drop-shadow-lg">
                      <i className="fas fa-shopping-basket"></i>
                    </div>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2 tracking-tight">Poxa, está vazio!</h4>
                  <p className="text-sm text-gray-500 leading-relaxed mb-10 max-w-[250px] mx-auto">
                    Parece que você ainda não adicionou nenhum item incrível. Vamos encontrar algo especial?
                  </p>
                  <button 
                    onClick={() => setIsCartOpen(false)}
                    className="group flex items-center gap-3 bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:shadow-indigo-200 transition-all active:scale-95"
                  >
                    <span>Explorar Loja</span>
                    <i className="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
                  </button>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-6 border-t border-gray-100 space-y-6 bg-gray-50/50">
                {isProfileComplete ? (
                  <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                    <p className="text-sm text-green-800 font-medium flex items-center gap-2">
                      <i className="fas fa-check-circle text-green-600" />
                      Pagamento com os dados do seu perfil (<strong>{user.name}</strong>)
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">Para alterar, vá em Meu Perfil no menu.</p>
                  </div>
                ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dados para cobrança</h4>
                  <p className="text-[9px] text-gray-400 -mt-1">Exigidos pelo gateway para gerar o PIX. Ou complete em Meu Perfil.</p>
                  <input
                    type="text"
                    placeholder="Nome completo *"
                    value={paymentCustomerName || user.name || ''}
                    onChange={(e) => setPaymentCustomerName(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600"
                  />
                  <input
                    type="email"
                    placeholder="E-mail *"
                    value={paymentCustomerEmail || user.email || ''}
                    onChange={(e) => setPaymentCustomerEmail(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600"
                  />
                  <input
                    type="text"
                    placeholder="CPF ou CNPJ * (somente números)"
                    value={customerCpf}
                    onChange={(e) => setCustomerCpf(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    className="w-full p-3 rounded-xl bg-white border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600"
                    maxLength={14}
                  />
                  <input
                    type="text"
                    placeholder="Telefone (opcional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    className="w-full p-3 rounded-xl bg-white border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600"
                    maxLength={11}
                  />
                </div>
                )}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Entrega (Simulada)</span>
                    <span className="text-green-600 font-bold">Grátis</span>
                  </div>
                  <div className="flex justify-between text-xl pt-4 border-t border-gray-200">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-black text-indigo-600">R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 mt-2">
                    <p className="text-[10px] text-indigo-600 font-bold uppercase flex items-center gap-2">
                      <i className="fas fa-info-circle"></i> Split de Pagamento Ativo
                    </p>
                    <p className="text-[9px] text-indigo-400 mt-1">
                      Esta transação será dividida: 95% para a loja e 5% de taxa de serviço da plataforma.
                    </p>
                  </div>
                </div>

                {orderSuccess ? (
                  <div className="bg-green-500 text-white p-4 rounded-2xl flex items-center justify-center gap-3 font-bold animate-bounce-in">
                    <i className="fas fa-check-circle text-xl"></i> Pedido Realizado!
                  </div>
                ) : (
                  <button 
                    disabled={isOrderProcessing || (!isProfileComplete && ((customerCpf.replace(/\D/g, '').length !== 11 && customerCpf.replace(/\D/g, '').length !== 14) || !(paymentCustomerName || user.name || '').trim() || !(paymentCustomerEmail || user.email || '').trim()))}
                    onClick={handleOrderPayment}
                    className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOrderProcessing ? (
                      <><i className="fas fa-spinner fa-spin"></i> Processando...</>
                    ) : (
                      <><i className="fas fa-credit-card"></i> Pagar R$ {cartTotal.toFixed(2)}</>
                    )}
                  </button>
                )}
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">Pagamento processado por BeautyPay</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Cart Button */}
      {cart.length > 0 && activeTab === 'STORE' && !isCartOpen && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-slate-900 text-white p-4 rounded-3xl shadow-2xl z-[60] flex items-center justify-between animate-bounce-in">
           <div className="flex items-center gap-4">
              <div className="relative">
                <i className="fas fa-shopping-cart text-xl"></i>
                <span className="absolute -top-2 -right-2 bg-indigo-500 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Seu Carrinho</p>
                <p className="text-sm font-black">R$ {cartTotal.toFixed(2)}</p>
              </div>
           </div>
           <button 
             onClick={() => setIsCartOpen(true)}
             className="bg-indigo-500 hover:bg-indigo-600 px-6 py-2 rounded-xl font-bold text-sm transition-all"
           >
             Finalizar <i className="fas fa-chevron-right ml-1"></i>
           </button>
        </div>
      )}
    </div>
  );
};

export default ShopDetails;
