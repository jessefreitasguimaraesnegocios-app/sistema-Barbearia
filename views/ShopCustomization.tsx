
import React, { useState, useRef } from 'react';
import type { Shop, Product, Service, Professional, ShopType } from '../types';
import { shopPrimaryStyleVars } from '../lib/shopBrandCss';
import {
  brazilWhatsappMeUrl,
  formatBrazilCpfCnpj,
  formatBrazilPhone,
  normalizeLoginEmailInput,
} from '../lib/brInputMasks';
import { supabase } from '../src/lib/supabase';
import { uploadShopMediaAndGetPublicUrl } from '../lib/shopMediaUpload';

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const ASAAS_FEE = 1.99;

/** Tipos de serviço padronizados — barbearia (nome exibido e salvo em `Service.name`) */
const BARBER_STANDARD_SERVICE_OPTIONS: readonly string[] = [
  'Corte',
  'Corte+barba',
  'Corte+barba+sombrancelha',
  'Barba completa',
  'Barba+pezinho',
  'Barba+sombrancelha',
  'Barba+sombrancelha+pezinho',
  'Pezinho',
  'Pezinho+sombrancelha',
  'Pintura',
  'Pintura+corte',
  'Pintura+barba',
  'Pintura+barba+pezinho',
  'Pintura+barba+corte',
];

/** Presets para salão — nome + descrição sugerida ao adicionar o serviço */
const SALON_STANDARD_SERVICES: readonly { name: string; description: string }[] = [
  {
    name: 'Corte feminino',
    description: 'Corte personalizado (curto, médio, longo, franja).',
  },
  {
    name: 'Coloração (tintura)',
    description: 'Mudança de cor completa ou retoque de raiz.',
  },
  {
    name: 'Luzes / mechas / loiro',
    description:
      'Morena iluminada, balayage, platinado. Um dos serviços mais procurados hoje.',
  },
  {
    name: 'Escova (modelagem)',
    description: 'Escova lisa, ondulada, volumosa.',
  },
  {
    name: 'Tratamentos capilares',
    description:
      'Hidratação, nutrição, reconstrução. Essencial para recuperar cabelo danificado.',
  },
  {
    name: 'Progressiva / alisamento',
    description: 'Redução de volume e alisamento químico.',
  },
  {
    name: 'Penteados',
    description: 'Casamento, formatura, eventos.',
  },
  {
    name: 'Manicure e pedicure',
    description: 'Esmaltação comum e em gel.',
  },
  {
    name: 'Design de sobrancelhas',
    description: 'Limpeza, henna, modelagem.',
  },
  {
    name: 'Maquiagem profissional',
    description: 'Social, festa, noiva.',
  },
];

/** Presets para estúdio de manicure / nail design */
const MANICURE_STANDARD_SERVICES: readonly { name: string; description: string }[] = [
  { name: 'Manicure tradicional', description: 'Corte de cutículas, limpeza e esmaltação comum.' },
  { name: 'Manicure em gel', description: 'Esmaltação em gel com maior durabilidade e brilho.' },
  { name: 'Alongamento de unhas', description: 'Fibra, gel ou acrílico conforme técnica do espaço.' },
  { name: 'Manutenção de alongamento', description: 'Preenchimento, reforço e alinhamento das unhas.' },
  { name: 'Pedicure tradicional', description: 'Limpeza, hidratação dos pés e esmaltação.' },
  { name: 'Pedicure spa', description: 'Tratamento completo com esfoliação, massagem e cuidado intensivo.' },
  { name: 'Nail art / decoração', description: 'Desenhos, pedrarias, degradê e personalização.' },
  { name: 'Francesinha / baby boomer', description: 'Acabamento clássico ou em degradê suave.' },
  { name: 'Remoção de gel', description: 'Remoção segura de esmaltação em gel ou alongamento.' },
  { name: 'Spa das mãos', description: 'Hidratação profunda, parafina ou máscaras revitalizantes.' },
];

function presetServicesWithDescription(
  shopType: ShopType
): readonly { name: string; description: string }[] | null {
  if (shopType === 'SALON') return SALON_STANDARD_SERVICES;
  if (shopType === 'MANICURE') return MANICURE_STANDARD_SERVICES;
  return null;
}

function standardServiceNamesForType(shopType: ShopType): readonly string[] {
  const presets = presetServicesWithDescription(shopType);
  if (presets) return presets.map((s) => s.name);
  return BARBER_STANDARD_SERVICE_OPTIONS;
}

function normalizeServiceTypeName(s: string): string {
  return s.trim().toLowerCase();
}

function isStandardServiceName(name: string, shopType: ShopType): boolean {
  const n = normalizeServiceTypeName(name);
  const presets = presetServicesWithDescription(shopType);
  if (presets) return presets.some((s) => normalizeServiceTypeName(s.name) === n);
  return BARBER_STANDARD_SERVICE_OPTIONS.some((opt) => normalizeServiceTypeName(opt) === n);
}

