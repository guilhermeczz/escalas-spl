const THEME_KEY = 'superescalas-theme';
const PALETTE_KEY = 'superescalas-palette';

export type Theme = 'light' | 'dark';
export type ColorPalette = 'dark' | 'pink' | 'blue' | 'green';

export function preferredTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function preferredPalette(): ColorPalette {
  const saved = localStorage.getItem(PALETTE_KEY);
  return saved === 'dark' || saved === 'pink' || saved === 'green' || saved === 'blue' ? saved : 'blue';
}

function updateThemeButton(theme: Theme, button?: HTMLButtonElement | null) {
  if (!button) return;
  const dark = theme === 'dark';
  button.textContent = dark ? '☀️ Modo claro' : '🌙 Modo escuro';
  button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
}

export function applyAppearance(theme: Theme, palette: ColorPalette, persist = true) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(PALETTE_KEY, palette);
  }
  updateThemeButton(theme, document.querySelector<HTMLButtonElement>('#themeToggle'));
}

export function initTheme(buttonSelector = '#themeToggle') {
  const button = document.querySelector<HTMLButtonElement>(buttonSelector);
  let theme = preferredTheme();
  let palette = preferredPalette();
  applyAppearance(theme, palette, false);
  updateThemeButton(theme, button);
  button?.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    palette = preferredPalette();
    applyAppearance(theme, palette);
  });
}
