/* ==========================================================
 * Habit Warrior — SVG icon library
 *
 * Lucide-style stroke icons. All icons inherit `currentColor`
 * so they pick up the surrounding text color.
 * ========================================================== */

const PATHS = {
  // ----- HUD / stats / actions -----
  level:   '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  coins:   '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  flame:   '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  power:   '<path d="M13 2 4.09 12.97a1 1 0 0 0 .78 1.63h5.83l-1.7 7.6a1 1 0 0 0 1.78.62L20 11.4a1 1 0 0 0-.78-1.63h-5.83l1.7-7.6A1 1 0 0 0 13 2Z"/>',
  target:  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  sunrise: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  rotate:  '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  x:       '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus:    '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash:   '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check:   '<polyline points="20 6 9 17 4 12"/>',
  swords:  '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  award:   '<path d="m15.5 12.9 1.5 8.5a.5.5 0 0 1-.8.5l-3.6-2.7a1 1 0 0 0-1.2 0L7.8 21.9a.5.5 0 0 1-.8-.5l1.5-8.5"/><circle cx="12" cy="8" r="6"/>',
  crown:   '<path d="M11.6 3.3a.5.5 0 0 1 .9 0l2.9 5.6a1 1 0 0 0 1.5.3l4.3-3.7a.5.5 0 0 1 .8.5l-2.8 10.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L2 6a.5.5 0 0 1 .8-.5L7 9.2a1 1 0 0 0 1.5-.3z"/><path d="M5 21h14"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  trophy:  '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.6V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8"/><path d="M14 14.6V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  shield:  '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.5 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  chart:   '<path d="M3 3v18h18"/><path d="M7 17V11"/><path d="M12 17V7"/><path d="M17 17v-4"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bot:     '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4"/><circle cx="8.5" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/><path d="M9 18h6"/>',

  // ----- habit category icons -----
  dumbbell: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.7 21.5a2 2 0 1 1-2.8-2.8l-1.8 1.8a2 2 0 1 1-2.8-2.9l6.4-6.4a2 2 0 1 1 2.8 2.9l-1.8 1.7a2 2 0 1 1 2.8 2.9z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.4 12.8a2 2 0 1 1-2.8-2.9l1.8-1.7a2 2 0 1 1-2.9-2.8l2.9-2.9a2 2 0 1 1 2.8 2.9l1.8-1.8a2 2 0 1 1 2.8 2.8z"/>',
  book:     '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  brain:    '<path d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .5 6.6A4 4 0 1 0 12 18z"/><path d="M12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.5 6.6A4 4 0 1 1 12 18z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>',
  salad:    '<path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.4 12a2.4 2.4 0 0 1-.4-4.8 2.4 2.4 0 0 1 3.2-2.8 2.4 2.4 0 0 1 3.5-.6 2.4 2.4 0 0 1 3.4 3.4 2.4 2.4 0 0 1-1.1 3.7 2.5 2.5 0 0 1 0 1.1"/><path d="m13 12 4-4"/>',
  droplet:  '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  run:      '<circle cx="13" cy="4" r="2"/><path d="M4 22 9 13l5 1 2-3 4 4-1 2"/><path d="m13 16-3.5 6"/><path d="M7 8c1.5-1 2.5-2 5-2"/>',
  pencil:   '<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>',
  palette:  '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1a1.6 1.6 0 0 1 1.7-1.7H16.4c3 0 5.6-2.5 5.6-5.5C22 6 17.5 2 12 2z"/>',
  music:    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  code:     '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  moon:     '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  bed:      '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
};

/** Build an inline SVG element string for the given icon name. */
export function icon(name, opts = {}) {
  const path = PATHS[name];
  if (!path) return '';
  const size = opts.size || 18;
  const stroke = opts.stroke || 1.6;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="none" stroke="currentColor" stroke-width="${stroke}"
    stroke-linecap="round" stroke-linejoin="round"
    class="i ${opts.className || ''}">${path}</svg>`;
}

export function hasIcon(name) {
  return Boolean(PATHS[name]);
}

/** Curated set offered in the habit-creation modal. */
export const HABIT_ICON_CHOICES = [
  'dumbbell', 'run', 'brain', 'salad',
  'droplet', 'book', 'pencil', 'palette',
  'music', 'code', 'moon', 'bed',
];
