// Écriture « à la main » des phrases de la démarche, au choix parmi trois polices stockées dans
// src/fonts ; dans style.css, size-adjust leur donne la même hauteur de minuscules.
export const HAND_FONTS = [
  { id: 'playpen-sans', family: 'Playpen Sans', label: 'Playpen Sans (ronde)' },
  { id: 'delius', family: 'Delius', label: 'Delius (arrondie)' },
  { id: 'comic-neue', family: 'Comic Neue', label: 'Comic Neue (bande dessinée)' },
];

/** Applique l'écriture choisie (la première si l'identifiant est inconnu) et renvoie son identifiant. */
export function applyHandFont(id) {
  const font = HAND_FONTS.find((f) => f.id === id) ?? HAND_FONTS[0];
  document.documentElement.style.setProperty('--hand-family', `"${font.family}"`);
  return font.id;
}