/** Se o nome for equivalente a um tipo padrão, retorna o rótulo canônico */
function matchStandardServiceName(name: string, shopType: ShopType): string | null {
  const n = normalizeServiceTypeName(name);
  const presets = presetServicesWithDescription(shopType);
  if (presets) {
    const hit = presets.find((s) => normalizeServiceTypeName(s.name) === n);
    return hit?.name ?? null;
  }
  const hit = BARBER_STANDARD_SERVICE_OPTIONS.find((opt) => normalizeServiceTypeName(opt) === n);
  return hit ?? null;
}

/** 15 min até 3 h, de 15 em 15 */
const SERVICE_DURATION_MINUTES: readonly number[] = Array.from({ length: 12 }, (_, i) => (i + 1) * 15);

function snapServiceDurationToSlot(minutes: number): number {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return 30;
  const clamped = Math.min(180, Math.max(15, n));
  return Math.round(clamped / 15) * 15;
}

function formatServiceDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 h' : `${h} h`;
  return `${h} h ${m}`;
}

/**
 * Preço ao cliente: centavos abaixo de ,50 → sobe para ,50 no mesmo real (ex. 106,30 → 106,50);
 * de ,50 a ,99 → próximo real inteiro (ex. 106,99 → 107).
 */
function roundCustomerChargeBRL(value: number): number {
  const x = Math.round(value * 100) / 100;
  const intPart = Math.trunc(x);
  const frac = x - intPart;
  if (frac <= 1e-9) return intPart;
  if (frac < 0.5 - 1e-9) return intPart + 0.5;
  return intPart + 1;
}

/** Calcula o preço mínimo a cobrar: líquido desejado + taxa plataforma (%) + R$ 1,99 Asaas, com arredondamento para o cliente (regra ,50 / próximo real) */
function calcMinPrice(valorReceber: number, platformFeePct: number): number {
  const raw = valorReceber * (1 + platformFeePct / 100) + ASAAS_FEE;
  return roundCustomerChargeBRL(raw);
}

/** Reverso: a partir do preço final (já arredondado), estima o "valor a receber" para exibição quando não temos o valor digitado */
function reverseCalcNetReceipt(priceCharged: number, platformFeePct: number): number {
  const raw = (priceCharged - ASAAS_FEE) / (1 + platformFeePct / 100);
  return Math.round(raw * 100) / 100;
}

