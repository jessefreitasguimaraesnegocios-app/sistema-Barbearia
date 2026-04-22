import React, { useEffect, useMemo, useState } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';

type OwnerProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

interface AdminOwnerWhatsAppProps {
  shops: Shop[];
  shopsHasMore: boolean;
  onLoadMoreShops: () => void | Promise<void>;
}

function onlyDigits(value: string | undefined | null): string {
  return String(value || '').replace(/\D/g, '');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: string | undefined | null): id is string {
  return Boolean(id && id !== 'undefined' && UUID_RE.test(id));
}

function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = onlyDigits(raw);
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/** Abre wa.me no mesmo gesto do clique (alguns mobile browsers bloqueiam `window.open`). */
function openWhatsAppUrl(digits: string) {
  const url = `https://wa.me/${digits}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function AdminOwnerWhatsApp({ shops, shopsHasMore, onLoadMoreShops }: AdminOwnerWhatsAppProps) {
  const [ownerProfilesById, setOwnerProfilesById] = useState<Map<string, OwnerProfileRow>>(new Map());
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [ownersLoadError, setOwnersLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const ownerIds = [...new Set(shops.map((s) => s.ownerId).filter(isValidUuid))];
    if (!ownerIds.length) {
      setOwnerProfilesById(new Map());
      setOwnersLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadingOwners(true);
    setOwnersLoadError(null);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', ownerIds);
        if (cancelled) return;
        if (error) {
          setOwnerProfilesById(new Map());
          setOwnersLoadError(error.message || 'Não foi possível carregar telefones (permissão/RLS).');
          return;
        }
        const map = new Map<string, OwnerProfileRow>();
        for (const row of (data ?? []) as OwnerProfileRow[]) {
          map.set(String(row.id), row);
        }
        setOwnerProfilesById(map);
        if (map.size < ownerIds.length) {
          setOwnersLoadError(
            'Alguns contatos não retornaram (RLS). O telefone da loja aparece quando existir em «shops.phone».'
          );
        }
      } finally {
        if (!cancelled) setLoadingOwners(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shops]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = shops.map((shop) => {
      const owner = ownerProfilesById.get(shop.ownerId);
      const ownerName = owner?.full_name?.trim() || shop.name;
      const ownerPhoneRaw = owner?.phone?.trim() || shop.phone || '';
      const normalized = normalizeWhatsAppNumber(ownerPhoneRaw);
      return {
        shopId: shop.id,
        shopName: shop.name,
        ownerName,
        ownerPhoneRaw,
        whatsappDigits: normalized,
      };
    });
    if (!query) return base;
    return base.filter((row) =>
      row.shopName.toLowerCase().includes(query) ||
      row.ownerName.toLowerCase().includes(query) ||
      row.ownerPhoneRaw.toLowerCase().includes(query)
    );
  }, [ownerProfilesById, search, shops]);

  const openWhatsApp = (digits: string) => {
    openWhatsAppUrl(digits);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h2 className="text-3xl font-display font-bold text-gray-900">Contatos WhatsApp</h2>
        <p className="text-gray-500">Fale rapidamente com os donos dos estabelecimentos.</p>
      </header>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <i className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Buscar por estabelecimento, dono ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <div className="text-xs text-gray-500">{rows.length} contatos exibidos</div>
        </div>

        {ownersLoadError ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            {ownersLoadError}
          </div>
        ) : null}

        {loadingOwners ? (
          <div className="py-10 text-center text-sm text-gray-500">
            <i className="fas fa-spinner fa-spin mr-2" />
            Carregando contatos...
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <div
                key={row.shopId}
                className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{row.ownerName}</p>
                  <p className="truncate text-xs text-gray-500">{row.shopName}</p>
                  <p className="mt-1 text-xs text-gray-600">{row.ownerPhoneRaw || 'Telefone não informado'}</p>
                </div>
                <button
                  type="button"
                  disabled={!row.whatsappDigits}
                  onClick={() => row.whatsappDigits && openWhatsApp(row.whatsappDigits)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className="fab fa-whatsapp" />
                  Abrir WhatsApp
                </button>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Nenhum contato encontrado para este filtro.
              </div>
            )}
          </div>
        )}

        {shopsHasMore ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => void onLoadMoreShops()}
              className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Carregar mais estabelecimentos
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
