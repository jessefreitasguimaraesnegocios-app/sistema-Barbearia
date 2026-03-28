
export type UserRole = 'ADMIN' | 'SHOP' | 'CLIENT';
export type ShopType = 'BARBER' | 'SALON';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  shopId?: string;
  /** CPF ou CNPJ (somente dígitos) – vindo do perfil para PIX */
  cpfCnpj?: string;
  /** Telefone (somente dígitos) – vindo do perfil para PIX */
  phone?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // in minutes
  /** Com repasse de taxas: valor líquido que o parceiro quer receber (persistido no banco) */
  desiredNetReceipt?: number;
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
  /** Com repasse de taxas: valor líquido que o parceiro quer receber (persistido no banco) */
  desiredNetReceipt?: number;
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
  splitPercent?: number;
  /** Se true, na edição de serviços o parceiro informa "valor a receber" e o app calcula o preço mínimo a cobrar (taxa + Asaas), arredondado em R$ 0,50 */
  passFeesToCustomer?: boolean;
  rating: number;
  asaasWalletId?: string;
  asaasAccountId?: string;
  asaasApiKey?: string;
  /** Apenas para exibição no admin: true se a loja tem chave da subconta configurada (não envia a chave ao cliente) */
  asaasApiKeyConfigured?: boolean;
  cnpjOrCpf?: string;
  email?: string;
  phone?: string;
  pixKey?: string;
  /** Início do expediente (HH:MM) — agenda parceiro */
  workdayStart?: string;
  workdayEnd?: string;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  /** Intervalo entre faixas de horário na grade (minutos) */
  agendaSlotMinutes?: number;
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

/** Agendamento com dados do cliente para a área Agenda (parceiro) */
export interface PartnerAgendaAppointment extends Appointment {
  clientDisplayName: string;
  clientPhone: string | null;
}

export interface Order {
  id: string;
  clientId: string;
  shopId: string;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
  status: 'PENDING' | 'PAID' | 'DELIVERED';
  date: string;
}

/** Pedido da lojinha com dados do cliente (área do parceiro). */
export interface ShopPartnerOrderRow extends Order {
  createdAtIso: string;
  clientDisplayName: string;
  clientAvatarUrl: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'SUCCESS' | 'INFO' | 'WARNING';
  timestamp: Date;
  read: boolean;
}
