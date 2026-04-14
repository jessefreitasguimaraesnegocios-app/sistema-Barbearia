import React, { useSyncExternalStore } from 'react';
import { APP_LOGO_SRC } from '../lib/branding';
import { subscribeThemeClass, toggleDocumentTheme } from '../lib/appTheme';

type Size = 'md' | 'sm';

const sizeClasses: Record<Size, { wrap: string; inner: string; badge: string; icon: string }> = {
  md: {
    wrap: 'h-11 w-11 rounded-xl p-[3px]',
    inner: 'rounded-[10px]',
    badge: 'h-5 w-5 -bottom-0.5 -right-0.5',
    icon: 'text-[9px]',
  },
  sm: {
    wrap: 'h-9 w-9 rounded-lg p-[2px]',
    inner: 'rounded-lg',
    badge: 'h-4 w-4 -bottom-0.5 -right-0.5',
    icon: 'text-[7px]',
  },
};

/**
 * Logo da marca + alternância modo claro/escuro (estado em `html.dark` + localStorage).
 */
export function BrandThemeToggle({ size = 'md' }: { size?: Size }) {
  const isDark = useSyncExternalStore(
    subscribeThemeClass,
    () => document.documentElement.classList.contains('dark'),
    () => false
  );

  const s = sizeClasses[size];

  return (
    <button
      type="button"
      onClick={() => void toggleDocumentTheme()}
      className={`group relative ${s.wrap} shrink-0 cursor-pointer border-0 bg-transparent p-0 text-left outline-none transition-transform duration-300 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 dark:focus-visible:ring-offset-zinc-950`}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      <span
        className={`absolute inset-0 rounded-xl bg-linear-to-br from-violet-400/35 via-fuchsia-400/15 to-indigo-500/30 opacity-90 blur-[0.5px] transition-opacity duration-500 group-hover:opacity-100 dark:from-amber-300/25 dark:via-violet-400/20 dark:to-fuchsia-500/25`}
        aria-hidden
      />
      <span
        className={`relative flex h-full w-full items-center justify-center overflow-hidden ${s.inner} bg-white shadow-[0_4px_20px_-4px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-violet-200/60 transition-shadow duration-500 group-hover:shadow-[0_8px_28px_-6px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,1)] dark:bg-zinc-900 dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/12`}
      >
        <img
          src={APP_LOGO_SRC}
          alt=""
          className="h-full w-full object-cover transition-[filter,transform] duration-500 group-hover:brightness-105 dark:brightness-110"
        />
        <span
          className={`pointer-events-none absolute ${s.badge} flex items-center justify-center rounded-full border border-white/70 bg-linear-to-br from-zinc-800 to-zinc-950 text-amber-200 shadow-md transition-transform duration-300 group-hover:scale-110 dark:border-amber-200/40 dark:from-amber-300 dark:to-amber-500 dark:text-zinc-950`}
          aria-hidden
        >
          <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'} ${s.icon}`} />
        </span>
      </span>
    </button>
  );
}
