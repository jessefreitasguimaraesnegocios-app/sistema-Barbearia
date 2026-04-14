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
    <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl transition-colors dark:border-white/[0.08] dark:bg-zinc-900/90 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
      <div className="mb-6 text-center">
        <h2 className="font-display text-2xl font-bold text-gray-800 dark:text-zinc-100">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
            E-mail
          </label>
          <input
            ref={emailInputRef}
            type="email"
            required
            value={email}
            onChange={e => handleEmailChange(e.target.value)}
            onFocus={() => email.includes('@') && setEmailSuggestionsOpen(true)}
            className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-indigo-600 dark:border-white/[0.08] dark:bg-zinc-950/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-indigo-500"
            placeholder="seu@email.com"
          />
          {emailSuggestionsOpen && (
            <div
              ref={emailListRef}
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/[0.1] dark:bg-zinc-900"
            >
              {filteredEmailDomains.length ? (
                filteredEmailDomains.map(domain => (
                  <button
                    key={domain}
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-gray-800 hover:bg-indigo-50 dark:text-zinc-200 dark:hover:bg-indigo-500/15"
                    onClick={() => handleEmailSuggestionSelect(domain)}
                  >
                    {domain}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-500">Nenhum domínio encontrado</div>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
            Senha
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 pr-12 text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-indigo-600 dark:border-white/[0.08] dark:bg-zinc-950/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-indigo-500"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300"
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
          <span className="text-sm text-gray-600 dark:text-zinc-400">Permanecer logado</span>
        </label>
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-indigo-600 py-4 font-bold text-white transition-all hover:bg-indigo-700 disabled:opacity-50 dark:shadow-lg dark:shadow-indigo-900/30"
        >
          {loading ? 'Entrando...' : submitLabel}
        </button>
        {onGoogleSignIn && (
          <>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-white/[0.08]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500 dark:bg-zinc-900 dark:text-zinc-500">ou</span>
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
              className="flex w-full cursor-pointer select-none items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 font-medium text-gray-700 transition-all duration-150 ease-out hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm active:scale-[0.99] active:border-gray-300 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-white/[0.14] dark:hover:bg-zinc-800 dark:focus:ring-zinc-600 dark:focus:ring-offset-zinc-900"
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
