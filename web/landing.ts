/**
 * Landing page behaviour: a three-state theme toggle (system → explicit) that
 * persists to localStorage and keeps the button's accessible name honest.
 * Everything else on the page is plain HTML/CSS.
 */
const STORAGE_KEY = 'paisaflow.landing.theme';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

function currentMode(): 'light' | 'dark' {
  const explicit = root.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') {
    return explicit;
  }
  return media.matches ? 'dark' : 'light';
}

function syncToggle(button: HTMLButtonElement): void {
  const dark = currentMode() === 'dark';
  button.setAttribute('aria-pressed', String(dark));
  button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
if (toggle) {
  syncToggle(toggle);
  toggle.addEventListener('click', () => {
    const next = currentMode() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode etc. — the choice just won't persist.
    }
    syncToggle(toggle);
  });
  media.addEventListener('change', () => syncToggle(toggle));
}