function dedupeServices(services: Service[]): Service[] {
  const seen = new Set<string>();
  return services.filter((s) => {
    const k = normalizeServiceTypeName(s.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function dedupeProfessionals(pros: Professional[]): Professional[] {
  const seen = new Set<string>();
  return pros.filter((p) => {
    const k = `${(p.name || '').trim()}|${(p.specialty || '').trim()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    const k = `${(p.name || '').trim()}|${p.price}|${(p.category || 'Geral').trim()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface ShopCustomizationProps {
  shop: Shop;
  onSave: (shop: Shop) => void | Promise<void>;
  /** Após criar login de funcionário, recarrega profissionais (ex.: user_id). */
  onStaffAccessCreated?: () => void;
}

const ShopCustomization: React.FC<ShopCustomizationProps> = ({ shop, onSave, onStaffAccessCreated }) => {
  const [staffLoginEmail, setStaffLoginEmail] = useState<Record<string, string>>({});
  const [staffLoginPassword, setStaffLoginPassword] = useState<Record<string, string>>({});
  const [staffCreatingId, setStaffCreatingId] = useState<string | null>(null);
  /** Com login ativo, formulário de redefinição fica oculto até o dono expandir. */
  const [staffRedefineOpen, setStaffRedefineOpen] = useState<Record<string, boolean>>({});

  const submitStaffAccess = async (proId: string, mode: 'create' | 'reset') => {
    const rawEmail = staffLoginEmail[proId];
    const email =
      typeof rawEmail === 'string' && rawEmail.trim() !== '' ? rawEmail.trim().toLowerCase() : '';
    const password = staffLoginPassword[proId] || '';
    if (mode === 'create') {
      if (!email || !password) {
        alert('Preencha e-mail e senha inicial para o acesso em Sou parceiro.');
        return;
      }
    } else if (!password) {
      alert('Informe a nova senha (mín. 6 caracteres). O e-mail pode ficar em branco para manter o atual.');
      return;
    }
    if (password.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setStaffCreatingId(proId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        alert('Sessão expirada. Entre novamente.');
        return;
      }
      const body: Record<string, string> = {
        professionalId: proId,
        password,
        shopId: shop.id,
      };
      if (mode === 'create') {
        body.email = email;
      } else {
        body.action = 'reset_credentials';
        if (email) body.email = email;
      }
      const res = await fetch(`${window.location.origin}/api/partner/staff/create-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(json.error || (mode === 'create' ? 'Falha ao criar acesso.' : 'Falha ao atualizar acesso.'));
        return;
      }
      alert(json.message || (mode === 'create' ? 'Acesso criado com sucesso.' : 'Acesso atualizado.'));
      setStaffLoginEmail((prev) => {
        const next = { ...prev };
        delete next[proId];
        return next;
      });
      setStaffLoginPassword((prev) => {
        const next = { ...prev };
        delete next[proId];
        return next;
      });
      if (mode === 'reset') {
        setStaffRedefineOpen((prev) => ({ ...prev, [proId]: false }));
      }
      onStaffAccessCreated?.();
    } catch {
      alert(mode === 'create' ? 'Erro de rede ao criar acesso.' : 'Erro de rede ao atualizar acesso.');
    } finally {
      setStaffCreatingId(null);
    }
  };

  const [formData, setFormData] = useState<Shop>(() => ({
    ...shop,
    services: dedupeServices(
      (shop.services || []).map((s) => {
        const std = matchStandardServiceName(s.name, shop.type);
        return {
          ...s,
          name: std ?? (s.name.trim() || s.name),
          duration: snapServiceDurationToSlot(Number(s.duration)),
        };
      })
    ),
    professionals: dedupeProfessionals(shop.professionals || []),
    products: dedupeProducts(shop.products || []),
    passFeesToCustomer: shop.passFeesToCustomer ?? false,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'GENERAL' | 'INVENTORY' | 'SERVICES' | 'PROFESSIONALS'>('GENERAL');
  /** Quando "Repassar taxas" está ativo, valor que o parceiro quer receber por serviço (id → valor) */
  const [serviceNetValues, setServiceNetValues] = useState<Record<string, number>>({});
  /** Quando "Repassar taxas" está ativo, valor que o parceiro quer receber por produto (id → valor) */
  const [productNetValues, setProductNetValues] = useState<Record<string, number>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: 'SHOP_PROFILE' | 'SHOP_BANNER' | 'PRO' | 'PRODUCT', id?: string } | null>(null);
  const [pendingServiceType, setPendingServiceType] = useState<string>('');
  const [imageUploading, setImageUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget || imageUploading) return;

    if ((uploadTarget.type === 'PRO' || uploadTarget.type === 'PRODUCT') && !uploadTarget.id) {
      window.alert('Guarde ou selecione o item antes de enviar a imagem.');
      e.target.value = '';
      setUploadTarget(null);
      return;
    }

    if (!isUuid(shop.id)) {
      window.alert('Loja ainda sem ID válido; não é possível enviar imagem.');
      e.target.value = '';
      setUploadTarget(null);
      return;
    }

    setImageUploading(true);
    try {
      const result = await uploadShopMediaAndGetPublicUrl(
        supabase,
        shop.id,
        uploadTarget.type,
        file,
        uploadTarget.id
      );
      if ('error' in result) {
        window.alert(result.error);
        return;
      }
      const publicUrl = result.publicUrl;

      if (uploadTarget.type === 'SHOP_PROFILE') {
        setFormData({ ...formData, profileImage: publicUrl });
      } else if (uploadTarget.type === 'SHOP_BANNER') {
        setFormData({ ...formData, bannerImage: publicUrl });
      } else if (uploadTarget.type === 'PRO' && uploadTarget.id) {
        setFormData({
          ...formData,
          professionals: formData.professionals.map((p) =>
            p.id === uploadTarget.id ? { ...p, avatar: publicUrl } : p
          ),
        });
      } else if (uploadTarget.type === 'PRODUCT' && uploadTarget.id) {
        setFormData({
          ...formData,
          products: formData.products.map((p) =>
            p.id === uploadTarget.id ? { ...p, image: publicUrl } : p
          ),
        });
      }
    } finally {
      setImageUploading(false);
      setUploadTarget(null);
      e.target.value = '';
    }
  };

  const triggerUpload = (type: 'SHOP_PROFILE' | 'SHOP_BANNER' | 'PRO' | 'PRODUCT', id?: string) => {
    if (imageUploading) return;
    setUploadTarget({ type, id });
    fileInputRef.current?.click();
  };

  // Product Handlers
  const removeProduct = (id: string) => {
    setFormData({ ...formData, products: formData.products.filter(p => p.id !== id) });
  };

  const addProduct = () => {
    const newProduct: Product = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Novo Produto',
      description: 'Descrição do produto',
      price: 0,
      category: 'Geral',
      image: 'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=1974',
      stock: 10
    };
    setFormData({ ...formData, products: [...formData.products, newProduct] });
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setFormData({
      ...formData,
      products: formData.products.map(p => p.id === id ? { ...p, ...updates } : p)
    });
  };

  // Service Handlers
  const removeService = (id: string) => {
    setFormData({ ...formData, services: formData.services.filter(s => s.id !== id) });
  };

  const addServiceFromStandard = () => {
    if (!pendingServiceType) return;
    const presetList = presetServicesWithDescription(formData.type);
    const typePreset = presetList?.find((s) => s.name === pendingServiceType);
    const newService: Service = {
      id: Math.random().toString(36).substr(2, 9),
      name: pendingServiceType,
      description: typePreset?.description ?? '',
      price: 0,
      duration: 30,
    };
    setFormData({ ...formData, services: [...formData.services, newService] });
    setPendingServiceType('');
  };

  const standardNames = standardServiceNamesForType(formData.type);
  const standardTypesNotInShop = standardNames.filter(
    (opt) =>
      !formData.services.some((s) => normalizeServiceTypeName(s.name) === normalizeServiceTypeName(opt))
  );

  const serviceTypeOptionsForRow = (serviceId: string): string[] => {
    const taken = new Set(
      formData.services
        .filter((s) => s.id !== serviceId)
        .map((s) => normalizeServiceTypeName(s.name))
    );
    const current = formData.services.find((s) => s.id === serviceId);
    const currentNorm = current ? normalizeServiceTypeName(current.name) : '';
    const std = standardNames.filter(
      (opt) => !taken.has(normalizeServiceTypeName(opt)) || normalizeServiceTypeName(opt) === currentNorm
    );
    if (current && !isStandardServiceName(current.name, formData.type) && current.name.trim()) {
      const legacy = current.name.trim();
      const legacyNorm = normalizeServiceTypeName(legacy);
      if (!std.some((o) => normalizeServiceTypeName(o) === legacyNorm)) {
        return [legacy, ...std];
      }
    }
    const opts = [...std];
    if (
      current &&
      current.name.trim() &&
      !opts.some((o) => normalizeServiceTypeName(o) === currentNorm)
    ) {
      opts.unshift(current.name.trim());
    }
    return opts;
  };

  const updateService = (id: string, updates: Partial<Service>) => {
    setFormData({
      ...formData,
      services: formData.services.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  // Professional Handlers
  const addProfessional = () => {
    const newPro: Professional = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Novo Membro',
      specialty: 'Cargo/Especialidade',
      avatar: `https://ui-avatars.com/api/?name=Profissional&background=random`,
      phone: '',
      cpfCnpj: '',
      birthDate: '',
      splitPercent: 95,
      splitPercentSandbox: null,
    };
    setFormData({ ...formData, professionals: [...formData.professionals, newPro] });
  };

  const removeProfessional = (id: string) => {
    setFormData({ ...formData, professionals: formData.professionals.filter(p => p.id !== id) });
  };

  const updateProfessional = (id: string, updates: Partial<Professional>) => {
    setFormData({
      ...formData,
      professionals: formData.professionals.map(p => p.id === id ? { ...p, ...updates } : p)
    });
  };

  return (
    <div
      className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24"
      style={shopPrimaryStyleVars(formData.primaryColor ?? shop.primaryColor)}
    >
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-gray-900">Configurações da Loja</h2>
          <p className="text-gray-500">Gerencie sua vitrine, serviços e estoque.</p>
        </div>
        <div className="flex gap-2 p-1 bg-white rounded-2xl border border-gray-100 overflow-x-auto no-scrollbar max-w-full">
          <button 
            onClick={() => setActiveSection('GENERAL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'GENERAL' ? 'bg-(--shop-primary) text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Perfil & Visual
          </button>
          <button 
            onClick={() => setActiveSection('SERVICES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'SERVICES' ? 'bg-(--shop-primary) text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Serviços
          </button>
          <button 
            onClick={() => setActiveSection('PROFESSIONALS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'PROFESSIONALS' ? 'bg-(--shop-primary) text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Equipe
          </button>
          <button 
            onClick={() => setActiveSection('INVENTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'INVENTORY' ? 'bg-(--shop-primary) text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Lojinha & Estoque
          </button>
        </div>
      </header>

      {activeSection === 'GENERAL' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Informações Gerais</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Nome da Loja</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-(--shop-primary) transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Descrição</label>
                <textarea 
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-(--shop-primary) transition-all resize-none" 
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Identidade Visual</h3>
            <div className="space-y-6">
               <div className="flex gap-4 items-center">
                  <div className="relative group cursor-pointer" onClick={() => triggerUpload('SHOP_PROFILE')}>
                    <img src={formData.profileImage} className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-100 group-hover:opacity-75 transition-all" alt="Perfil" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="fas fa-camera text-white drop-shadow-md"></i>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">Foto de Perfil</p>
                    <p className="text-xs text-gray-400">Clique na imagem para alterar</p>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Imagem de Capa (Banner)</label>
                  <div 
                    className="h-32 rounded-2xl bg-gray-100 overflow-hidden relative group cursor-pointer"
                    onClick={() => triggerUpload('SHOP_BANNER')}
                  >
                    <img src={formData.bannerImage} className="w-full h-full object-cover group-hover:opacity-75 transition-all" alt="Banner" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                      <i className="fas fa-camera text-white text-2xl drop-shadow-md"></i>
                    </div>
                  </div>
               </div>

               <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Cor Principal</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {['#1a1a1a', '#db2777', '#4f46e5', '#059669', '#d97706'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, primaryColor: color })}
                      className={`w-10 h-10 rounded-full border-2 transition-all shrink-0 ${(formData.primaryColor || shop.primaryColor || '#1a1a1a') === color ? 'border-white scale-110 ring-2 ring-offset-2 ring-(--shop-primary)' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="color"
                      value={(() => {
                        const c = formData.primaryColor || shop.primaryColor || '#1a1a1a';
                        return c.startsWith('#') ? c : `#${c}`;
                      })()}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-10 h-10 rounded-full border-0 cursor-pointer p-0 bg-transparent"
                    />
                    <span className="text-xs text-gray-500">Personalizada</span>
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Clique em uma cor ou use o seletor para personalizar. Salve as alterações abaixo.</p>
              </div>
            </div>
            <button 
              onClick={async () => { setIsSaving(true); try { await onSave(formData); } finally { setIsSaving(false); } }}
              disabled={isSaving}
              className="w-full bg-(--shop-primary) text-white py-4 rounded-2xl font-bold shadow-lg hover:brightness-95 transition-all disabled:opacity-70"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      ) : activeSection === 'SERVICES' ? (
        <div className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-8">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Gerenciar Serviços</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-md">
                {formData.type === 'SALON'
                  ? 'Lista pensada para salão: corte feminino, coloração, mechas, escova, tratamentos, penteados, manicure, sobrancelhas e maquiagem.'
                  : formData.type === 'MANICURE'
                    ? 'Lista pensada para manicure: gel, alongamento, pedicure, nail art, spa das mãos e remoção de gel.'
                    : 'Lista pensada para barbearia: cortes, barba, pezinho e pintura.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch w-full sm:w-auto">
              <select
                value={pendingServiceType}
                onChange={(e) => setPendingServiceType(e.target.value)}
                className="flex-1 min-w-0 sm:min-w-[220px] bg-[color-mix(in_srgb,var(--shop-primary)_10%,white)] text-gray-900 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[color-mix(in_srgb,var(--shop-primary)_22%,white)] focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none dark:bg-[color-mix(in_srgb,var(--shop-primary)_30%,#0a0a0a)] dark:text-zinc-50 dark:border-[color-mix(in_srgb,var(--shop-primary)_48%,#27272a)] dark:scheme-dark"
              >
                <option value="">Escolha o tipo de serviço</option>
                {standardTypesNotInShop.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addServiceFromStandard}
                disabled={!pendingServiceType}
                className="text-sm bg-(--shop-primary) text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:brightness-95 disabled:opacity-50 disabled:pointer-events-none shrink-0"
              >
                <i className="fas fa-plus text-xs"></i> Adicionar
              </button>
            </div>
          </div>

          {(() => {
            const platformFeePct = 100 - (shop.splitPercent ?? 95);
            const passFees = formData.passFeesToCustomer ?? false;
            return (
              <>
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 mb-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={passFees}
                    onChange={() => setFormData({ ...formData, passFeesToCustomer: !passFees })}
                    className="w-5 h-5 rounded border-gray-300 accent-(--shop-primary) focus:ring-(--shop-primary)"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">Repassar taxas para os clientes</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ative para informar o valor que você vai receber; o app calcula o preço mínimo a cobrar (sua taxa + R$ 1,99 Asaas): centavos abaixo de ,50 viram ,50; de ,50 a ,99 sobe para o próximo real.
                    </p>
                  </div>
                </label>

          <div className="space-y-4">
            {formData.services.map((service) => {
              const rowOptions = serviceTypeOptionsForRow(service.id);
              const valueForSelect =
                rowOptions.find(
                  (o) => normalizeServiceTypeName(o) === normalizeServiceTypeName(service.name)
                ) ?? service.name;
              const netFromReverse = passFees ? Math.max(0, reverseCalcNetReceipt(service.price, platformFeePct)) : 0;
              const valorReceber = serviceNetValues[service.id] ?? (passFees ? netFromReverse : service.price);
              const minPrice = passFees ? calcMinPrice(Number(valorReceber) || 0, platformFeePct) : service.price;
              const showEmptyNetInput =
                passFees && valorReceber === 0 && !(service.id in serviceNetValues);
              return (
              <div key={service.id} className="p-6 rounded-2xl bg-gray-50 border border-gray-100 space-y-4 group relative">
                <button 
                  onClick={() => removeService(service.id)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                >
                  <i className="fas fa-trash-alt text-xs"></i>
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Tipo de serviço</label>
                      <select
                        value={valueForSelect}
                        onChange={(e) => updateService(service.id, { name: e.target.value })}
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none font-bold text-gray-900"
                      >
                        {rowOptions.map((opt) => (
                          <option key={`${service.id}-${opt}`} value={opt}>
                            {opt}
                            {!isStandardServiceName(opt, formData.type) ? ' (personalizado)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Descrição</label>
                      <textarea 
                        rows={2}
                        value={service.description} 
                        onChange={(e) => updateService(service.id, { description: e.target.value })}
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 h-fit">
                    {passFees ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Valor que você vai receber (R$)</label>
                          <input 
                            type="number"
                            step="0.01"
                            min="0"
                            value={showEmptyNetInput ? '' : valorReceber}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setServiceNetValues(prev => ({ ...prev, [service.id]: v }));
                            }}
                            className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none font-bold text-(--shop-primary)"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço mínimo a cobrar</label>
                          <p className="bg-white p-3 rounded-xl text-sm border border-gray-200 font-bold text-(--shop-primary)">R$ {minPrice.toFixed(2).replace('.', ',')}</p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço (R$)</label>
                        <input 
                          type="number" 
                          value={service.price} 
                          onChange={(e) => updateService(service.id, { price: parseFloat(e.target.value) })}
                          className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none font-bold text-(--shop-primary)"
                        />
                      </div>
                    )}
                    <div className={passFees ? 'col-span-2' : ''}>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Duração</label>
                      <select
                        value={service.duration}
                        onChange={(e) =>
                          updateService(service.id, { duration: Number(e.target.value) })
                        }
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-(--shop-primary) focus:border-transparent outline-none font-bold text-gray-900"
                      >
                        {SERVICE_DURATION_MINUTES.map((m) => (
                          <option key={m} value={m}>
                            {formatServiceDurationLabel(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );})}
          </div>
              </>
            );
          })()}

          <div className="mt-8 pt-8 border-t border-gray-50">
             <button
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    const platformFeePct = 100 - (shop.splitPercent ?? 95);
                    const passFees = formData.passFeesToCustomer ?? false;
                    const dataToSave = passFees
                      ? {
                          ...formData,
                          services: formData.services.map((s) => ({
                            ...s,
                            price: calcMinPrice(
                              Math.max(
                                0,
                                serviceNetValues[s.id] ?? reverseCalcNetReceipt(s.price, platformFeePct)
                              ),
                              platformFeePct
                            ),
                          })),
                        }
                      : formData;
                    await onSave(dataToSave);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
                className="w-full bg-(--shop-primary) text-white py-4 rounded-2xl font-bold shadow-lg hover:brightness-95 transition-all disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : 'Salvar Serviços'}
              </button>
          </div>
        </div>
      ) : activeSection === 'PROFESSIONALS' ? (
        <div className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Gerenciar Equipe</h3>
            <button 
              onClick={addProfessional}
              className="text-sm bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-(--shop-primary) px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-[color-mix(in_srgb,var(--shop-primary)_18%,white)] dark:bg-[color-mix(in_srgb,var(--shop-primary)_34%,#0a0a0a)] dark:text-[color-mix(in_srgb,var(--shop-primary)_88%,#fafafa)] dark:border dark:border-[color-mix(in_srgb,var(--shop-primary)_42%,#3f3f46)] dark:hover:bg-[color-mix(in_srgb,var(--shop-primary)_42%,#111)]"
            >
              <i className="fas fa-plus text-xs"></i> Adicionar Funcionário
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.professionals.map(pro => (
              <div key={pro.id} className="p-6 rounded-2xl bg-gray-50 border border-gray-100 flex gap-4 group relative">
                <button 
                  onClick={() => removeProfessional(pro.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-red-500 hover:text-white"
                >
                  <i className="fas fa-times text-[10px]"></i>
                </button>
                
                <div className="shrink-0">
                   <div 
                    className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-200 border-2 border-white shadow-sm relative group cursor-pointer"
                    onClick={() => triggerUpload('PRO', pro.id)}
                   >
                      <img src={pro.avatar} className="w-full h-full object-cover group-hover:opacity-75 transition-all" alt={pro.name} />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                        <i className="fas fa-camera text-white text-xs drop-shadow-md"></i>
                      </div>
                   </div>
                   <p className="mt-2 text-[8px] text-center font-bold text-gray-400 uppercase">Alterar Foto</p>
                </div>

                <div className="flex-1 space-y-2">
                   <div>
                    <label className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">Nome Completo</label>
                    <input 
                      type="text" 
                      value={pro.name} 
                      onChange={(e) => updateProfessional(pro.id, { name: e.target.value })}
                      className="w-full bg-white px-3 py-1.5 rounded-lg text-sm border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none font-bold text-gray-900"
                    />
                   </div>
                   <div>
                    <label className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">Especialidade / Cargo</label>
                    <input 
                      type="text" 
                      value={pro.specialty} 
                      onChange={(e) => updateProfessional(pro.id, { specialty: e.target.value })}
                      className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none text-(--shop-primary) font-medium"
                    />
                   </div>
                   <div>
                     <label className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">
                       WhatsApp
                     </label>
                     <div className="flex gap-2 items-stretch">
                       <input
                         type="tel"
                         inputMode="numeric"
                         autoComplete="tel"
                         placeholder="(00) 00000-0000"
                         value={formatBrazilPhone(pro.phone || '')}
                         onChange={(e) =>
                           updateProfessional(pro.id, { phone: formatBrazilPhone(e.target.value) })
                         }
                         className="min-w-0 flex-1 bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none"
                       />
                       <button
                         type="button"
                         title="Abrir WhatsApp"
                         aria-label="Abrir conversa no WhatsApp"
                         onClick={() => {
                           const url = brazilWhatsappMeUrl(pro.phone || '');
                           if (!url) {
                             alert(
                               'Informe o número com DDD (10 ou 11 dígitos) para abrir o WhatsApp.'
                             );
                             return;
                           }
                           window.open(url, '_blank', 'noopener,noreferrer');
                         }}
                         className="shrink-0 flex min-w-18 items-center justify-center rounded-lg bg-[#25D366] px-5 py-2.5 text-white shadow-sm hover:brightness-95 active:brightness-90 border border-[#1ebe5b] sm:min-w-20 sm:px-6"
                       >
                         <i className="fab fa-whatsapp text-2xl leading-none sm:text-[1.75rem]" aria-hidden />
                       </button>
                     </div>
                   </div>
                   <div>
                    <label className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">CPF/CNPJ</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      value={formatBrazilCpfCnpj(pro.cpfCnpj || '')}
                      onChange={(e) =>
                        updateProfessional(pro.id, { cpfCnpj: formatBrazilCpfCnpj(e.target.value) })
                      }
                      className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none"
                    />
                   </div>
                   <p className="text-[10px] text-gray-500">
                    {pro.asaasWalletId ? `Carteira vinculada: ${pro.asaasWalletId}` : 'Carteira Asaas ainda não vinculada.'}
                   </p>
                   {isUuid(pro.id) && (
                     <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                       <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Acesso Sou parceiro</p>
                       {pro.authUserId ? (
                         <>
                           <button
                             type="button"
                             onClick={() =>
                               setStaffRedefineOpen((prev) => ({
                                 ...prev,
                                 [pro.id]: !prev[pro.id],
                               }))
                             }
                             className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl border border-emerald-900 bg-emerald-800 text-left text-xs font-bold text-white shadow-sm hover:bg-emerald-900 hover:border-emerald-950 transition-colors"
                           >
                             <span>Login da equipe ativo</span>
                             <i
                               className={`fas fa-chevron-${staffRedefineOpen[pro.id] ? 'up' : 'down'} text-[10px] text-emerald-100`}
                               aria-hidden
                             />
                           </button>
                           {staffRedefineOpen[pro.id] ? (
                             <>
                               <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">
                                 Redefina login/senha
                               </p>
                               <p className="text-[10px] text-gray-500">
                                 Sem recriar usuário ou carteira. E-mail em branco mantém o atual; informe a nova
                                 senha.
                               </p>
                               <input
                                 type="email"
                                 inputMode="email"
                                 autoComplete="username"
                                 spellCheck={false}
                                 autoCapitalize="none"
                                 autoCorrect="off"
                                 placeholder="nome@exemplo.com (opcional)"
                                 value={normalizeLoginEmailInput(
                                   staffLoginEmail[pro.id] !== undefined
                                     ? staffLoginEmail[pro.id]
                                     : (pro.email ?? '')
                                 )}
                                 onChange={(e) =>
                                   setStaffLoginEmail((prev) => ({
                                     ...prev,
                                     [pro.id]: normalizeLoginEmailInput(e.target.value),
                                   }))
                                 }
                                 className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none"
                               />
                               <input
                                 type="password"
                                 autoComplete="new-password"
                                 placeholder="Nova senha (mín. 6 caracteres)"
                                 value={staffLoginPassword[pro.id] ?? ''}
                                 onChange={(e) =>
                                   setStaffLoginPassword((prev) => ({
                                     ...prev,
                                     [pro.id]: e.target.value,
                                   }))
                                 }
                                 className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none"
                               />
                               <button
                                 type="button"
                                 disabled={staffCreatingId === pro.id}
                                 onClick={() => submitStaffAccess(pro.id, 'reset')}
                                 className="w-full py-2 rounded-xl text-xs font-bold bg-(--shop-primary) text-white hover:brightness-95 disabled:opacity-60"
                               >
                                 {staffCreatingId === pro.id ? 'Atualizando…' : 'Atualizar acesso'}
                               </button>
                             </>
                           ) : null}
                         </>
                       ) : (
                         <>
                           <p className="text-[10px] text-gray-500">
                             Defina e-mail e senha inicial; o barbeiro entra em Sou parceiro com esses dados (recomendamos trocar a senha depois).
                           </p>
                           <input
                             type="email"
                             inputMode="email"
                             autoComplete="username"
                             spellCheck={false}
                             autoCapitalize="none"
                             autoCorrect="off"
                             placeholder="nome@exemplo.com"
                             value={normalizeLoginEmailInput(staffLoginEmail[pro.id] ?? '')}
                             onChange={(e) =>
                               setStaffLoginEmail((prev) => ({
                                 ...prev,
                                 [pro.id]: normalizeLoginEmailInput(e.target.value),
                               }))
                             }
                             className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-(--shop-primary) outline-none"
                           />
                           <input
                             type="password"
                             autoComplete="new-password"
                             placeholder="Senha inicial (mín. 6 caracteres)"
                             value={staffLoginPassword[pro.id] ?? ''}
                             onChange={(e) =>
                               setStaffLoginPassword((prev) => ({ ...prev, [pro.id]: e.target.value }))
                             }
                             className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100"
                           />
                           <button
                             type="button"
                             disabled={staffCreatingId === pro.id}
                             onClick={() => submitStaffAccess(pro.id, 'create')}
                             className="w-full py-2 rounded-xl text-xs font-bold bg-(--shop-primary) text-white hover:brightness-95 disabled:opacity-60"
                           >
                             {staffCreatingId === pro.id ? 'Criando…' : 'Criar acesso'}
                           </button>
                         </>
                       )}
                     </div>
                   )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-gray-50">
             <button
                onClick={async () => { setIsSaving(true); try { await onSave(formData); } finally { setIsSaving(false); } }}
                disabled={isSaving}
                className="w-full bg-(--shop-primary) text-white py-4 rounded-2xl font-bold shadow-lg hover:brightness-95 transition-all disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações na Equipe'}
              </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 md:p-8 rounded-4xl border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Gerenciar Vitrine</h3>
            <button 
              onClick={addProduct}
              className="text-sm bg-[color-mix(in_srgb,var(--shop-primary)_12%,white)] text-(--shop-primary) px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-[color-mix(in_srgb,var(--shop-primary)_18%,white)] dark:bg-[color-mix(in_srgb,var(--shop-primary)_34%,#0a0a0a)] dark:text-[color-mix(in_srgb,var(--shop-primary)_88%,#fafafa)] dark:border dark:border-[color-mix(in_srgb,var(--shop-primary)_42%,#3f3f46)] dark:hover:bg-[color-mix(in_srgb,var(--shop-primary)_42%,#111)]"
            >
              <i className="fas fa-plus text-xs"></i> Novo Produto
            </button>
          </div>

          {(() => {
            const platformFeePct = 100 - (shop.splitPercent ?? 95);
            const passFees = formData.passFeesToCustomer ?? false;
            return (
              <>
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 mb-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={passFees}
                    onChange={() => setFormData({ ...formData, passFeesToCustomer: !passFees })}
                    className="w-5 h-5 rounded border-gray-300 accent-(--shop-primary) focus:ring-(--shop-primary)"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">Repassar taxas para os clientes</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ative para informar o valor que você vai receber por produto; o app calcula o preço mínimo a cobrar (sua taxa + R$ 1,99 Asaas): centavos abaixo de ,50 viram ,50; de ,50 a ,99 sobe para o próximo real.
                    </p>
                  </div>
                </label>

          <div className="space-y-4">
            {formData.products.map(product => {
              const netFromReverse = passFees ? Math.max(0, reverseCalcNetReceipt(product.price, platformFeePct)) : 0;
              const valorReceber = productNetValues[product.id] ?? (passFees ? netFromReverse : product.price);
              const minPrice = passFees ? calcMinPrice(Number(valorReceber) || 0, platformFeePct) : product.price;
              const showEmptyProductNetInput =
                passFees && valorReceber === 0 && !(product.id in productNetValues);
              return (
              <div key={product.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row gap-6">
                 <div 
                  className="w-full md:w-32 h-32 rounded-xl overflow-hidden shrink-0 bg-gray-200 relative group cursor-pointer"
                  onClick={() => triggerUpload('PRODUCT', product.id)}
                 >
                    <img src={product.image} className="w-full h-full object-cover group-hover:opacity-75 transition-all" alt="" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                        <i className="fas fa-camera text-white drop-shadow-md"></i>
                    </div>
                 </div>
                 <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="col-span-1 lg:col-span-2 space-y-3">
                      <input 
                        type="text" 
                        value={product.name} 
                        onChange={(e) => updateProduct(product.id, { name: e.target.value })}
                        placeholder="Nome do produto"
                        className="w-full bg-transparent font-bold text-gray-900 text-lg border-b border-gray-200 focus:outline-none focus:border-(--shop-primary)"
                      />
                      <div className="flex gap-4 flex-wrap">
                        {passFees ? (
                          <>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Valor que você vai receber (R$)</label>
                              <input 
                                type="number"
                                step="0.01"
                                min="0"
                                value={showEmptyProductNetInput ? '' : valorReceber}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  setProductNetValues(prev => ({ ...prev, [product.id]: v }));
                                }}
                                className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200 font-bold text-(--shop-primary)"
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço mínimo a cobrar</label>
                              <p className="bg-white p-2 rounded-lg text-sm border border-gray-200 font-bold text-(--shop-primary)">R$ {minPrice.toFixed(2).replace('.', ',')}</p>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço (R$)</label>
                            <input 
                              type="number" 
                              value={product.price} 
                              onChange={(e) => updateProduct(product.id, { price: parseFloat(e.target.value) })}
                              className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Promoção (R$)</label>
                          <input 
                            type="number" 
                            value={product.promoPrice || ''} 
                            onChange={(e) => updateProduct(product.id, { promoPrice: parseFloat(e.target.value) || undefined })}
                            className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200"
                          />
                        </div>
                        <div className="flex-1 min-w-[100px]">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">
                            Estoque (un.)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={Number.isFinite(product.stock) ? product.stock : 0}
                            onChange={(e) => {
                              const v = Math.max(0, Math.floor(Number(e.target.value)));
                              if (!Number.isNaN(v)) updateProduct(product.id, { stock: v });
                            }}
                            className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200 font-semibold text-gray-800"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Categoria</label>
                        <input 
                          type="text" 
                          value={product.category} 
                          onChange={(e) => updateProduct(product.id, { category: e.target.value })}
                          className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button 
                          onClick={() => removeProduct(product.id)}
                          className="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                 </div>
              </div>
            );})}
          </div>
              </>
            );
          })()}

          <div className="mt-8 pt-8 border-t border-gray-50">
             <button
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    const platformFeePct = 100 - (shop.splitPercent ?? 95);
                    const passFees = formData.passFeesToCustomer ?? false;
                    const dataToSave = passFees
                      ? {
                          ...formData,
                          products: formData.products.map((p) => ({
                            ...p,
                            price: calcMinPrice(
                              Math.max(
                                0,
                                productNetValues[p.id] ?? reverseCalcNetReceipt(p.price, platformFeePct)
                              ),
                              platformFeePct
                            ),
                          })),
                        }
                      : formData;
                    await onSave(dataToSave);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
                className="w-full bg-(--shop-primary) text-white py-4 rounded-2xl font-bold shadow-lg hover:brightness-95 transition-all disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : 'Salvar Inventário'}
              </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopCustomization;
