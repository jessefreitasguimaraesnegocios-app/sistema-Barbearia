
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Shop, Service, Professional, Appointment, User, Product, Order } from '../types';
import { supabase } from '../src/lib/supabase';
import {
  generateAgendaSlots,
  slotClientSelectionState,
  type BookingBlock,
} from '../lib/agendaSlots';
import { mapClientCatalogProductRow } from '../services/supabase/mapClientCatalogShop';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const PAYMENT_API_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/create-payment`
  : '/api/payments/create';

const PIX_COPIED_TOAST_MS = 1500;

/** Garante access_token fresco (evita POST na Edge sem Bearer → 401). */
async function ensurePaymentAccessToken(): Promise<string> {
  const {
    data: { session: first },
  } = await supabase.auth.getSession();
  if (first?.access_token) return first.access_token;
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return data.session.access_token;
}

async function callCreatePayment(body: object): Promise<Record<string, unknown>> {
  const accessToken = await ensurePaymentAccessToken();
  if (PAYMENT_API_URL.startsWith('http')) {
    if (!SUPABASE_ANON_KEY?.trim()) {
      throw new Error(
        'Configuração: VITE_SUPABASE_ANON_KEY ausente no build. Defina no Vercel e faça redeploy.'
      );
    }
    /** fetch explícito: gateway das Edge Functions exige header apikey + Authorization (invoke só com Authorization pode falhar em alguns casos). */
    const res = await fetch(PAYMENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const contentType = res.headers.get('content-type');
    const isJson = Boolean(contentType?.includes('application/json'));
    if (!res.ok) {
      let message = res.statusText || `Erro ${res.status}`;
      if (isJson && text) {
        try {
          const j = JSON.parse(text) as { error?: string };
          if (typeof j?.error === 'string' && j.error) message = j.error;
        } catch {
          /* ignore */
        }
      }
      throw new Error(message);
    }
    return isJson && text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }
  const res = await fetch(PAYMENT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const contentType = res.headers.get('content-type');
  const isJson = Boolean(contentType?.includes('application/json'));
  if (!res.ok) {
    let message = res.statusText || `Erro ${res.status}`;
    if (isJson && text) {
      try {
        const j = JSON.parse(text) as { error?: string };
        if (typeof j?.error === 'string' && j.error) message = j.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }
  return isJson && text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function pickInvoiceUrl(data: Record<string, unknown>): string | undefined {
  const top = data.invoiceUrl;
  if (typeof top === 'string' && top.trim()) return top.trim();
  const pay = data.payment;
  if (pay && typeof pay === 'object' && pay !== null && 'invoiceUrl' in pay) {
    const u = (pay as { invoiceUrl?: unknown }).invoiceUrl;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return undefined;
}

function pickPixQrFromResponse(data: Record<string, unknown>): { encodedImage: string; payload: string } | null {
  const raw = data.pixQrCode;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { encodedImage?: unknown; payload?: unknown };
  const payload = typeof o.payload === 'string' ? o.payload.trim() : '';
  if (!payload) return null;
  const encodedImage = typeof o.encodedImage === 'string' ? o.encodedImage.trim() : '';
  return { encodedImage, payload };
}

function pixQrImageSrc(encodedImage: string): string | null {
  if (!encodedImage) return null;
  if (encodedImage.startsWith('data:')) return encodedImage;
  return `data:image/png;base64,${encodedImage}`;
}

function buildIdempotencyKey(prefix: 'booking' | 'order', parts: Array<string | number>): string {
  const raw = `${prefix}|${parts.map((p) => String(p)).join('|')}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
}

