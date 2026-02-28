
import React, { useState } from 'react';
import { Shop } from '../types';

interface ClientHomeProps {
  shops: Shop[];
  onSelectShop: (shop: Shop) => void;
}

const ClientHome: React.FC<ClientHomeProps> = ({ shops, onSelectShop }) => {
  const [filter, setFilter] = useState<'ALL' | 'BARBER' | 'SALON'>('ALL');
  const [search, setSearch] = useState('');

  const filteredShops = shops.filter(shop => {
    const matchesFilter = filter === 'ALL' || shop.type === filter;
    const matchesSearch = shop.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h2 className="text-3xl font-display font-bold text-gray-900">Encontre o melhor para você</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text" 
              placeholder="Buscar por nome ou serviço..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2 p-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setFilter('ALL')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${filter === 'ALL' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter('BARBER')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${filter === 'BARBER' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Barbearias
            </button>
            <button 
              onClick={() => setFilter('SALON')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${filter === 'SALON' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Salões
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredShops.map(shop => (
          <div 
            key={shop.id}
            onClick={() => onSelectShop(shop)}
            className="group bg-white rounded-3xl overflow-hidden border border-gray-100 hover:shadow-2xl transition-all cursor-pointer transform hover:-translate-y-1"
          >
            <div className="relative h-48 overflow-hidden">
              <img src={shop.bannerImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={shop.name} />
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <i className="fas fa-star text-yellow-400"></i> {shop.rating}
              </div>
              <div className={`absolute bottom-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${shop.type === 'BARBER' ? 'bg-slate-900' : 'bg-pink-600'}`}>
                {shop.type === 'BARBER' ? 'Barbearia' : 'Salão de Beleza'}
              </div>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-gray-900">{shop.name}</h3>
                <img src={shop.profileImage} className="w-12 h-12 rounded-2xl border-4 border-white shadow-md -mt-12" alt="profile" />
              </div>
              <p className="text-gray-500 text-sm line-clamp-2 mb-4 leading-relaxed">{shop.description}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <i className="fas fa-map-marker-alt"></i>
                <span className="truncate">{shop.address}</span>
              </div>
              <div className="mt-6 flex justify-between items-center">
                <div className="flex -space-x-2">
                  {shop.professionals.map((p, idx) => (
                    <img key={idx} src={p.avatar} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100" title={p.name} alt={p.name} />
                  ))}
                </div>
                <button className="text-indigo-600 font-bold text-sm group-hover:underline">
                  Ver Agenda <i className="fas fa-chevron-right ml-1"></i>
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default ClientHome;
