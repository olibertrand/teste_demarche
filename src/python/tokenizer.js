// Analyse lexicale : découpe le programme en lexèmes (tokens), gère l'indentation
// (INDENT / DEDENT) et conserve les commentaires, qui portent les phrases de la démarche.
import { PyError, syntaxError } from './errors.js';

export const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

// Du plus long au plus court, pour reconnaître « **= » avant « ** » puis « * ».
const OPERATORS = [
  '**=', '//=', '>>=', '<<=',
  '->', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', ':=',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '@', '&', '|', '^', '~',
];

const CLOSING = { ')': '(', ']': '[', '}': '{' };

// Caractères qu'un élève tape souvent en venant du français ou des maths.
const QUOTES_HINT = 'utilise des guillemets droits " ou \' (pas des guillemets typographiques)';
const HINTS = {
  '≤': 'écris <= au lieu de ≤',
  '≥': 'écris >= au lieu de ≥',
  '≠': 'écris != au lieu de ≠',
  '←': "en Python, l'affectation s'écrit avec =",
  '×': "la multiplication s'écrit *",
  '÷': "la division s'écrit /",
  '“': QUOTES_HINT,
  '”': QUOTES_HINT,
  '‘': QUOTES_HINT,
  '’': QUOTES_HINT,
  '«': QUOTES_HINT,
  '»': QUOTES_HINT,
  '!': "« non » s'écrit not et « différent de » s'écrit !=",
};

const isDigit = (c) => c >= '0' && c <= '9';
const IDENT_START = /[\p{L}\p{Nl}_]/u;
const IDENT_PART = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/u;
const STRING_PREFIX = /^(r|u|f|b|br|rb|fr|rf)$/i;

/**
 * @param {string} src
 * @returns {{ tokens: object[], comments: Map<number, {text: string, alone: boolean}> }}
 */
