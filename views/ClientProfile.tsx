import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ClientProfileProps {
  user: User;
}

const ClientProfile: React.FC<ClientProfileProps> = ({ user }) => {
  const { updateProfile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(user.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || '');
  const [cpfCnpj, setCpfCnpj] = useState(user.cpfCnpj || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setFullName(user.name || '');
    setAvatarUrl(user.avatar || '');
    setCpfCnpj(user.cpfCnpj || '');
    setPhone(user.phone || '');
  }, [user.id, user.name, user.avatar, user.cpfCnpj, user.phone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrim = fullName.trim();
    const cpfDigits = (cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = (phone || '').replace(/\D/g, '').slice(0, 11);

    if (!nameTrim) {
      setMessage({ type: 'error', text: 'Nome é obrigatório.' });
      return;
    }
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      setMessage({ type: 'error', text: 'CPF (11 dígitos) ou CNPJ (14 dígitos) é obrigatório.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await updateProfile({
      full_name: nameTrim,
      avatar_url: avatarUrl.trim() || null,
      cpf_cnpj: cpfDigits || null,
      phone: phoneDigits || null,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }
    setMessage({ type: 'success', text: 'Perfil salvo! Na hora do PIX usaremos esses dados.' });
    await refreshProfile();
  };

  const isComplete = !!(user.name && user.email && user.cpfCnpj && (user.cpfCnpj.length === 11 || user.cpfCnpj.length === 14) && user.phone);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 animate-fade-in">
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">Meu Perfil</h2>
        <p className="text-sm text-gray-500 mb-6">
          Preencha os dados abaixo. Eles serão usados na hora do pagamento PIX — você não precisará digitar nada de novo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Foto */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 border-2 border-gray-100 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Sua foto" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl text-gray-400">
                  <i className="fas fa-user" />
                </span>
              )}
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Foto (URL)</label>
              <input
                type="url"
                placeholder="https://exemplo.com/sua-foto.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />
              <p className="text-[10px] text-gray-400 mt-1">Cole o link de uma imagem. Opcional.</p>
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nome completo *</label>
            <input
              type="text"
              required
              placeholder="Como aparece na cobrança"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            />
          </div>

          {/* E-mail (somente leitura) */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">E-mail</label>
            <input
              type="email"
              value={user.email}
              readOnly
              disabled
              className="w-full p-3 rounded-xl bg-gray-100 border border-gray-100 text-gray-500 text-sm cursor-not-allowed"
            />
            <p className="text-[10px] text-gray-400 mt-1">Alteração de e-mail não disponível aqui.</p>
          </div>

          {/* CPF/CNPJ */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">CPF ou CNPJ *</label>
            <input
              type="text"
              placeholder="Somente números (11 ou 14 dígitos)"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
              maxLength={14}
              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            />
            <p className="text-[10px] text-gray-400 mt-1">Obrigatório para gerar cobrança PIX.</p>
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Telefone (celular) *</label>
            <input
              type="text"
              placeholder="Ex: 11999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              maxLength={11}
              className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            />
          </div>

          {message && (
            <div className={`p-4 rounded-2xl text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <><i className="fas fa-spinner fa-spin" /> Salvando...</> : <><i className="fas fa-check" /> Salvar perfil</>}
          </button>
        </form>

        {isComplete && (
          <div className="mt-6 p-4 rounded-2xl bg-green-50 border border-green-100 text-green-800 text-sm flex items-center gap-3">
            <i className="fas fa-check-circle text-green-600 text-xl" />
            <span>Perfil completo. No pagamento PIX usaremos esses dados automaticamente.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientProfile;
