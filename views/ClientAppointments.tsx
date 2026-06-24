import React, { useEffect, useState } from 'react';
import { Appointment, Shop, User } from '../types';
import { isClientListVisibleAppointment } from '../lib/clientAppointmentVisibility';
import { supabase } from '../src/lib/supabase';

function ShopAppointmentThumb({
  shop,
  dimmed,
  size = 'md',
}: {
  shop: Shop | undefined;
  dimmed: boolean;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = shop?.profileImage?.trim();
  const isSmall = size === 'sm';
  const wrap = `${isSmall ? 'w-12 h-12 rounded-xl' : 'w-20 h-20 rounded-2xl'} shrink-0 border border-gray-100 bg-gray-50 transition-all overflow-hidden ${
    dimmed ? 'scale-90 opacity-50' : ''
  }`;

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt=""
        className={`${wrap} object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={`${wrap} flex items-center justify-center text-indigo-600 ${isSmall ? 'text-lg' : 'text-2xl'}`}>
      <i
        className={
          shop?.type === 'BARBER'
            ? 'fas fa-cut'
            : shop?.type === 'MANICURE'
              ? 'fas fa-hand-sparkles'
              : 'fas fa-heart'
        }
      />
    </div>
  );
}

interface ClientAppointmentsProps {
  appointments: Appointment[];
  shops: Shop[];
  user: User;
  onCancel: (id: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

const ClientAppointments: React.FC<ClientAppointmentsProps> = ({
  appointments,
  shops,
  user,
  onCancel,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) => {
  const userApts = appointments
    .filter((a) => a.clientId === user.id)
    .filter((a) => isClientListVisibleAppointment(a));
  const [serviceNameById, setServiceNameById] = useState<Record<string, string>>({});
  const [cancelConfirmAptId, setCancelConfirmAptId] = useState<string | null>(null);
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);

  useEffect(() => {
    const serviceIds: string[] = Array.from(
      new Set(
        userApts
          .map((a) => String(a.serviceId || '').trim())
          .filter((id): id is string => id.length > 0)
      )
    );
    if (!serviceIds.length) {
      setServiceNameById({});
      return;
    }

    const fromShops: Record<string, string> = {};
    for (const shop of shops) {
      for (const s of shop.services ?? []) {
        if (s?.id) fromShops[s.id] = s.name || 'Serviço';
      }
    }

    const missing = serviceIds.filter((id) => !fromShops[id]);
    if (!missing.length) {
      setServiceNameById(fromShops);
      return;
    }

    let cancelled = false;
    const loadMissingServiceNames = async () => {
      const { data, error } = await supabase.from('services').select('id, name').in('id', missing);
      if (error || cancelled) return;
      const merged = { ...fromShops };
      for (const row of (data ?? []) as Array<{ id?: unknown; name?: unknown }>) {
        const id = typeof row.id === 'string' ? row.id : '';
        if (!id) continue;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        merged[id] = name || 'Serviço';
      }
      setServiceNameById(merged);
    };
    void loadMissingServiceNames();
    return () => {
      cancelled = true;
    };
  }, [shops, userApts]);

  const handleCancel = (apt: Appointment) => {
    onCancel(apt.id);
    setCancelConfirmAptId(null);
  };

  const cancelConfirmApt = cancelConfirmAptId ? userApts.find((a) => a.id === cancelConfirmAptId) ?? null : null;
  const cancelConfirmShop = cancelConfirmApt ? shops.find((s) => s.id === cancelConfirmApt.shopId) : undefined;

  const selectedAptShop = selectedApt ? shops.find((s) => s.id === selectedApt.shopId) : undefined;
  const selectedAptServiceName = selectedApt
    ? selectedAptShop?.services.find((s) => s.id === selectedApt.serviceId)?.name ??
      serviceNameById[selectedApt.serviceId] ??
      'Serviço'
    : '';
  const selectedAptPro = selectedApt
    ? selectedAptShop?.professionals.find((p) => p.id === selectedApt.professionalId)
    : undefined;

  const statusBadgeClass = (status: Appointment['status']) =>
    status === 'PAID'
      ? 'bg-green-100 text-green-600'
      : status === 'PENDING'
        ? 'bg-amber-100 text-amber-600'
        : 'bg-gray-100 text-gray-400';

  const statusLabel = (status: Appointment['status']) =>
    status === 'PAID' ? 'Pago' : status === 'PENDING' ? 'Aguardando pagamento' : status;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900 dark:text-white">Meus Agendamentos</h2>
        <p className="text-gray-500 dark:text-zinc-400">Acompanhe seus horários e serviços marcados.</p>
        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
          Atendimentos concluídos ficam visíveis só até o fim do dia do serviço (horário de Brasília).
        </p>
      </header>

      {userApts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userApts.map(apt => {
            const shop = shops.find(s => s.id === apt.shopId);
            const service = shop?.services.find(s => s.id === apt.serviceId);
            const serviceName = service?.name ?? serviceNameById[apt.serviceId] ?? 'Serviço';
            const pro = shop?.professionals.find(p => p.id === apt.professionalId);

            return (
              <div
                key={apt.id}
                className={`bg-white p-6 rounded-4xl border border-gray-100 shadow-sm flex flex-col gap-4 hover:shadow-lg transition-shadow relative overflow-hidden min-w-0 ${apt.status === 'CANCELLED' ? 'opacity-75 grayscale-[0.5]' : ''}`}
              >
                {apt.status === 'CANCELLED' && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex items-center justify-center animate-fade-in">
                    <div className="bg-white text-red-600 px-6 py-3 rounded-full font-black uppercase tracking-widest border-2 border-red-500 rotate-[-5deg] shadow-2xl animate-bounce-in flex items-center gap-2">
                      <i className="fas fa-times-circle"></i> Cancelado
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <ShopAppointmentThumb shop={shop} dimmed={apt.status === 'CANCELLED'} size="sm" />
                    <div className="min-w-0">
                      <h3
                        className={`font-bold text-gray-900 dark:text-white truncate transition-all ${apt.status === 'CANCELLED' ? 'line-through decoration-red-500 decoration-2' : ''}`}
                      >
                        {shop?.name}
                      </h3>
                      <p
                        className={`text-xs transition-all ${apt.status === 'CANCELLED' ? 'opacity-50' : ''}`}
                      >
                        <span className="text-gray-500 dark:text-cyan-400">{apt.time}</span>
                        <span className="text-gray-400 dark:text-zinc-500"> · </span>
                        <span className="text-gray-500 dark:text-white">{serviceName}</span>
                        <span className="text-gray-400 dark:text-zinc-500"> com </span>
                        <span className="text-gray-900 dark:text-white font-medium">{pro?.name}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${statusBadgeClass(apt.status)}`}
                  >
                    {statusLabel(apt.status)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-50 dark:border-zinc-800">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 dark:text-cyan-400 font-bold uppercase">Data</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{apt.date}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-xs text-gray-400 dark:text-cyan-400 font-bold uppercase">Valor</p>
                    <p className="text-lg font-black text-indigo-600 dark:text-white">R$ {apt.amount.toFixed(2)}</p>
                  </div>
                </div>

                {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    onClick={() => setCancelConfirmAptId(apt.id)}
                    className="md:hidden text-red-500 text-[10px] font-bold uppercase tracking-widest hover:text-red-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <i className="fas fa-times-circle"></i> Cancelar Agendamento
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedApt(apt)}
                  className="hidden md:flex w-full mt-2 bg-gray-50 hover:bg-indigo-50 text-indigo-600 py-3 rounded-xl text-sm font-bold transition-all items-center justify-center gap-2"
                >
                  <i className="fas fa-eye"></i> Detalhes do Agendamento
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {userApts.length > 0 && hasMore && onLoadMore ? (
        <div className="flex justify-center pt-6">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-2xl border border-gray-200 bg-white px-8 py-3 text-sm font-bold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <i className="fas fa-spinner fa-spin" /> Carregando…
              </span>
            ) : (
              'Carregar mais agendamentos'
            )}
          </button>
        </div>
      ) : null}
      {userApts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-4xl border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            <i className="far fa-calendar-times"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-900">Nenhum agendamento ativo</h3>
          <p className="text-gray-500 mt-2 max-w-xs mx-auto">Você ainda não agendou nenhum serviço. Procure por uma barbearia ou salão e marque seu horário!</p>
          <button className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100">Explorar Estabelecimentos</button>
        </div>
      ) : null}

      {selectedApt ? (
        <div className="fixed inset-0 z-110 hidden md:flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white w-full max-w-md mx-auto my-auto rounded-[2.5rem] shadow-2xl overflow-hidden animate-modal-bounce-in shrink-0">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Detalhes do Agendamento</h3>
              <button
                type="button"
                onClick={() => setSelectedApt(null)}
                className="text-gray-400 hover:text-gray-900 p-2"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <ShopAppointmentThumb shop={selectedAptShop} dimmed={selectedApt.status === 'CANCELLED'} />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{selectedAptShop?.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    {selectedAptServiceName} com{' '}
                    <span className="text-gray-900 dark:text-white font-medium">{selectedAptPro?.name}</span>
                  </p>
                  <span
                    className={`inline-block mt-2 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${statusBadgeClass(selectedApt.status)}`}
                  >
                    {statusLabel(selectedApt.status)}
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 space-y-3">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500 dark:text-cyan-400">Data</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{selectedApt.date}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500 dark:text-cyan-400">Horário</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{selectedApt.time}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500 dark:text-cyan-400">Serviço</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{selectedAptServiceName}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-500 dark:text-cyan-400">Profissional</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{selectedAptPro?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xl pt-4 border-t border-gray-200 dark:border-zinc-700">
                  <span className="font-bold text-gray-900 dark:text-cyan-400">Valor</span>
                  <span className="font-black text-indigo-600 dark:text-white">R$ {selectedApt.amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-cyan-500/10 p-4 rounded-2xl flex items-center gap-3">
                <i className="fas fa-info-circle text-indigo-600 dark:text-cyan-400" aria-hidden />
                <p className="text-[10px] text-indigo-600 dark:text-cyan-300 font-bold uppercase leading-tight">
                  Chegue com alguns minutos de antecedência. Em caso de cancelamento, 50% do valor será reembolsado.
                </p>
              </div>

              {selectedApt.status !== 'CANCELLED' && selectedApt.status !== 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedApt(null);
                    setCancelConfirmAptId(selectedApt.id);
                  }}
                  className="w-full text-red-500 text-xs font-bold uppercase tracking-widest hover:text-red-700 transition-colors flex items-center justify-center gap-2 py-2"
                >
                  <i className="fas fa-times-circle"></i> Cancelar Agendamento
                </button>
              )}
            </div>

            <div className="p-6 pt-0">
              <button
                type="button"
                onClick={() => setSelectedApt(null)}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelConfirmApt ? (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-4xl border border-gray-100 bg-white shadow-2xl overflow-hidden animate-modal-bounce-in">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-black text-red-600">ATENÇÃO</h3>
              <p className="mt-3 text-sm text-gray-700">
                Tem certeza que deseja cancelar seu agendamento na <strong>{cancelConfirmShop?.name ?? 'loja'}</strong>?
              </p>
              <p className="mt-3 text-sm text-gray-700">
                Importante: Conforme nossa política, apenas 50% do valor (
                <strong>R$ {(cancelConfirmApt.amount / 2).toFixed(2)}</strong>) será reembolsado.
              </p>
            </div>
            <div className="p-6 pt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelConfirmAptId(null)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCancel(cancelConfirmApt)}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 inline-flex items-center gap-2"
              >
                <i className="fas fa-times-circle" />
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ClientAppointments;
