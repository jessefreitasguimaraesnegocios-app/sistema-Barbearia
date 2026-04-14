import React from 'react';
import { APP_LOGO_SRC } from '../lib/branding';
import { useTheme } from '../contexts/ThemeContext';

/** Logo da marca = alternância light/dark (premium, microinterações). */
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
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-[2] flex h-[22px] w-[22px] items-center justify-center rounded-lg border border-black/[0.07] bg-gradient-to-br from-zinc-50 to-zinc-200 text-[11px] text-amber-600 shadow-lg shadow-black/20 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 dark:border-white/12 dark:from-zinc-700 dark:to-zinc-900 dark:text-amber-200"
      >
        <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`} />
      </span>
      <img
        src={APP_LOGO_SRC}
        alt=""
        className={`relative z-[1] object-cover ring-1 ring-black/[0.05] dark:ring-white/10 ${imgClass}`}
      />
    </button>
  );
}
