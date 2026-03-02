
import { Shop, Service, Professional, User, Product } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Admin Master', email: 'admin@beauty.com', role: 'ADMIN' },
  { id: '2', name: 'Ricardo Barber', email: 'ricardo@barber.com', role: 'SHOP' },
  { id: '3', name: 'Elena Beauty', email: 'elena@salon.com', role: 'SHOP' },
  { id: '4', name: 'João Cliente', email: 'joao@user.com', role: 'CLIENT' },
];

export const MOCK_SERVICES: Service[] = [
  { id: 's1', name: 'Corte Social', description: 'Corte tradicional com tesoura e máquina.', price: 45, duration: 40 },
  { id: 's2', name: 'Barba Completa', description: 'Modelagem de barba com toalha quente.', price: 35, duration: 30 },
  { id: 's3', name: 'Mechas Californianas', description: 'Tratamento de cor premium.', price: 250, duration: 120 },
  { id: 's4', name: 'Manicure & Pedicure', description: 'Cuidado completo para unhas.', price: 80, duration: 60 },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: 'pr1', name: 'Pomada Modeladora', description: 'Efeito Matte de alta fixação.', price: 45, promoPrice: 39.90, category: 'Cabelo', image: 'https://images.unsplash.com/photo-1585232350744-974ba78096de?q=80&w=2070', stock: 20 },
  { id: 'pr2', name: 'Óleo para Barba', description: 'Hidratação profunda e brilho.', price: 30, category: 'Barba', image: 'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=1974', stock: 15 },
  { id: 'pr3', name: 'Shampoo Matizador', description: 'Para loiros perfeitos.', price: 120, promoPrice: 95, category: 'Cabelo', image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?q=80&w=2070', stock: 10 },
  { id: 'pr4', name: 'Kit Skin Care', description: 'Limpeza e tonificação.', price: 180, category: 'Rosto', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1974', stock: 5 },
];

export const MOCK_PROFESSIONALS: Professional[] = [
  { id: 'p1', name: 'Carlos Silva', specialty: 'Mestre Barbeiro', avatar: 'https://picsum.photos/200?random=11' },
  { id: 'p2', name: 'Juliana Costa', specialty: 'Colorista', avatar: 'https://picsum.photos/200?random=12' },
  { id: 'p3', name: 'Marcos Oliver', specialty: 'Especialista em Fade', avatar: 'https://picsum.photos/200?random=13' },
];

export const MOCK_SHOPS: Shop[] = [
  {
    id: 'sh1',
    ownerId: '2',
    name: 'Vintage Barber Shop',
    type: 'BARBER',
    description: 'O melhor corte da cidade com estilo clássico e atendimento moderno.',
    address: 'Av. Paulista, 1000 - SP',
    profileImage: 'https://picsum.photos/400?random=1',
    bannerImage: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2070&auto=format&fit=crop',
    primaryColor: '#1a1a1a',
    theme: 'CLASSIC',
    services: [MOCK_SERVICES[0], MOCK_SERVICES[1]],
    professionals: [MOCK_PROFESSIONALS[0], MOCK_PROFESSIONALS[2]],
    products: [MOCK_PRODUCTS[0], MOCK_PRODUCTS[1]],
    subscriptionActive: true,
    rating: 4.9,
    asaasWalletId: 'wallet_sh1_mock_id',
    subscriptionAmount: 99
  },
  {
    id: 'sh2',
    ownerId: '3',
    name: 'Lumière Beauty Salon',
    type: 'SALON',
    description: 'Realçando sua beleza natural com as melhores técnicas internacionais.',
    address: 'Rua Oscar Freire, 500 - SP',
    profileImage: 'https://picsum.photos/400?random=2',
    bannerImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1974&auto=format&fit=crop',
    primaryColor: '#db2777',
    theme: 'MODERN',
    services: [MOCK_SERVICES[2], MOCK_SERVICES[3]],
    professionals: [MOCK_PROFESSIONALS[1]],
    products: [MOCK_PRODUCTS[2], MOCK_PRODUCTS[3]],
    subscriptionActive: true,
    rating: 4.8,
    asaasWalletId: 'wallet_sh2_mock_id',
    subscriptionAmount: 99
  }
];
