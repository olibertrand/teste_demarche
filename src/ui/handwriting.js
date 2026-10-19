// Écriture « à la main » des phrases de la démarche. Choix provisoire : plusieurs polices sont
// proposées le temps de les comparer, avant d'en garder une seule. Toutes sont stockées dans
// src/fonts ; dans style.css, size-adjust les ramène à la taille de Patrick Hand.
export const HAND_FONTS = [
  { id: 'patrick-hand', family: 'Patrick Hand', label: 'Patrick Hand (droite, serrée)' },
  { id: 'playpen-sans', family: 'Playpen Sans', label: 'Playpen Sans (ronde)' },
  { id: 'delius', family: 'Delius', label: 'Delius (arrondie)' },
  { id: 'comic-neue', family: 'Comic Neue', label: 'Comic Neue (bande dessinée)' },
  { id: 'klee-one', family: 'Klee One', label: 'Klee One (stylo fin)' },
  { id: 'gochi-hand', family: 'Gochi Hand', label: 'Gochi Hand (feutre)' },
  { id: 'playwrite-fr', family: 'Playwrite FR Moderne', label: 'Playwrite FR (cursive scolaire)' },
  { id: 'atkinson', family: 'Atkinson Hyperlegible Next', label: 'Atkinson (lettres d’imprimerie)' },
];

/** Applique l'écriture choisie (la première si l'identifiant est inconnu) et renvoie son identifiant. */
export function applyHandFont(id) {
  const font = HAND_FONTS.find((f) => f.id === id) ?? HAND_FONTS[0];
  document.documentElement.style.setProperty('--hand-family', `"${font.family}"`);
  return font.id;
}
