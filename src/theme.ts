const THEME_KEY = 'superescalas-theme';

type Theme = 'light' | 'dark';

function preferredTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme, button?: HTMLButtonElement | null) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (button) {
    const dark = theme === 'dark';
    button.textContent = dark ? '☀️ Modo claro' : '🌙 Modo escuro';
    button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
  }
}

export function initTheme(buttonSelector = '#themeToggle') {
  const button = document.querySelector<HTMLButtonElement>(buttonSelector);
  let theme = preferredTheme();
  applyTheme(theme, button);
  button?.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme, button);
  });
}
