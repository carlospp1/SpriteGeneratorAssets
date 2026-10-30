/* The page being shown. go() falls back to the first available page for a disabled one (e.g. a design
   saved with pixel edits while the editor is off). Pages react to being shown with onShown(). */
import { createValue, useValue } from '../state/signal.js';
import { ALL_PAGES, PAGES } from './env.js';

const current = createValue(PAGES[0]);
const shownHandlers = new Set();

export const nav = {
  current: () => current.get(),
  is: p => current.get() === p,
  go(page) {
    if (!ALL_PAGES.includes(page)) return;
    if (!PAGES.includes(page)) page = PAGES.includes('gen') ? 'gen' : PAGES[0];
    current.set(page);
    shownHandlers.forEach(f => f(page));
  },
  /* fn(page) every time a page is shown (also when it already was) */
  onShown(fn) { shownHandlers.add(fn); return () => shownHandlers.delete(fn); }
};
export const usePage = () => useValue(current);
