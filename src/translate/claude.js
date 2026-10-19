// Traduction par Claude, depuis la page publiée sur claude.ai (capacité « sample ») :
// l'appel utilise le compte Claude de la personne qui a ouvert la page, qui l'autorise au premier usage.
// Ailleurs (fichier ouvert hors ligne…), la traduction n'est pas disponible.
import { PROMPT_VERSION, buildPrompt } from './prompt.js';

const DAY = 86_400_000;

let samplePromise = null;

/** La fonction `sample` de claude.ai, ou null quand la page n'est pas ouverte dans claude.ai. */
export function getSample() {
  if (!samplePromise) {
    const claude = typeof window === 'undefined' ? undefined : window.claude;
    samplePromise =
      typeof claude?.use === 'function' ? Promise.resolve(claude.use('sample')).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

/**
 * Demande la traduction à Claude. La même démarche donne la même réponse pendant 24 h
 * (mémoire de claude.ai), sauf si `refresh` est vrai. `feedback` signale le défaut d'une
 * traduction précédente, refusée par l'application.
 */
export function askClaude(sample, text, { signal, refresh = false, feedback = null } = {}) {
  return sample.json(buildPrompt(text, { feedback }), { modelTier: 'default', signal, cache: { gcTime: DAY, refresh } });
}

// Erreurs après lesquelles il est inutile de réessayer pendant cette visite.
export const PERMANENT_ERRORS = new Set([
  'not_granted',
  'sampling_disabled',
  'not_declared',
  'capability_disabled',
  'capability_removed',
]);

const MESSAGES = {
  cancelled: 'Traduction arrêtée.',
  not_granted: 'La page n’a pas été autorisée à utiliser Claude : recharge la page et accepte pour traduire une démarche.',
  sampling_disabled: 'Claude n’est pas disponible avec ce compte : écris directement le programme dans l’onglet Python.',
  not_declared: 'La traduction n’est pas disponible dans cette version de la page.',
  capability_disabled: 'La traduction n’est pas disponible ici : écris directement le programme dans l’onglet Python.',
  capability_removed: 'La traduction n’est pas disponible ici : écris directement le programme dans l’onglet Python.',
  rate_limited: 'Trop de traductions d’affilée, ou limite d’utilisation atteinte : réessaie dans un moment.',
  session_expired: 'Ta session claude.ai a expiré : reconnecte-toi, puis réessaie.',
  refused: 'Claude n’a pas voulu traduire ce texte : reformule la démarche.',
  prompt_too_large: 'La démarche est trop longue pour être traduite.',
  empty_completion: 'La réponse est vide : réessaie, ou simplifie la démarche.',
  invalid_json: 'La réponse n’a pas pu être lue : réessaie, ou simplifie la démarche.',
  upstream_error: 'La traduction a échoué (problème de connexion ?) : réessaie.',
};

export function errorMessage(error) {
  return MESSAGES[error?.code] ?? MESSAGES.upstream_error;
}

// ---------------------------------------------------------------- mémoire du navigateur

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + text.length.toString(36);
}

const storageKey = (text) => `demarche:traduction:${PROMPT_VERSION}:${hash(text)}`;

/** Traduction déjà obtenue pour exactement ce texte (même d'un jour à l'autre), ou null. */
export function rememberedAnswer(text) {
  try {
    const raw = localStorage.getItem(storageKey(text));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function rememberAnswer(text, answer) {
  try {
    localStorage.setItem(storageKey(text), JSON.stringify(answer));
  } catch {
    // stockage plein ou indisponible : la traduction sera simplement redemandée
  }
}
