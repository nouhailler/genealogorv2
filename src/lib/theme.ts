export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'genealogor_theme';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === 'light' || val === 'dark' || val === 'system') {
    return val;
  }
  return 'light';
}

export function isSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(mode: ThemeMode): boolean {
  if (typeof window === 'undefined') return false;
  
  const isDark = mode === 'dark' || (mode === 'system' && isSystemDark());
  const root = document.documentElement;
  
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {}

  window.dispatchEvent(new CustomEvent('genealogor:theme-change', { detail: { mode, isDark } }));
  return isDark;
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
  applyTheme(next);
  return next;
}
