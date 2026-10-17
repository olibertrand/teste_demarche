// Contrôle de la réponse du modèle et assemblage du programme Python.
// La réponse vient de l'extérieur : on n'en garde que ce qui a la forme attendue,
// puis on vérifie avec notre propre analyseur que le Python produit est exécutable.
import { check } from '../python/interpreter.js';

const MAX_CODE_LINES = 300;
const MAX_TEXT = 300;
const MAX_NOTES = 20;

const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

// une ligne de la démarche déjà écrite en Python n'a pas besoin d'être répétée en commentaire
const sameCode = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

const lineNumber = (v, max) => (Number.isInteger(v) && v >= 1 && v <= max ? v : null);

function notes(list, field, max) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item[field] === 'string' && item[field].trim())
    .slice(0, MAX_NOTES)
    .map((item) => ({ line: lineNumber(item.demarche, max), text: item[field].trim().slice(0, MAX_TEXT) }));
}

/**
 * @param {unknown} answer réponse JSON du modèle
 * @param {string} text démarche de l'élève
 * @returns {{ok: true, python: string, map: (number|null)[], hypotheses: {line, text}[], incompris: {line, text}[]}
 *          | {ok: false, message: string, python?: string, line?: number}}
 *   map[k] est le numéro de la ligne de la démarche traduite par la ligne Python k + 1.
 */
export function assemble(answer, text) {
  const sentences = text.split('\n');
  const max = sentences.length;
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.lignes)) {
    return fail('La réponse ne contient pas de traduction.');
  }
  const code = [];
  const map = [];
  let previous = null;
  for (const item of answer.lignes) {
    if (!item || typeof item.code !== 'string') continue;
    const n = lineNumber(item.demarche, max);
    for (const raw of item.code.split('\n')) {
      const line = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
      if (!line.trim()) continue;
      // la phrase de la démarche en commentaire, sur la première ligne Python qui la traduit
      const sentence = n !== null && n !== previous ? sentences[n - 1].trim() : '';
      code.push(sentence && !sameCode(sentence, line) ? `${line}  # ${sentence}` : line);
      map.push(n);
      if (n !== null) previous = n;
    }
  }
  if (code.length === 0) return fail('La traduction est vide.');
  if (code.length > MAX_CODE_LINES) return fail('La traduction est trop longue.');
  const python = code.join('\n') + '\n';
  const error = check(python);
  if (error) {
    return fail(`Le Python produit n'est pas exécutable (ligne ${error.line ?? '?'} : ${error.message}).`, {
      python,
      line: error.line,
    });
  }
  return {
    ok: true,
    python,
    map,
    hypotheses: notes(answer.hypotheses, 'texte', max),
    incompris: notes(answer.incompris, 'raison', max),
  };
}
