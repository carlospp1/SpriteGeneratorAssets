/* Which Forja tabs are available: .env (VITE_PANEL_*_DISABLED=true hides one). Line art is a Forja tab,
   not a top-level app tool. If all of them are disabled, the generator is shown anyway. */
export const ALL_PAGES = ['gen', 'edit', 'line', 'lib'];
const FLAG = { gen: 'VITE_PANEL_GENERATOR_DISABLED', edit: 'VITE_PANEL_EDITOR_DISABLED', line: 'VITE_PANEL_LINEART_DISABLED', lib: 'VITE_PANEL_LIBRARY_DISABLED' };
const off = p => String(import.meta.env[FLAG[p]]).trim().toLowerCase() === 'true';

let pages = ALL_PAGES.filter(p => !off(p));
if (!pages.length) pages = ['gen'];
export const PAGES = pages;
export const pageEnabled = p => PAGES.includes(p);