interface ShopDetailsProps {
  shop: Shop;
  user: User;
  onRefetchAppointmentsAndOrders?: () => void;
  onBook: (appointment?: Appointment) => void;
  onOrder: (order?: Order) => void;
  onBack: () => void;
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ShopDetails: React.FC<ShopDetailsProps> = ({ shop, user, onRefetchAppointmentsAndOrders, onBook, onOrder, onBack }) => {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'STORE'>('SERVICES');
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPro, setSelectedPro] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentCustomerName, setPaymentCustomerName] = useState('');
  const [paymentCustomerEmail, setPaymentCustomerEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  /** PIX gerado: mostra QR + copia e cola na mesma tela; confirmação via Realtime (PAID). */
  type InlinePayPix = {
    kind: 'booking' | 'order';
    payload: string;
    encodedImage: string;
    invoiceUrl?: string;
    amount: number;
    recordId?: string;
    isDuplicate?: boolean;
  };
  const [inlinePayPix, setInlinePayPix] = useState<InlinePayPix | null>(null);
  /** Fluxo agendamento: resumo → tela dedicada PIX → “Pagamento Aprovado!” → home. */
  type BookingPayPhase = 'idle' | 'pix' | 'approved';
  const [bookingPayPhase, setBookingPayPhase] = useState<BookingPayPhase>('idle');
  /** Fluxo carrinho (loja): carrinho → tela dedicada PIX → aprovado → home. */
  type OrderPayPhase = 'idle' | 'pix' | 'approved';
  const [orderPayPhase, setOrderPayPhase] = useState<OrderPayPhase>('idle');

  const [pixCopiedToast, setPixCopiedToast] = useState(false);
  const pixCopiedToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pixCopiedToastTimerRef.current != null) {
        window.clearTimeout(pixCopiedToastTimerRef.current);
      }
    };
  }, []);

  // Store States
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderProcessing, setIsOrderProcessing] = useState(false);

  /** Catálogo da loja com estoque atualizado via Realtime (`products`). */
  const productsStockSig = useMemo(
    () => shop.products.map((p) => `${p.id}:${p.stock}`).join('|'),
    [shop.products]
  );
  const [liveProducts, setLiveProducts] = useState<Product[]>(() => shop.products);

  useEffect(() => {
    setLiveProducts(shop.products);
    // productsStockSig reflete mudanças em shop.products sem depender da referência do array
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: shop.id + assinatura de estoque
  }, [shop.id, productsStockSig]);

  useEffect(() => {
    let cancelled = false;
    const refreshProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, price, promo_price, category, image, stock')
        .eq('shop_id', shop.id);
      if (cancelled || error) return;
      const rows = (data ?? []) as Record<string, unknown>[];
      setLiveProducts(rows.map(mapClientCatalogProductRow));
    };

    const channel = supabase
      .channel(`shop-details-products-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `shop_id=eq.${shop.id}` },
        () => {
          void refreshProducts();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [shop.id]);

  useEffect(() => {
    const byId = new Map<string, Product>(liveProducts.map((p) => [p.id, p]));
    setCart((prev) =>
      prev
        .map((line) => {
          const fresh = byId.get(line.product.id);
          if (!fresh) return null;
          const maxStock = Math.max(0, Math.floor(Number(fresh.stock) || 0));
          if (maxStock <= 0) return null;
          return { product: fresh, quantity: Math.min(line.quantity, maxStock) };
        })
        .filter((x): x is { product: Product; quantity: number } => x != null)
    );
  }, [liveProducts]);

  const [bookingBlocks, setBookingBlocks] = useState<BookingBlock[]>([]);
  const [loadingBookingBlocks, setLoadingBookingBlocks] = useState(false);
  /** Recalcula horários “hoje” e cruza meia-noite; useMemo sozinho congelava `new Date()` dentro do memo. */
  const [agendaClock, setAgendaClock] = useState(0);

  useEffect(() => {
    const tick = () => setAgendaClock((n) => n + 1);
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const isProfileComplete = !!(
    user.name && user.email && user.cpfCnpj &&
    (user.cpfCnpj.length === 11 || user.cpfCnpj.length === 14) &&
    user.phone
  );

  const today = new Date();
  const todayStr = ymdLocal(today);
  /** Datas locais (evita `toISOString()` UTC deslocar o dia vs. “hoje” em BRT). */
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return ymdLocal(d);
  });

  useEffect(() => {
    if (!selectedDate) return;
    if (selectedDate < todayStr) setSelectedDate(todayStr);
  }, [agendaClock, todayStr, selectedDate]);

  const agendaSlotMinutes = shop.agendaSlotMinutes ?? 30;
  const hasShopLunch = Boolean(shop.lunchStart && shop.lunchEnd);
  const daySlotList = useMemo(
    () =>
      generateAgendaSlots({
        workStart: shop.workdayStart ?? '08:00',
        workEnd: shop.workdayEnd ?? '20:00',
        lunchStart: hasShopLunch ? shop.lunchStart : null,
        lunchEnd: hasShopLunch ? shop.lunchEnd : null,
        slotMinutes: agendaSlotMinutes,
      }),
    [
      shop.workdayStart,
      shop.workdayEnd,
      shop.lunchStart,
      shop.lunchEnd,
      hasShopLunch,
      agendaSlotMinutes,
      shop.rowUpdatedAt,
    ]
  );

  const availableTimes = useMemo(() => {
    void agendaClock;
    const now = new Date();
    if (!selectedDate) return daySlotList;
    if (selectedDate < todayStr) return [];
    if (selectedDate > todayStr) return daySlotList;
    return daySlotList.filter((t) => new Date(`${selectedDate}T${t}:00`) > now);
  }, [selectedDate, daySlotList, todayStr, agendaClock]);

  const teamProIds = useMemo(() => shop.professionals.map((p) => p.id), [shop.professionals]);

  useEffect(() => {
    if (!selectedDate || !shop?.id) {
      setBookingBlocks([]);
      return;
    }
    let cancelled = false;
    setLoadingBookingBlocks(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_shop_booking_blocks', {
        p_shop_id: shop.id,
        p_date: selectedDate,
      });
      if (cancelled) return;
      setLoadingBookingBlocks(false);
      if (error) {
        console.error('[ShopDetails] get_shop_booking_blocks', error);
        setBookingBlocks([]);
        return;
      }
      const rows = (data || []) as {
        time_text: string;
        duration_minutes: number;
        professional_id: string;
      }[];
      setBookingBlocks(
        rows.map((r) => ({
          time: (r.time_text && r.time_text.length >= 5 ? r.time_text : r.time_text || '00:00').slice(0, 5),
          durationMinutes: Math.max(15, Number(r.duration_minutes) || 30),
          professionalId: String(r.professional_id),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shop.id, selectedDate]);

  useEffect(() => {
    if (!selectedTime || !selectedPro) return;
    const { fullyBooked, selectedProBusy } = slotClientSelectionState(
      selectedTime,
      agendaSlotMinutes,
      bookingBlocks,
      teamProIds,
      selectedPro.id
    );
    if (fullyBooked || selectedProBusy) setSelectedTime('');
  }, [selectedTime, selectedPro, bookingBlocks, agendaSlotMinutes, teamProIds]);

  const handleBooking = async () => {
    if (!selectedService || !selectedPro || !selectedDate || !selectedTime) return;
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
      const normalizedTime = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;
      const bookingIdempotencyKey = buildIdempotencyKey('booking', [
        user.id,
        shop.id,
        selectedService.id,
        selectedPro.id,
        selectedDate,
        normalizedTime,
        totalAmount.toFixed(2),
      ]);
      const data = await callCreatePayment({
        idempotencyKey: bookingIdempotencyKey,
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
          time: normalizedTime,
          amount: totalAmount,
          tip: tipAmount > 0 ? tipAmount : undefined,
        },
      });
      console.log("Asaas Split Payment Response:", data);

      const invoiceUrl = pickInvoiceUrl(data as Record<string, unknown>);
      const pix = pickPixQrFromResponse(data as Record<string, unknown>);
      const appointmentId =
        typeof (data as { appointmentId?: unknown }).appointmentId === 'string'
          ? (data as { appointmentId: string }).appointmentId
          : undefined;

      if (!pix?.payload && !invoiceUrl) {
        setIsProcessing(false);
        alert('Cobrança criada, mas não foi possível obter o PIX nem o link de pagamento. Tente novamente ou entre em contato.');
        return;
      }

      setIsProcessing(false);
      setInlinePayPix({
        kind: 'booking',
        payload: pix?.payload ?? '',
        encodedImage: pix?.encodedImage ?? '',
        invoiceUrl,
        amount: totalAmount,
        recordId: appointmentId,
        isDuplicate: Boolean((data as { duplicate?: unknown }).duplicate),
      });
      setBookingPayPhase('pix');
      onRefetchAppointmentsAndOrders?.();
    } catch (error) {
      console.error("Payment error:", error);
      setIsProcessing(false);
      alert(error instanceof Error ? error.message : 'Erro ao processar pagamento com Split Asaas.');
    }
  };

  const addToCart = (product: Product) => {
    const maxStock = Math.max(0, Math.floor(Number(product.stock) || 0));
    if (maxStock <= 0) return;
    const existing = cart.find((item) => item.product.id === product.id);
    const inCart = existing?.quantity ?? 0;
    if (inCart + 1 > maxStock) return;
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(
      cart.map((item) => {
        if (item.product.id !== productId) return item;
        const maxStock = Math.max(0, Math.floor(Number(item.product.stock) || 0));
        const newQty = Math.min(maxStock, Math.max(1, item.quantity + delta));
        return { ...item, quantity: newQty };
      })
    );
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
      const normalizedItems = [...cart]
        .map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.promoPrice ?? item.product.price,
        }))
        .sort((a, b) => a.productId.localeCompare(b.productId));
      const orderIdempotencyKey = buildIdempotencyKey('order', [
        user.id,
        shop.id,
        cartTotal.toFixed(2),
        JSON.stringify(normalizedItems),
      ]);
      const data = await callCreatePayment({
        idempotencyKey: orderIdempotencyKey,
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
          items: normalizedItems,
          total: cartTotal,
        },
      });
      console.log("Asaas Split Order Response:", data);

      const invoiceUrl = pickInvoiceUrl(data as Record<string, unknown>);
      const pix = pickPixQrFromResponse(data as Record<string, unknown>);
      const orderId =
        typeof (data as { orderId?: unknown }).orderId === 'string'
          ? (data as { orderId: string }).orderId
          : undefined;

      if (!pix?.payload && !invoiceUrl) {
        setIsOrderProcessing(false);
        alert('Cobrança criada, mas não foi possível obter o PIX nem o link de pagamento. Tente novamente ou entre em contato.');
        return;
      }

      setIsOrderProcessing(false);
      setInlinePayPix({
        kind: 'order',
        payload: pix?.payload ?? '',
        encodedImage: pix?.encodedImage ?? '',
        invoiceUrl,
        amount: cartTotal,
        recordId: orderId,
        isDuplicate: Boolean((data as { duplicate?: unknown }).duplicate),
      });
      setIsCartOpen(false);
      setOrderPayPhase('pix');
      onRefetchAppointmentsAndOrders?.();
    } catch (error) {
      console.error("Order payment error:", error);
      setIsOrderProcessing(false);
      alert(error instanceof Error ? error.message : 'Erro ao processar pedido com Split Asaas.');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.promoPrice || item.product.price) * item.quantity, 0);

  useEffect(() => {
    if (!inlinePayPix?.recordId) return;
    const recordId = inlinePayPix.recordId;
    const kind = inlinePayPix.kind;
    const table = kind === 'booking' ? 'appointments' : 'orders';
    const channel = supabase
      .channel(`inline-pix-${kind}-${recordId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter: `id=eq.${recordId}`,
        },
        (payload) => {
          const st = (payload.new as { status?: string })?.status;
          if (st === 'PAID') {
            if (kind === 'booking') {
              setBookingPayPhase('approved');
              return;
            }
            setOrderPayPhase('approved');
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [inlinePayPix?.recordId, inlinePayPix?.kind, onBook, onOrder]);

  const PAYMENT_APPROVED_SCREEN_MS = 2200;
  useEffect(() => {
    if (bookingPayPhase !== 'approved') return;
    const t = window.setTimeout(() => {
      setInlinePayPix((prev) => (prev?.kind === 'booking' ? null : prev));
      setBookingPayPhase('idle');
      setStep(1);
      onBook();
    }, PAYMENT_APPROVED_SCREEN_MS);
    return () => window.clearTimeout(t);
  }, [bookingPayPhase, onBook]);

  useEffect(() => {
    if (orderPayPhase !== 'approved') return;
    const t = window.setTimeout(() => {
      setInlinePayPix((prev) => (prev?.kind === 'order' ? null : prev));
      setOrderPayPhase('idle');
      setCart([]);
      setIsCartOpen(false);
      onOrder();
    }, PAYMENT_APPROVED_SCREEN_MS);
    return () => window.clearTimeout(t);
  }, [orderPayPhase, onOrder]);

  function showPixCopiedToast() {
    if (pixCopiedToastTimerRef.current != null) {
      window.clearTimeout(pixCopiedToastTimerRef.current);
    }
    setPixCopiedToast(true);
    pixCopiedToastTimerRef.current = window.setTimeout(() => {
      setPixCopiedToast(false);
      pixCopiedToastTimerRef.current = null;
    }, PIX_COPIED_TOAST_MS);
  }

  async function copyPixPayload(payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      showPixCopiedToast();
    } catch {
      /* sem toast: clipboard pode falhar fora de HTTPS ou sem permissão */
    }
  }

  function renderPixPayPanel(ctx: InlinePayPix, opts?: { showAutoReturnHint?: boolean }) {
    const showHint = opts?.showAutoReturnHint !== false;
    const imgSrc = pixQrImageSrc(ctx.encodedImage);
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-4 text-left">
        {ctx.isDuplicate && (
          <p className="text-amber-800 text-xs font-semibold bg-amber-50 border border-amber-200 rounded-xl p-2">
            Esta cobrança já existia e foi reaproveitada com segurança. Use o mesmo PIX abaixo.
          </p>
        )}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-500">Valor a pagar</p>
          <p className="text-2xl font-black text-indigo-600">R$ {ctx.amount.toFixed(2).replace('.', ',')}</p>
        </div>
        {imgSrc ? (
          <div className="flex justify-center bg-white p-4 rounded-xl border border-gray-100">
            <img src={imgSrc} alt="QR Code PIX" className="w-52 h-52 object-contain" />
          </div>
        ) : null}
        {ctx.payload ? (
          <>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pix copia e cola</p>
            <textarea
              readOnly
              rows={4}
              className="w-full text-[11px] font-mono p-3 rounded-xl border border-gray-200 bg-white leading-relaxed"
              value={ctx.payload}
            />
            <button
              type="button"
              onClick={() => void copyPixPayload(ctx.payload)}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              <i className="fas fa-copy mr-2" />
              Copiar código PIX
            </button>
          </>
        ) : null}
        {ctx.invoiceUrl ? (
          <a
            href={ctx.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-indigo-600 font-semibold hover:underline"
          >
            <i className="fas fa-external-link-alt" />
            Abrir página Asaas (alternativa)
          </a>
        ) : null}
        {showHint ? (
          <p className="text-[10px] text-emerald-900 text-center leading-relaxed">
            Pague no app do seu banco. Quando o pagamento for confirmado, você volta ao <strong>início</strong>{' '}
            automaticamente.
          </p>
        ) : (
          <p className="text-[10px] text-gray-600 text-center leading-relaxed">
            Pague no app do seu banco. Aguarde a confirmação do pagamento.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-gray-500 hover:text-indigo-600 font-medium transition-colors">
        <i className="fas fa-arrow-left"></i> Voltar para busca
      </button>

      <div className="bg-white rounded-4xl overflow-hidden shadow-2xl border border-gray-100">
        {/* Banner */}
        <div className="h-48 md:h-64 relative">
          <img src={shop.bannerImage} className="w-full h-full object-cover" alt="banner" />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent"></div>
          <div className="absolute bottom-6 left-6 flex items-end gap-4 md:gap-6">
            <img src={shop.profileImage} className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-3xl border-4 border-white shadow-xl object-cover" alt="profile" />
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
                            className={`shrink-0 w-16 md:w-20 py-3 md:py-4 rounded-2xl border-2 transition-all flex flex-col items-center ${selectedDate === date ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-gray-100 text-gray-500'}`}
                          >
                            <span className="text-[10px] md:text-xs font-medium uppercase">{new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                            <span className="text-lg md:text-xl font-bold">{new Date(date + 'T12:00:00').getDate()}</span>
                          </button>
                        ))}
                      </div>

                      {selectedDate && (
                        <div className="space-y-2">
                          <p className="text-[11px] text-gray-500">
                            Horários conforme a loja (só contam horários já <strong>pagos</strong>).{' '}
                            <strong>Esgotado</strong> = todos os profissionais ocupados;{' '}
                            <strong>Indisponível</strong> = seu profissional já tem horário nesse horário.
                          </p>
                          {loadingBookingBlocks ? (
                            <p className="text-sm text-gray-400 py-6 text-center">Carregando horários…</p>
                          ) : availableTimes.length === 0 ? (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-4">
                              Não há horários disponíveis nesta data.
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                              {availableTimes.map((t) => {
                                const { fullyBooked, selectedProBusy } = selectedPro
                                  ? slotClientSelectionState(
                                      t,
                                      agendaSlotMinutes,
                                      bookingBlocks,
                                      teamProIds,
                                      selectedPro.id
                                    )
                                  : { fullyBooked: false, selectedProBusy: false };
                                const disabled = Boolean(selectedPro && (fullyBooked || selectedProBusy));
                                const selected = selectedTime === t && !disabled;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                      if (!disabled) setSelectedTime(t);
                                    }}
                                    className={`py-2 md:py-3 rounded-xl border-2 text-xs md:text-sm font-bold transition-all flex flex-col items-center justify-center min-h-13 ${
                                      selected
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : disabled
                                          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-80'
                                          : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'
                                    }`}
                                  >
                                    <span>{t}</span>
                                    {fullyBooked && (
                                      <span className="text-[9px] font-semibold uppercase tracking-wide mt-0.5">
                                        Esgotado
                                      </span>
                                    )}
                                    {selectedProBusy && !fullyBooked && (
                                      <span className="text-[9px] font-semibold uppercase tracking-wide mt-0.5">
                                        Indisponível
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
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
                    {bookingPayPhase === 'approved' ? (
                      <div className="flex flex-col items-center justify-center py-16 md:py-24 px-4 animate-fade-in">
                        <div className="w-24 h-24 md:w-28 md:h-28 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                          <i className="fas fa-check text-5xl md:text-6xl text-green-600" />
                        </div>
                        <h2 className="text-2xl md:text-4xl font-black text-gray-900 text-center tracking-tight">
                          Pagamento Aprovado!
                        </h2>
                        <p className="text-gray-500 mt-3 text-center text-sm md:text-base">
                          Redirecionando para o início…
                        </p>
                      </div>
                    ) : bookingPayPhase === 'pix' && inlinePayPix?.kind === 'booking' ? (
                      <div className="max-w-lg mx-auto px-2 space-y-6">
                        <div className="text-center space-y-1">
                          <h3 className="text-2xl md:text-3xl font-bold text-gray-900">Pague com PIX</h3>
                          <p className="text-sm text-gray-500">
                            {shop.name} · use o QR ou o código abaixo no app do seu banco.
                          </p>
                        </div>
                        {renderPixPayPanel(inlinePayPix, { showAutoReturnHint: false })}
                        <div className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                          <p className="text-sm text-emerald-900 font-semibold flex items-center gap-2">
                            <i className="fas fa-spinner fa-spin text-emerald-600" />
                            Aguardando confirmação do PIX…
                          </p>
                          <p className="text-xs text-gray-600 text-center px-3">
                            Quando o banco confirmar, aparece &quot;Pagamento Aprovado!&quot; e você vai ao início.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900">Resumo e Pagamento</h3>
                      <button
                        type="button"
                        disabled={bookingPayPhase !== 'idle'}
                        onClick={() => setStep(3)}
                        className="text-indigo-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Alterar data
                      </button>
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
                                  type="button"
                                  disabled={bookingPayPhase !== 'idle'}
                                  onClick={() => setTipAmount(amount)}
                                  className={`py-2 rounded-xl border-2 text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
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
                              disabled={bookingPayPhase !== 'idle'}
                              placeholder="Outro valor (R$)"
                              className="w-full p-3 rounded-xl bg-gray-50 border-none text-xs focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
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
                    </div>

                    <button
                      type="button"
                      disabled={
                        isProcessing ||
                        (!isProfileComplete &&
                          ((customerCpf.replace(/\D/g, '').length !== 11 &&
                            customerCpf.replace(/\D/g, '').length !== 14) ||
                            !(paymentCustomerName || user.name || '').trim() ||
                            !(paymentCustomerEmail || user.email || '').trim()))
                      }
                      onClick={handleBooking}
                      className="w-full bg-indigo-600 text-white py-4 md:py-5 rounded-3xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    >
                      {isProcessing ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i> Processando Pagamento...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-shield-check"></i> Finalizar Agendamento
                        </>
                      )}
                    </button>

                    <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-4">
                      Ambiente 100% Seguro
                    </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in space-y-8">
               <div className="flex justify-between items-center">
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Produtos Exclusivos</h3>
                  <div className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold">
                    {liveProducts.length} itens disponíveis
                  </div>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6">
                 {liveProducts.map((product) => {
                   const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
                   const inCartQty = cart.find((c) => c.product.id === product.id)?.quantity ?? 0;
                   const canAddMore = stock > 0 && inCartQty < stock;
                   const outOfStock = stock <= 0;
                   return (
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
                        <p className={`text-[10px] font-bold mt-1 ${outOfStock ? 'text-red-500' : 'text-gray-500'}`}>
                          {outOfStock ? 'Esgotado' : `Estoque: ${stock} un.`}
                        </p>
                        <button
                          type="button"
                          disabled={!canAddMore}
                          onClick={() => addToCart(product)}
                          className={`w-full mt-2 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                            canAddMore
                              ? 'border-indigo-100 text-indigo-600 hover:bg-indigo-600 hover:text-white'
                              : 'border-gray-100 text-gray-400 cursor-not-allowed bg-gray-50'
                          }`}
                        >
                          {outOfStock ? 'Indisponível' : inCartQty >= stock && stock > 0 ? 'Máx. no carrinho' : 'Adicionar'}
                        </button>
                      </div>
                   </div>
                 );})}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart Summary Drawer / Modal */}
      {isCartOpen && orderPayPhase === 'idle' && (
        <div className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm flex justify-end animate-fade-in">
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
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{item.product.category}</p>
                      <div className="flex justify-between items-center pt-2">
                        <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="text-gray-500 hover:text-indigo-600"
                          >
                            <i className="fas fa-minus text-[10px]"></i>
                          </button>
                          <span className="text-sm font-bold text-gray-900 min-w-[20px] text-center">{item.quantity}</span>
                          <button
                            type="button"
                            disabled={item.quantity >= Math.max(0, Math.floor(Number(item.product.stock) || 0))}
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="text-gray-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <i className="fas fa-plus text-[10px]"></i>
                          </button>
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
                </div>

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
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">Pagamento processado por BeautyPay</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Cart Button — full-bleed row + inner max-width (evita conflito translate do bounceIn com centering) */}
      {cart.length > 0 && activeTab === 'STORE' && !isCartOpen && orderPayPhase === 'idle' && (
        <div className="fixed bottom-20 left-0 right-0 z-60 flex justify-center px-3 sm:px-4 md:bottom-6 pointer-events-none">
          <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-3xl bg-slate-900 p-3 text-white shadow-2xl sm:p-4 animate-modal-bounce-in">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <i className="fas fa-shopping-cart text-xl" aria-hidden />
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-900 bg-indigo-500 text-[10px] font-bold">
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Seu Carrinho</p>
                <p className="truncate text-sm font-black">R$ {cartTotal.toFixed(2)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold transition-all hover:bg-indigo-600 sm:px-6"
            >
              Finalizar <i className="fas fa-chevron-right ml-1" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Pedido (loja): tela cheia PIX → Pagamento Aprovado → home */}
      {(orderPayPhase === 'pix' || orderPayPhase === 'approved') &&
        inlinePayPix?.kind === 'order' && (
          <div className="fixed inset-0 z-130 bg-white/97 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
            <div className="w-full max-w-lg py-4">
              {orderPayPhase === 'approved' ? (
                <div className="flex flex-col items-center justify-center py-16 md:py-20 px-4">
                  <div className="w-24 h-24 md:w-28 md:h-28 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <i className="fas fa-check text-5xl md:text-6xl text-green-600" />
                  </div>
                  <h2 className="text-2xl md:text-4xl font-black text-gray-900 text-center tracking-tight">
                    Pagamento Aprovado!
                  </h2>
                  <p className="text-gray-500 mt-3 text-center text-sm md:text-base">
                    Redirecionando para o início…
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-1">
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-900">Pague com PIX</h3>
                    <p className="text-sm text-gray-500">
                      Pedido em <strong>{shop.name}</strong> · use o QR ou o código no app do banco.
                    </p>
                  </div>
                  {renderPixPayPanel(inlinePayPix, { showAutoReturnHint: false })}
                  <div className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-sm text-emerald-900 font-semibold flex items-center gap-2">
                      <i className="fas fa-spinner fa-spin text-emerald-600" />
                      Aguardando confirmação do PIX…
                    </p>
                    <p className="text-xs text-gray-600 text-center px-3">
                      Quando o banco confirmar, aparece &quot;Pagamento Aprovado!&quot; e você vai ao início.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {pixCopiedToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 z-140 -translate-x-1/2 px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-bold shadow-xl animate-fade-in flex items-center gap-2 pointer-events-none"
        >
          <i className="fas fa-check-circle text-emerald-400" aria-hidden />
          PIX copiado!
        </div>
      ) : null}
    </div>
  );
};

export default ShopDetails;
