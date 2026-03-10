import React, { useState, useRef, useEffect } from 'react';

const EMAIL_DOMAINS = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com.br', '@yahoo.com', '@icloud.com', '@live.com', '@uol.com.br', '@bol.com.br'];

interface LoginFormProps {
  title: string;
  subtitle?: string;
  onSubmit: (email: string, password: string) => Promise<{ error: string | null }>;
  submitLabel?: string;
  onSuccess?: () => void;
  onGoogleSignIn?: () => Promise<{ error: string | null }>;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  title,
  subtitle,
  onSubmit,
  submitLabel = 'Entrar',
  onSuccess,
  onGoogleSignIn,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
    localStorage.setItem('beautyhub_remember_me', rememberMe ? 'true' : 'false');
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
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-4 pr-12 rounded-2xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          />
          <span className="text-sm text-gray-600">Permanecer logado</span>
        </label>
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
        {onGoogleSignIn && (
          <>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">ou</span>
              </div>
            </div>
            <button
              type="button"
              disabled={googleLoading}
              onClick={async () => {
                setError(null);
                setGoogleLoading(true);
                try {
                  const result = await onGoogleSignIn();
                  if (result?.error) setError(result.error);
                  else onSuccess?.();
                } finally {
                  setGoogleLoading(false);
                }
              }}
              className="w-full py-3.5 px-4 bg-white border border-gray-200 rounded-2xl font-medium text-gray-700
                hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm
                active:scale-[0.99] active:bg-gray-100 active:border-gray-300
                focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2
                transition-all duration-150 ease-out select-none cursor-pointer
                disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100
                flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>{googleLoading ? 'Redirecionando...' : 'Continuar com Google'}</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
};
