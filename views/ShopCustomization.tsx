
import React, { useState, useRef } from 'react';
import { Shop, Product, Service, Professional } from '../types';

const ASAAS_FEE = 1.99;

/** Arredonda para cima para o próximo múltiplo de R$ 0,50 (ex.: 7,24 → 7,50; 7,65 → 8,00) */
function roundUpToFiftyCents(value: number): number {
  return Math.ceil(value * 2) / 2;
}

/** Calcula o preço mínimo a cobrar: valor que o parceiro quer receber + taxa plataforma (%) + R$ 1,99 Asaas, arredondado para cima em R$ 0,50 */
function calcMinPrice(valorReceber: number, platformFeePct: number): number {
  const raw = valorReceber * (1 + platformFeePct / 100) + ASAAS_FEE;
  return roundUpToFiftyCents(raw);
}

/** Reverso: a partir do preço final (já arredondado), estima o "valor a receber" para exibição quando não temos o valor digitado */
function reverseCalcNetReceipt(priceCharged: number, platformFeePct: number): number {
  const raw = (priceCharged - ASAAS_FEE) / (1 + platformFeePct / 100);
  return Math.round(raw * 100) / 100;
}

function dedupeServices(services: Service[]): Service[] {
  const seen = new Set<string>();
  return services.filter((s) => {
    const k = `${s.name}|${s.price}|${s.duration}`;
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
}

const ShopCustomization: React.FC<ShopCustomizationProps> = ({ shop, onSave }) => {
  const [formData, setFormData] = useState<Shop>(() => ({
    ...shop,
    services: dedupeServices(shop.services || []),
    professionals: dedupeProfessionals(shop.professionals || []),
    products: dedupeProducts(shop.products || []),
    passFeesToCustomer: shop.passFeesToCustomer ?? false,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'GENERAL' | 'INVENTORY' | 'SERVICES' | 'PROFESSIONALS'>('GENERAL');
  /** Quando "Repassar taxas" está ativo, valor que o parceiro quer receber por serviço (id → valor) */
  const [serviceNetValues, setServiceNetValues] = useState<Record<string, number>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: 'SHOP_PROFILE' | 'SHOP_BANNER' | 'PRO' | 'PRODUCT', id?: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      if (uploadTarget.type === 'SHOP_PROFILE') {
        setFormData({ ...formData, profileImage: base64String });
      } else if (uploadTarget.type === 'SHOP_BANNER') {
        setFormData({ ...formData, bannerImage: base64String });
      } else if (uploadTarget.type === 'PRO' && uploadTarget.id) {
        setFormData({
          ...formData,
          professionals: formData.professionals.map(p => p.id === uploadTarget.id ? { ...p, avatar: base64String } : p)
        });
      } else if (uploadTarget.type === 'PRODUCT' && uploadTarget.id) {
        setFormData({
          ...formData,
          products: formData.products.map(p => p.id === uploadTarget.id ? { ...p, image: base64String } : p)
        });
      }
      setUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  const triggerUpload = (type: 'SHOP_PROFILE' | 'SHOP_BANNER' | 'PRO' | 'PRODUCT', id?: string) => {
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

  const addService = () => {
    const newService: Service = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Novo Serviço',
      description: 'Breve descrição do que é realizado.',
      price: 0,
      duration: 30
    };
    setFormData({ ...formData, services: [...formData.services, newService] });
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
      avatar: `https://ui-avatars.com/api/?name=Profissional&background=random`
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
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24">
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'GENERAL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Perfil & Visual
          </button>
          <button 
            onClick={() => setActiveSection('SERVICES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'SERVICES' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Serviços
          </button>
          <button 
            onClick={() => setActiveSection('PROFESSIONALS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'PROFESSIONALS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Equipe
          </button>
          <button 
            onClick={() => setActiveSection('INVENTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeSection === 'INVENTORY' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Lojinha & Estoque
          </button>
        </div>
      </header>

      {activeSection === 'GENERAL' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Informações Gerais</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Nome da Loja</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600 transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Descrição</label>
                <textarea 
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600 transition-all resize-none" 
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
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
                      className={`w-10 h-10 rounded-full border-2 transition-all flex-shrink-0 ${(formData.primaryColor || shop.primaryColor || '#1a1a1a') === color ? 'border-gray-800 scale-110 ring-2 ring-offset-2 ring-gray-300' : 'border-transparent hover:scale-105'}`}
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
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-70"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      ) : activeSection === 'SERVICES' ? (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Gerenciar Serviços</h3>
            <button 
              onClick={addService}
              className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-100"
            >
              <i className="fas fa-plus text-xs"></i> Novo Serviço
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
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">Repassar taxas para os clientes</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ative para informar o valor que você quer receber; o app calcula o preço mínimo a cobrar (sua taxa + R$ 1,99 Asaas), arredondado em R$ 0,50.
                    </p>
                  </div>
                </label>

          <div className="space-y-4">
            {formData.services.map(service => {
              const netFromReverse = passFees ? Math.max(0, reverseCalcNetReceipt(service.price, platformFeePct)) : 0;
              const valorReceber = serviceNetValues[service.id] ?? (passFees ? netFromReverse : service.price);
              const minPrice = passFees ? calcMinPrice(Number(valorReceber) || 0, platformFeePct) : service.price;
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
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Nome do Serviço</label>
                      <input 
                        type="text" 
                        value={service.name} 
                        onChange={(e) => updateService(service.id, { name: e.target.value })}
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none font-bold text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Descrição</label>
                      <textarea 
                        rows={2}
                        value={service.description} 
                        onChange={(e) => updateService(service.id, { description: e.target.value })}
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 h-fit">
                    {passFees ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Valor que você quer receber (R$)</label>
                          <input 
                            type="number"
                            step="0.01"
                            min="0"
                            value={valorReceber === 0 && !(service.id in serviceNetValues) ? '' : valorReceber}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setServiceNetValues(prev => ({ ...prev, [service.id]: v }));
                            }}
                            className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none font-bold text-indigo-600"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço mínimo a cobrar</label>
                          <p className="bg-white p-3 rounded-xl text-sm border border-gray-200 font-bold text-indigo-600">R$ {minPrice.toFixed(2).replace('.', ',')}</p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço (R$)</label>
                        <input 
                          type="number" 
                          value={service.price} 
                          onChange={(e) => updateService(service.id, { price: parseFloat(e.target.value) })}
                          className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none font-bold text-indigo-600"
                        />
                      </div>
                    )}
                    <div className={passFees ? 'col-span-2' : ''}>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Duração (min)</label>
                      <input 
                        type="number" 
                        value={service.duration} 
                        onChange={(e) => updateService(service.id, { duration: parseInt(e.target.value) })}
                        className="w-full bg-white p-3 rounded-xl text-sm border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                      />
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
                          services: formData.services.map(s => ({
                            ...s,
                            price: calcMinPrice(
                              Math.max(0, serviceNetValues[s.id] ?? reverseCalcNetReceipt(s.price, platformFeePct)),
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
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : 'Salvar Serviços'}
              </button>
          </div>
        </div>
      ) : activeSection === 'PROFESSIONALS' ? (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Gerenciar Equipe</h3>
            <button 
              onClick={addProfessional}
              className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-100"
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
                
                <div className="flex-shrink-0">
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
                      className="w-full bg-white px-3 py-1.5 rounded-lg text-sm border border-gray-100 focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-gray-900"
                    />
                   </div>
                   <div>
                    <label className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">Especialidade / Cargo</label>
                    <input 
                      type="text" 
                      value={pro.specialty} 
                      onChange={(e) => updateProfessional(pro.id, { specialty: e.target.value })}
                      className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-gray-100 focus:ring-2 focus:ring-indigo-600 outline-none text-indigo-600 font-medium"
                    />
                   </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-gray-50">
             <button
                onClick={async () => { setIsSaving(true); try { await onSave(formData); } finally { setIsSaving(false); } }}
                disabled={isSaving}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações na Equipe'}
              </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Gerenciar Vitrine</h3>
            <button 
              onClick={addProduct}
              className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-100"
            >
              <i className="fas fa-plus text-xs"></i> Novo Produto
            </button>
          </div>

          <div className="space-y-4">
            {formData.products.map(product => (
              <div key={product.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row gap-6">
                 <div 
                  className="w-full md:w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 relative group cursor-pointer"
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
                        className="w-full bg-transparent font-bold text-gray-900 text-lg border-b border-gray-200 focus:outline-none focus:border-indigo-600"
                      />
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Preço (R$)</label>
                          <input 
                            type="number" 
                            value={product.price} 
                            onChange={(e) => updateProduct(product.id, { price: parseFloat(e.target.value) })}
                            className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Promoção (R$)</label>
                          <input 
                            type="number" 
                            value={product.promoPrice || ''} 
                            onChange={(e) => updateProduct(product.id, { promoPrice: parseFloat(e.target.value) || undefined })}
                            className="w-full bg-white p-2 rounded-lg text-sm border border-gray-200"
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
            ))}
          </div>
          <div className="mt-8 pt-8 border-t border-gray-50">
             <button
                onClick={async () => { setIsSaving(true); try { await onSave(formData); } finally { setIsSaving(false); } }}
                disabled={isSaving}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-70"
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
