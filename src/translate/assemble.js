// Contrôle de la réponse du modèle et assemblage du programme Python.
// La réponse vient de l'extérieur : on n'en garde que ce qui a la forme attendue,
// puis on vérifie avec notre propre analyseur que le Python produit est exécutable.
import { assignedNames, check } from '../python/interpreter.js';
import { parse } from '../python/parser.js';

const MAX_CODE_LINES = 300;
const MAX_TEXT = 300;
const MAX_NOTES = 20;

const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

// une ligne de la démarche déjà écrite en Python n'a pas besoin d'être répétée en commentaire
const sameCode = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

const lineNumber = (v, max) => (Number.isInteger(v) && v >= 1 && v <= max ? v : null);

const isRange = (node) => node.type === 'Call' && node.func.type === 'Name' && node.func.id === 'range';

// L'élève donne lui-même une valeur à cette variable : « x devient 0 », « x = 0 », « on remplace x par 0 ».
const assignedByStudent = (text, name) =>
  new RegExp(`(^|[^\\p{L}\\p{N}_])${name}\\s*(=(?!=)|←|<-|devient|prend|reçoit|vaut)|remplace\\s+${name}(?![\\p{L}\\p{N}_])`, 'iu').test(text);

// Défaut de traduction connu : écrire dans la variable d'une boucle « for x in L » comme si c'était
// une case de la liste (« x = temp » pour finir un échange). La liste ne change pas : une démarche
// juste paraîtrait fausse. Sauf si la démarche elle-même donne une valeur à cette variable : c'est
// alors l'erreur de l'élève, et l'animation lui montrera que la liste ne change pas.
function loopVariableWrite(body, python, text) {
  for (const s of body) {
    if (s.type === 'For' && s.target.type === 'Name' && !isRange(s.iter) && !assignedByStudent(text, s.target.id)) {
      const lines = assignedNames(s.body).get(s.target.id);
      if (lines) {
        const list = s.iter.type === 'Name' ? s.iter.id : null;
        return { name: s.target.id, iter: python.slice(s.iter.start, s.iter.end), list, line: lines[0] };
      }
    }
    for (const block of [s.body, s.orelse]) {
      const found = Array.isArray(block) && loopVariableWrite(block, python, text);
      if (found) return found;
    }
  }
  return null;
}

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
 *          | {ok: false, message: string, python?: string, line?: number, feedback?: string}}
 *   map[k] est le numéro de la ligne de la démarche traduite par la ligne Python k + 1 ;
 *   feedback explique à Claude le défaut d'une traduction refusée, pour la redemander.
 */
export function assemble(answer, text) {
  const sentences = text.split('\n');
  const max = sentences.length;
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.lignes)) {
    return fail('La réponse ne contient pas de traduction.');
  }
  const code = [];
  const plain = []; // les mêmes lignes, sans les phrases en commentaire
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
      plain.push(line.trim());
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
  const write = loopVariableWrite(parse(python).body, python, text);
  if (write) {
    const { name, iter, list, line } = write;
    return fail(
      `La traduction modifie ${name}, la variable de la boucle « for ${name} in ${iter} » (ligne ${line}), comme si c'était une case de la liste : la liste ne changerait pas.`,
      {
        python,
        line,
        feedback:
          `Ta ligne « ${plain[line - 1]} » écrit dans ${name}, la variable de la boucle « for ${name} in ${iter} » : ` +
          `cela ne change pas la liste, car ${name} reçoit seulement une copie de chaque valeur. ` +
          `La démarche parle des éléments de la liste : pour modifier ou échanger l'élément rencontré, ` +
          (list ? `parcours les indices (for j in range(len(${list}))) et écris dans ${list}[j].` : 'parcours les indices de la liste et écris dans ses cases.'),
      },
    );
  }
  return {
    ok: true,
    python,
    map,
    hypotheses: notes(answer.hypotheses, 'texte', max),
    incompris: notes(answer.incompris, 'raison', max),
  };
}