export function tokenize(src) {
  const tokens = [];
  const comments = new Map();
  const indents = [0];
  const brackets = []; // pile des parenthèses ouvertes : { char, line }
  const n = src.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let atLineStart = true;

  const push = (type, value, start, end, tokLine = line, extra = {}) =>
    tokens.push({ type, value, line: tokLine, col: start - lineStart, start, end, ...extra });

  const newline = () => {
    if (src[i] === '\r' && src[i + 1] === '\n') i += 2;
    else i += 1;
    line++;
    lineStart = i;
  };

  const readComment = (alone) => {
    const start = i;
    while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
    comments.set(line, { text: src.slice(start + 1, i).trim(), alone });
  };

  while (i < n) {
    // ---- début de ligne logique : mesure de l'indentation
    if (atLineStart && brackets.length === 0) {
      let col = 0;
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\f')) {
        col = src[j] === '\t' ? (Math.floor(col / 8) + 1) * 8 : src[j] === '\f' ? 0 : col + 1;
        j++;
      }
      if (j >= n || src[j] === '\n' || src[j] === '\r' || src[j] === '#') {
        // ligne vide ou simple commentaire : sans effet sur l'indentation
        i = j;
        if (src[i] === '#') readComment(true);
        if (i < n) newline();
        continue;
      }
      const top = indents[indents.length - 1];
      if (col > top) {
        if (tokens.length === 0) {
          throw new PyError('IndentationError', 'la première ligne ne doit pas être indentée (décalée vers la droite)', line);
        }
        indents.push(col);
        push('INDENT', col, j, j);
      } else if (col < top) {
        while (col < indents[indents.length - 1]) {
          indents.pop();
          push('DEDENT', col, j, j);
        }
        if (col !== indents[indents.length - 1]) {
          throw new PyError(
            'IndentationError',
            'ce retrait ne correspond à aucun niveau d’indentation des lignes précédentes',
            line,
          );
        }
      }
      i = j;
      atLineStart = false;
      continue;
    }

    const c = src[i];

    if (c === '\n' || c === '\r') {
      if (brackets.length === 0) {
        push('NEWLINE', '', i, i);
        atLineStart = true;
      }
      newline();
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\f') {
      i++;
      continue;
    }
    if (c === '#') {
      readComment(false);
      continue;
    }
    if (c === '\\' && (src[i + 1] === '\n' || src[i + 1] === '\r')) {
      i++;
      newline();
      continue;
    }

    // ---- nombres
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      readNumber();
      continue;
    }

    // ---- noms, mots-clés, préfixes de chaînes (f"…", r'…')
    if (IDENT_START.test(c)) {
      const start = i;
      while (i < n && IDENT_PART.test(src[i])) i++;
      const word = src.slice(start, i);
      if ((src[i] === '"' || src[i] === "'") && STRING_PREFIX.test(word)) {
        readString(word.toLowerCase(), start);
      } else {
        push(KEYWORDS.has(word) ? 'KEYWORD' : 'NAME', word, start, i);
      }
      continue;
    }
    if (c === '"' || c === "'") {
      readString('', i);
      continue;
    }

    // ---- opérateurs et ponctuation
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      if (op === '(' || op === '[' || op === '{') brackets.push({ char: op, line });
      else if (op in CLOSING) {
        const open = brackets.pop();
        if (!open) throw syntaxError(`« ${op} » fermant sans « ${CLOSING[op]} » ouvrant correspondant`, line);
        if (open.char !== CLOSING[op]) {
          throw syntaxError(`« ${op} » ne correspond pas au « ${open.char} » ouvert ligne ${open.line}`, line);
        }
      }
      push('OP', op, i, i + op.length);
      i += op.length;
      continue;
    }

    const hint = HINTS[c];
    throw syntaxError(`caractère inattendu « ${c} »` + (hint ? ` : ${hint}` : ''), line);
  }

  if (brackets.length > 0) {
    const open = brackets[brackets.length - 1];
    throw syntaxError(`le « ${open.char} » ouvert ligne ${open.line} n'est jamais refermé`, open.line);
  }
  const last = tokens[tokens.length - 1];
  if (last && last.type !== 'NEWLINE' && last.type !== 'DEDENT') push('NEWLINE', '', n, n);
  while (indents.length > 1) {
    indents.pop();
    push('DEDENT', 0, n, n);
  }
  push('EOF', '', n, n);
  return { tokens, comments };

  // ------------------------------------------------------------------

  function readNumber() {
    const start = i;
    let isFloat = false;
    let value;
    if (src[i] === '0' && /[xXoObB]/.test(src[i + 1] ?? '')) {
      const base = { x: 16, o: 8, b: 2 }[src[i + 1].toLowerCase()];
      i += 2;
      const digitsStart = i;
      while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++;
      const digits = src.slice(digitsStart, i).replace(/_/g, '');
      const valid = { 16: /^[0-9a-f]+$/i, 8: /^[0-7]+$/, 2: /^[01]+$/ }[base];
      if (!valid.test(digits)) throw syntaxError(`nombre mal écrit : ${src.slice(start, i)}`, line);
      value = BigInt({ 16: '0x', 8: '0o', 2: '0b' }[base] + digits);
    } else {
      while (i < n && (isDigit(src[i]) || src[i] === '_')) i++;
      if (src[i] === '.' && src[i + 1] !== '.') {
        isFloat = true;
        i++;
        while (i < n && (isDigit(src[i]) || src[i] === '_')) i++;
      }
      if ((src[i] === 'e' || src[i] === 'E') && (isDigit(src[i + 1] ?? '') || /[+-]/.test(src[i + 1] ?? ''))) {
        isFloat = true;
        i += 2;
        while (i < n && isDigit(src[i])) i++;
      }
      const text = src.slice(start, i).replace(/_/g, '');
      value = isFloat ? Number(text) : BigInt(text);
    }
    if (i < n && IDENT_PART.test(src[i])) {
      let j = i;
      while (j < n && IDENT_PART.test(src[j])) j++;
      const written = src.slice(start, j);
      throw syntaxError(
        `« ${written} » n'est pas un nombre valide` +
          (/^\d+[\p{L}_]/u.test(written) ? ` (pour multiplier, écris ${src.slice(start, i)}*${src.slice(i, j)})` : ''),
        line,
      );
    }
    push('NUMBER', value, start, i, line, { isFloat });
  }

  function readString(prefix, start) {
    if (prefix.includes('b')) {
      throw new PyError('NotSupported', 'les chaînes d’octets (b"…") ne sont pas prises en charge', line);
    }
    const raw = prefix.includes('r');
    const isF = prefix.includes('f');
    const startLine = line;
    i = start + prefix.length;
    const qc = src[i];
    const triple = src.startsWith(qc.repeat(3), i);
    const q = triple ? qc.repeat(3) : qc;
    i += q.length;
    const contentStart = i;
    let value = '';
    for (;;) {
      if (i >= n) throw syntaxError(`chaîne de caractères non terminée : il manque le ${q} fermant`, startLine);
      if (src.startsWith(q, i)) break;
      const ch = src[i];
      if ((ch === '\n' || ch === '\r') && !triple) {
        throw syntaxError(`chaîne de caractères non terminée : il manque le ${q} fermant avant la fin de la ligne`, startLine);
      }
      if (ch === '\\' && i + 1 < n) {
        const next = src[i + 1];
        if (next === '\n' || next === '\r') {
          // retour à la ligne échappé : ignoré (sauf dans une chaîne brute)
          if (raw || isF) value += '\\\n';
          i++;
          newline();
          continue;
        }
        if (raw || isF) {
          // les f-strings sont découpées plus tard ; leurs échappements sont traités par le parseur
          value += ch + next;
          i += 2;
          continue;
        }
        const r = readEscape();
        value += r;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        value += '\n';
        newline();
        continue;
      }
      value += ch;
      i++;
    }
    const contentEnd = i;
    i += q.length;
    if (isF) {
      push('FSTRING', value, start, i, startLine, {
        raw: src.slice(contentStart, contentEnd),
        rawStart: contentStart,
        isRaw: raw,
      });
    } else {
      push('STRING', value, start, i, startLine);
    }
  }

  function readEscape() {
    const next = src[i + 1];
    const simple = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v' };
    if (next in simple) {
      i += 2;
      return simple[next];
    }
    const hexLength = { x: 2, u: 4, U: 8 }[next];
    if (hexLength) {
      const hex = src.slice(i + 2, i + 2 + hexLength);
      if (hex.length !== hexLength || !/^[0-9a-fA-F]+$/.test(hex)) {
        throw syntaxError(`échappement \\${next} mal écrit`, line);
      }
      i += 2 + hexLength;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    if (next >= '0' && next <= '7') {
      let j = i + 1;
      while (j < i + 4 && src[j] >= '0' && src[j] <= '7') j++;
      const code = parseInt(src.slice(i + 1, j), 8);
      i = j;
      return String.fromCharCode(code);
    }
    // échappement inconnu : Python garde la barre oblique
    i += 2;
    return '\\' + next;
  }
}

/** Traite les échappements d'un morceau de f-string (hors accolades). */
export function unescapeFStringText(text, line) {
  let out = '';
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch !== '\\' || k + 1 >= text.length) {
      out += ch;
      continue;
    }
    const next = text[k + 1];
    const simple = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v', '\n': '' };
    if (next in simple) {
      out += simple[next];
      k++;
    } else if (next === 'x' || next === 'u' || next === 'U') {
      const len = { x: 2, u: 4, U: 8 }[next];
      const hex = text.slice(k + 2, k + 2 + len);
      if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) throw syntaxError(`échappement \\${next} mal écrit`, line);
      out += String.fromCodePoint(parseInt(hex, 16));
      k += 1 + len;
    } else {
      out += '\\' + next;
      k++;
    }
  }
  return out;
}
