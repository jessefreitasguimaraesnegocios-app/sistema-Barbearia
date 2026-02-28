
import React, { useState } from 'react';
import { Shop } from '../types';

interface AdminDashboardProps {
  shops: Shop[];
  setShops: (shops: Shop[]) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ shops, setShops }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'BARBER',
    cnpjCpf: '',
    email: '',
    phone: '',
    pixKey: ''
  });

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/shops/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        setShops([...shops, data.shop]);
        setShowAddModal(false);
        setFormData({ name: '', type: 'BARBER', cnpjCpf: '', email: '', phone: '', pixKey: '' });
        alert("Barbearia cadastrada e subconta Asaas criada com sucesso!");
      } else {
        alert("Erro ao cadastrar barbearia: " + data.error);
      }
    } catch (error) {
      console.error("Error creating shop:", error);
      alert("Erro de conexão ao cadastrar barbearia.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSubscription = (id: string) => {
    setShops(shops.map(s => s.id === id ? { ...s, subscriptionActive: !s.subscriptionActive } : s));
  };

  const activeRevenue = shops.filter(s => s.subscriptionActive).length * 99;

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
                    <span className="text-xs font-mono text-gray-400">{shop.asaasAccountId || 'N/A'}</span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button 
                      onClick={() => toggleSubscription(shop.id)}
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
                      placeholder="00.000.000/0000-00" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.cnpjCpf}
                      onChange={e => setFormData({...formData, cnpjCpf: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">E-mail do Proprietário</label>
                  <input 
                    required
                    type="email" 
                    placeholder="contato@barbearia.com" 
                    className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Telefone</label>
                    <input 
                      required
                      type="tel" 
                      placeholder="(11) 99999-9999" 
                      className="w-full p-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
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
