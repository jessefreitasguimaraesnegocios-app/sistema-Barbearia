
export type UserRole = 'ADMIN' | 'SHOP' | 'CLIENT';
export type ShopType = 'BARBER' | 'SALON';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  shopId?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // in minutes
}

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  promoPrice?: number;
  category: string;
  image: string;
  stock: number;
}

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  type: ShopType;
  description: string;
  address: string;
  profileImage: string;
  bannerImage: string;
  primaryColor: string;
  theme: 'MODERN' | 'CLASSIC' | 'LUXURY';
  services: Service[];
  professionals: Professional[];
  products: Product[];
  subscriptionActive: boolean;
  subscriptionAmount?: number;
  rating: number;
  asaasWalletId?: string;
  asaasAccountId?: string;
  asaasApiKey?: string;
  cnpjOrCpf?: string;
  email?: string;
  phone?: string;
  pixKey?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  shopId: string;
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  status: 'PENDING' | 'PAID' | 'COMPLETED' | 'CANCELLED';
  amount: number;
  tip?: number;
}

export interface Order {
  id: string;
  clientId: string;
  shopId: string;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
  status: 'PAID' | 'DELIVERED';
  date: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'SUCCESS' | 'INFO' | 'WARNING';
  timestamp: Date;
  read: boolean;
}
