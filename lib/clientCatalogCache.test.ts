import { describe, it, expect } from 'vitest';
import type { ClientCatalogEntry } from '../services/supabase/shops';
import { mergeCatalogEntries, computeMaxRowUpdatedAt, entriesToShops } from './clientCatalogCache';

function entry(id: string, name: string, ts: string): ClientCatalogEntry {
  return {
    rowUpdatedAt: ts,
    shop: {
      id,
      ownerId: 'o',
      name,
      type: 'BARBER',
      description: '',
      address: '',
      profileImage: '',
      bannerImage: '',
      primaryColor: '#000',
      theme: 'MODERN',
      services: [],
      professionals: [],
      products: [],
      subscriptionActive: true,
      rating: 5,
    },
  };
}

describe('clientCatalogCache', () => {
  it('mergeCatalogEntries replaces by shop id and sorts by name', () => {
    const a = [entry('1', 'Beta', '2026-01-01T00:00:00Z'), entry('2', 'Alpha', '2026-01-02T00:00:00Z')];
    const b = [entry('1', 'Beta Novo', '2026-01-03T00:00:00Z')];
    const m = mergeCatalogEntries(a, b);
    expect(m.map((e) => e.shop.id)).toEqual(['2', '1']);
    expect(m.find((e) => e.shop.id === '1')?.shop.name).toBe('Beta Novo');
  });

  it('computeMaxRowUpdatedAt picks latest ISO', () => {
    const m = computeMaxRowUpdatedAt([
      entry('1', 'A', '2026-01-01T00:00:00Z'),
      entry('2', 'B', '2026-06-01T00:00:00Z'),
    ]);
    expect(m).toBe('2026-06-01T00:00:00Z');
  });

  it('entriesToShops maps shops only', () => {
    const e = [entry('1', 'Loja', '2026-01-01T00:00:00Z')];
    expect(entriesToShops(e)).toEqual([e[0].shop]);
  });
});
