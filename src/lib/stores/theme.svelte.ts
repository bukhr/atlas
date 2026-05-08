import { trackEvent } from '$lib/analytics';

// Store para manejar el tema claro/oscuro
const THEME_KEY = 'theme-preference';

type Theme = 'light' | 'dark';

function createThemeStore() {
  let theme = $state<Theme>('light');

  function getInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'light';

    // Primero revisar localStorage
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    // Default: modo claro
    return 'light';
  }

  function applyTheme(newTheme: Theme) {
    if (typeof document === 'undefined') return;

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function initialize() {
    theme = getInitialTheme();
    applyTheme(theme);
  }

  function toggle() {
    theme = theme === 'light' ? 'dark' : 'light';
    trackEvent('theme_toggle', { theme });
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }

  function setTheme(newTheme: Theme) {
    theme = newTheme;
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }

  return {
    get theme() { return theme; },
    get isDark() { return theme === 'dark'; },
    initialize,
    toggle,
    setTheme
  };
}

export const themeStore = createThemeStore();
