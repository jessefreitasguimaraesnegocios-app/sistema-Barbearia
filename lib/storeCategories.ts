import type { Product, StoreCategory } from '../types';

export const DEFAULT_STORE_CATEGORIES: StoreCategory[] = [
  { key: 'products', name: 'Produtos', icon: 'fas fa-tags' },
  { key: 'fashion', name: 'Moda', icon: 'fas fa-shirt' },
  { key: 'food', name: 'Food', icon: 'fas fa-utensils' },
  { key: 'electronics', name: 'Eletrônicos', icon: 'fas fa-mobile-screen-button' },
];

export const STORE_CATEGORY_ICON_OPTIONS: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: 'fas fa-tags', label: 'Geral' },
  { icon: 'fas fa-shirt', label: 'Moda' },
  { icon: 'fas fa-utensils', label: 'Comida' },
  { icon: 'fas fa-mug-hot', label: 'Bebidas' },
  { icon: 'fas fa-mobile-screen-button', label: 'Celular' },
  { icon: 'fas fa-laptop', label: 'Notebook' },
  { icon: 'fas fa-gamepad', label: 'Games' },
  { icon: 'fas fa-gift', label: 'Presentes' },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeStoreCategories(raw: unknown): StoreCategory[] {
  const incoming = Array.isArray(raw) ? raw : [];
  const parsed = incoming
    .map((item): StoreCategory | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { key?: unknown; name?: unknown; icon?: unknown };
      const key = typeof row.key === 'string' ? row.key.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const icon = typeof row.icon === 'string' ? row.icon.trim() : '';
      if (!key || !name || !icon) return null;
      return { key, name, icon };
    })
    .filter((item): item is StoreCategory => item != null);

  if (!parsed.length) return DEFAULT_STORE_CATEGORIES.map((item) => ({ ...item }));

  const byKey = new Map(parsed.map((item) => [item.key, item]));
  return DEFAULT_STORE_CATEGORIES.map((base) => {
    const custom = byKey.get(base.key);
    return custom ? { ...custom } : { ...base };
  });
}

export function resolveStoreCategoryKeyForProduct(
  product: Product,
  storeCategories: StoreCategory[]
): string {
  const norm = normalizeText(product.category || '');
  if (!norm) return storeCategories[0]?.key ?? DEFAULT_STORE_CATEGORIES[0].key;

  const exact = storeCategories.find((cat) => normalizeText(cat.name) === norm);
  if (exact) return exact.key;

  const fallbackByKeyword = storeCategories.find((cat) => {
    const catName = normalizeText(cat.name);
    if (cat.key === 'fashion') return /moda|roupa|camisa|tenis|vestuario/.test(norm) || /moda/.test(catName);
    if (cat.key === 'food') return /food|comida|bebida|lanche|suco|refeicao/.test(norm) || /food|comida/.test(catName);
    if (cat.key === 'electronics')
      return /eletron|eletronic|celular|pc|computador|notebook|acessorio tech/.test(norm) || /eletron/.test(catName);
    return false;
  });

  return fallbackByKeyword?.key ?? storeCategories[0]?.key ?? DEFAULT_STORE_CATEGORIES[0].key;
}
