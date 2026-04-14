import React from 'react';
import { APP_LOGO_SRC } from '../lib/branding';
import { useTheme } from '../contexts/ThemeContext';

/** Logo da marca = alternância light/dark (só o botão, sem ícones extra). */
export function ThemeLogoButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { isDark, toggleTheme } = useTheme();
  const imgClass = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group relative shrink-0 rounded-xl p-0.5 shadow-md ring-1 ring-black/[0.06] transition-all duration-300 ease-out hover:scale-[1.045] hover:shadow-[0_14px_40px_-14px_var(--logo-toggle-glow)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,#6366f1_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-focus-ring-offset)] dark:ring-white/10"
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      <img
        src={APP_LOGO_SRC}
        alt=""
        className={`relative block object-cover ring-1 ring-black/[0.05] transition-[filter] duration-300 group-hover:brightness-[1.05] dark:ring-white/10 dark:group-hover:brightness-110 ${imgClass}`}
      />
    </button>
  );
}
