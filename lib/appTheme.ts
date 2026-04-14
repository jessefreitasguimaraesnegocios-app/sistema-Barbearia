export const THEME_STORAGE_KEY = 'smart-cria-theme';

export type AppTheme = 'light' | 'dark';

export function readStoredTheme(): AppTheme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* private mode / blocked */
  }
  return null;
}

export function getThemeFromDocument(): AppTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* noop */
  }
}

export function toggleDocumentTheme(): AppTheme {
  const next: AppTheme = getThemeFromDocument() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function subscribeThemeClass(onStoreChange: () => void): () => void {
  const obs = new MutationObserver(onStoreChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}
