
import React, { useState, useRef, useEffect } from 'react';
import { Shop } from '../types';
import { supabase } from '../src/lib/supabase';

// Máscara telefone BR: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Máscara CPF (11 dígitos) ou CNPJ (14 dígitos) – apenas números
function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

const EMAIL_DOMAINS = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com.br', '@yahoo.com', '@icloud.com', '@live.com', '@uol.com.br', '@bol.com.br'];

interface AdminDashboardProps {
  shops: Shop[];
  setShops: (shops: Shop[]) => void;
  onShopCreated?: () => void | Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ shops, setShops, onShopCreated }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSuggestionsOpen, setEmailSuggestionsOpen] = useState(false);
  const [emailSuggestionsFilter, setEmailSuggestionsFilter] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailListRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'BARBER',
    cnpjCpf: '',
    email: '',
    phone: '',
    pixKey: '',
    postalCode: '01310100',
    address: 'Rua Exemplo',
    addressNumber: 'S/N',
    province: 'Centro',
    incomeValue: 5000,
    subscriptionAmount: 99
  });

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-shop', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          cpfCnpj: formData.cnpjCpf || undefined
        }
      });

      if (error) {
        alert(error.message || 'Erro ao cadastrar barbearia.');
        return;
      }
      if (data?.success) {
        await onShopCreated?.();
        setShowAddModal(false);
        setFormData({ name: '', type: 'BARBER', cnpjCpf: '', email: '', phone: '', pixKey: '', postalCode: '01310100', address: 'Rua Exemplo', addressNumber: 'S/N', province: 'Centro', incomeValue: 5000, subscriptionAmount: 99 });
        alert('Barbearia cadastrada e cliente Asaas criado com sucesso!');
      } else {
        const msg = data?.details || data?.error || 'Erro ao cadastrar barbearia.';
        alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } catch (error) {
      console.error('Error creating shop:', error);
      alert('Erro de conexão ao cadastrar barbearia.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSubscription = async (shop: Shop) => {
    const next = !shop.subscriptionActive;
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionActive: next })
      });
      const data = await response.json();
      if (data.success && data.shop) {
        setShops(shops.map(s => s.id === shop.id ? data.shop : s));
      } else {
        alert(data.error || 'Erro ao atualizar assinatura.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao atualizar assinatura.');
    }
  };

  const activeRevenue = shops
    .filter(s => s.subscriptionActive)
    .reduce((sum, s) => sum + (s.subscriptionAmount ?? 99), 0);

  const filteredEmailDomains = EMAIL_DOMAINS.filter(d =>
    d.toLowerCase().includes(emailSuggestionsFilter.toLowerCase())
  );

  useEffect(() => {
    if (!emailSuggestionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        emailListRef.current?.contains(e.target as Node) ||
        emailInputRef.current?.contains(e.target as Node)
      ) return;
      setEmailSuggestionsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [emailSuggestionsOpen]);

  const handleCnpjCpfChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 14);
    setFormData(prev => ({ ...prev, cnpjCpf: formatCnpjCpf(digits) }));
  };

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, phone: formatPhone(digits) }));
  };

  const handleEmailChange = (value: string) => {
    setFormData(prev => ({ ...prev, email: value }));
    const atIdx = value.indexOf('@');
    if (atIdx >= 0) {
      const afterAt = value.slice(atIdx);
      setEmailSuggestionsFilter(afterAt);
      setEmailSuggestionsOpen(true);
    } else {
      setEmailSuggestionsOpen(false);
    }
  };

  const handleEmailSuggestionSelect = (domain: string) => {
    const current = formData.email;
    const atIdx = current.indexOf('@');
    const beforeAt = atIdx >= 0 ? current.slice(0, atIdx) : current;
    setFormData(prev => ({ ...prev, email: beforeAt + domain }));
    setEmailSuggestionsOpen(false);
    emailInputRef.current?.focus();
  };

  const saveSubscriptionAmount = async (shop: Shop, newAmount: number) => {
    if (newAmount < 0) return;
    const current = shop.subscriptionAmount ?? 99;
    if (Math.abs(newAmount - current) < 0.01) return;
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionAmount: newAmount })
      });
      const data = await response.json();
      if (data.success && data.shop) {
        setShops(shops.map(s => s.id === shop.id ? data.shop : s));
      } else {
        alert(data.error || 'Erro ao atualizar mensalidade.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao atualizar mensalidade.');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-display font-bold text-gray-900">Portal do Administrador</h2>
          <p className="text-gray-500">Gerenciamento global da plataforma BeautyHub.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"
        >
          <i className="fas fa-plus"></i> Adicionar Parceiro
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Total de Parceiros</p>
          <p className="text-4xl font-black text-indigo-600">{shops.length}</p>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">Assinaturas Ativas</p>
          <p className="text-4xl font-black text-green-500">{shops.filter(s => s.subscriptionActive).length}</p>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium mb-1">MRR Estimado</p>
          <p className="text-4xl font-black text-gray-900 text-indigo-900">R$ {activeRevenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50">
          <h3 className="text-xl font-bold text-gray-900">Lista de Parceiros</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Estabelecimento</th>
                <th className="px-8 py-4">Tipo</th>
                <th className="px-8 py-4">Status Assinatura</th>
                <th className="px-8 py-4">Mensalidade</th>
                <th className="px-8 py-4">Asaas ID</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shops.map(shop => (
                <tr key={shop.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <img src={shop.profileImage} className="w-10 h-10 rounded-xl object-cover" alt="" />
                      <div>
                        <p className="font-bold text-gray-900">{shop.name}</p>
                        <p className="text-xs text-gray-500">{shop.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${shop.type === 'BARBER' ? 'bg-slate-900 text-white' : 'bg-pink-100 text-pink-600'}`}>
                      {shop.type === 'BARBER' ? 'Barbearia' : 'Salão'}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${shop.subscriptionActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-medium">{shop.subscriptionActive ? 'Ativa' : 'Inativa'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">R$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-20 p-2 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-600"
                        value={shop.subscriptionAmount ?? 99}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v >= 0) {
                            setShops(shops.map(s => s.id === shop.id ? { ...s, subscriptionAmount: v } : s));
                          }
                        }}
                        onBlur={e => {
                          const v = Number((e.target as HTMLInputElement).value);
                          if (!Number.isNaN(v) && v >= 0) saveSubscriptionAmount(shop, v);
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-xs font-mono text-gray-400">{shop.asaasAccountId || 'N/A'}</span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button 
                      onClick={() => toggleSubscription(shop)}
                      className={`text-sm font-bold ${shop.subscriptionActive ? 'text-red-500' : 'text-green-600'} hover:underline`}
                    >
                      {shop.subscriptionActive ? 'Suspender' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-[2rem] p-8 space-y-6 shadow-2xl animate-scale-in my-8">
             <div className="flex justify-between items-center">
               <h3 className="text-2xl font-bold text-gray-900">Novo Parceiro</h3>
               <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-900"><i className="fas fa-times"></i></button>
             </div>
             <p className="text-gray-500 text-sm">Preencha os dados para criar a barbearia e a subconta no Asaas.</p>
             <form onSubmit={handleAddShop} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Nome do Estabelecimento</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Ex: Vintage Barber Shop" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Tipo</label>
                    <select 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600 appearance-none"
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value})}
                    >
                      <option value="BARBER">Barbearia</option>
                      <option value="SALON">Salão</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">CNPJ ou CPF</label>
                    <input 
                      required
                      type="text" 
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00 ou 00.000.000/0000-00" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.cnpjCpf}
                      onChange={e => handleCnpjCpfChange(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1 relative">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">E-mail do Proprietário</label>
                  <input 
                    ref={emailInputRef}
                    required
                    type="email" 
                    placeholder="contato@barbearia.com" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.email}
                    onChange={e => handleEmailChange(e.target.value)}
                    onFocus={() => formData.email.includes('@') && setEmailSuggestionsOpen(true)}
                  />
                  {emailSuggestionsOpen && (
                    <div
                      ref={emailListRef}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto"
                    >
                      {filteredEmailDomains.length ? (
                        filteredEmailDomains.map(domain => (
                          <button
                            key={domain}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-gray-800 text-sm"
                            onClick={() => handleEmailSuggestionSelect(domain)}
                          >
                            {domain}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-sm">Nenhum domínio encontrado</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">CEP</label>
                    <input 
                      type="text" 
                      placeholder="01310-100" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.postalCode}
                      onChange={e => setFormData({...formData, postalCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Renda/Faturamento (R$)</label>
                    <input 
                      type="number" 
                      min={0}
                      placeholder="5000" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.incomeValue}
                      onChange={e => setFormData({...formData, incomeValue: Number(e.target.value) || 5000})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Mensalidade (R$/mês)</label>
                  <input 
                    type="number" 
                    min={0}
                    step={1}
                    placeholder="99" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.subscriptionAmount}
                    onChange={e => setFormData({...formData, subscriptionAmount: Math.max(0, Number(e.target.value) || 99)})}
                  />
                  <p className="text-xs text-gray-400 mt-1">Valor cobrado mensalmente deste parceiro.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Telefone</label>
                    <input 
                      required
                      type="tel" 
                      inputMode="numeric"
                      placeholder="(11) 99999-9999" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Chave PIX</label>
                    <input 
                      required
                      type="text" 
                      placeholder="CPF, E-mail ou Aleatória" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.pixKey}
                      onChange={e => setFormData({...formData, pixKey: e.target.value})}
                    />
                  </div>
                </div>

                <button 
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold mt-4 shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Cadastrar e Criar Subconta Asaas
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
