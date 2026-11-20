export const SAVED_KEY = 'recipe-hub:saved';
export function readSaved(): string[] {
  if (typeof window === 'undefined') return [];
  try { const value = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []; }
  catch { return []; }
}
export function writeSaved(ids: string[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event('recipe-hub:saved-changed'));
  }
}
