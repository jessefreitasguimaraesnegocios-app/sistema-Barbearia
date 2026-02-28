
import React, { useState } from 'react';

interface AuthViewProps {
  onLogin: (email: string) => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-lg">
            <i className="fas fa-scissors"></i>
          </div>
          <h2 className="font-display text-2xl font-bold text-gray-800">Bem-vindo ao BeautyHub</h2>
          <p className="text-gray-500 mt-2">Escolha uma conta para testar o sistema</p>
        </div>

        <div className="space-y-4">
          <button 
            onClick={() => onLogin('admin@beauty.com')}
            className="w-full p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <i className="fas fa-user-shield"></i>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Entrar como Admin</p>
              <p className="text-xs text-gray-500">Gerenciar barbearias e mensalidades</p>
            </div>
          </button>

          <button 
            onClick={() => onLogin('ricardo@barber.com')}
            className="w-full p-4 rounded-2xl border-2 border-gray-100 hover:border-blue-600 hover:bg-blue-50 transition-all text-left flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <i className="fas fa-cut"></i>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Entrar como Barbearia</p>
              <p className="text-xs text-gray-500">Ricardo Barber Shop (Masculino)</p>
            </div>
          </button>

          <button 
            onClick={() => onLogin('elena@salon.com')}
            className="w-full p-4 rounded-2xl border-2 border-gray-100 hover:border-pink-600 hover:bg-pink-50 transition-all text-left flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors">
              <i className="fas fa-heart"></i>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Entrar como Salão</p>
              <p className="text-xs text-gray-500">Lumière Beauty Salon (Feminino)</p>
            </div>
          </button>

          <button 
            onClick={() => onLogin('joao@user.com')}
            className="w-full p-4 rounded-2xl border-2 border-gray-100 hover:border-green-600 hover:bg-green-50 transition-all text-left flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
              <i className="fas fa-calendar-alt"></i>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Entrar como Cliente</p>
              <p className="text-xs text-gray-500">João Cliente - Agendar serviços</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthView;
