import React, { useState, useRef, useEffect } from 'react';

const EMAIL_DOMAINS = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com.br', '@yahoo.com', '@icloud.com', '@live.com', '@uol.com.br', '@bol.com.br'];

interface LoginFormProps {
  title: string;
  subtitle?: string;
  onSubmit: (email: string, password: string) => Promise<{ error: string | null }>;
  submitLabel?: string;
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  title,
  subtitle,
  onSubmit,
  submitLabel = 'Entrar',
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSuggestionsOpen, setEmailSuggestionsOpen] = useState(false);
  const [emailSuggestionsFilter, setEmailSuggestionsFilter] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailListRef = useRef<HTMLDivElement>(null);

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

  const handleEmailChange = (value: string) => {
    setEmail(value);
    const atIdx = value.indexOf('@');
    if (atIdx >= 0) {
      setEmailSuggestionsFilter(value.slice(atIdx).toLowerCase());
      setEmailSuggestionsOpen(true);
    } else {
      setEmailSuggestionsOpen(false);
    }
  };

  const handleEmailSuggestionSelect = (domain: string) => {
    const current = email;
    const atIdx = current.indexOf('@');
    const beforeAt = atIdx >= 0 ? current.slice(0, atIdx) : current;
    setEmail(beforeAt + domain);
    setEmailSuggestionsOpen(false);
    emailInputRef.current?.focus();
  };

  const filteredEmailDomains = EMAIL_DOMAINS.filter(d =>
    d.toLowerCase().includes(emailSuggestionsFilter.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const timeoutMs = 15000;
    const timeoutPromise = new Promise<{ error: string | null }>((_, reject) =>
      setTimeout(() => reject(new Error('Tempo esgotado. Verifique sua conexão e tente novamente.')), timeoutMs)
    );
    try {
      const result = await Promise.race([onSubmit(email, password), timeoutPromise]);
      const err = result.error;
      if (err) {
        setError(err);
        return;
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar. Verifique sua rede.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold text-gray-800">{title}</h2>
        {subtitle && <p className="text-gray-500 mt-2 text-sm">{subtitle}</p>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">E-mail</label>
          <input
            ref={emailInputRef}
            type="email"
            required
            value={email}
            onChange={e => handleEmailChange(e.target.value)}
            onFocus={() => email.includes('@') && setEmailSuggestionsOpen(true)}
            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            placeholder="seu@email.com"
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
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          {loading ? 'Entrando...' : submitLabel}
        </button>
      </form>
    </div>
  );
};
