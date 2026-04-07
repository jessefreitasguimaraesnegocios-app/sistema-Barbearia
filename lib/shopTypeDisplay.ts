import type { ShopType } from '../types';

export function shopTypeShortLabel(type: ShopType): string {
  switch (type) {
    case 'BARBER':
      return 'Barbearia';
    case 'SALON':
      return 'Salão';
    case 'MANICURE':
      return 'Manicure';
    default:
      return 'Estabelecimento';
  }
}

/** Badge no catálogo (fundo escuro sobre foto) */
export function shopTypeCatalogBadgeClass(type: ShopType): string {
  switch (type) {
    case 'BARBER':
      return 'bg-slate-900';
    case 'SALON':
      return 'bg-pink-600';
    case 'MANICURE':
      return 'bg-teal-600';
    default:
      return 'bg-gray-700';
  }
}

/** Pill na tabela admin */
export function shopTypeAdminPillClass(type: ShopType): string {
  switch (type) {
    case 'BARBER':
      return 'bg-slate-900 text-white';
    case 'SALON':
      return 'bg-pink-100 text-pink-600';
    case 'MANICURE':
      return 'bg-teal-100 text-teal-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}
