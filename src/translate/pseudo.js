// Traduction d'une démarche sans IA. L'élève écrit en français, avec un vocabulaire restreint
// (un pseudo-code) : chaque phrase est reconnue par une règle, puis traduite en Python restreint.
// Ce qui manque (le nom d'une liste, la variable d'un parcours, des valeurs pour essayer) est
// demandé à l'élève : sa réponse complète sa démarche, qui devient explicite.
// Conventions : affectation avec <-, ←, = ou « prend la valeur » ; les blocs suivent
// l'indentation, comme en Python ; « de 0 à 4 » compte 0 et 4.
import { check } from '../python/interpreter.js';
import { KEYWORDS } from '../python/tokenizer.js';

// ---------------------------------------------------------------- texte

/** Minuscules, sans accents, apostrophes droites : même longueur que le texte d'origine. */
export function fold(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let c = s[i].normalize('NFD')[0];
    if (c === '’' || c === '‘' || c === 'ʼ') c = "'";
    const low = c.toLowerCase();
    out += low.length === 1 ? low : c;
  }
  return out;
}

/** Un morceau de la démarche : son texte, sa forme repliée et sa position dans la démarche. */
function piece(text, at, line) {
  return { text, f: fold(text), at, line };
}

/** Le morceau [start, end[ de p, sans les espaces autour. */
function cut(p, start, end = p.text.length) {
  let a = start;
  let b = end;
  while (a < b && /\s/.test(p.text[a])) a++;
  while (b > a && /\s/.test(p.text[b - 1])) b--;
  return piece(p.text.slice(a, b), p.at + a, p.line);
}

function splitLines(text) {
  const lines = [];
  let offset = 0;
  text.split('\n').forEach((raw, k) => {
    const start = raw.search(/\S/);
    const hash = raw.search(/#(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (start >= 0 && hash !== start) {
      const end = (hash < 0 ? raw : raw.slice(0, hash)).replace(/\s+$/, '').length;
      const indent = raw.slice(0, start).replace(/\t/g, '    ').length;
      lines.push({ ...piece(raw.slice(start, end), offset + start, k + 1), n: k + 1, indent });
    }
    offset += raw.length + 1;
  });
  return lines;
}

// phrases d'une ligne : séparées par « . » ou « ; », hors crochets, parenthèses et guillemets
function splitSentences(line) {
  const out = [];
  const t = line.text;
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"') quote = '"';
    else if (c === '«') quote = '»';
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    // un point suivi d'un blanc (ou en fin de ligne) termine la phrase ; pas celui de 3.5 ni de L.append
    else if (depth === 0 && (c === ';' || (c === '.' && (i + 1 === t.length || /\s/.test(t[i + 1]))))) {
      out.push(cut(line, start, i));
      start = i + 1;
    }
  }
  out.push(cut(line, start));
  return out.filter((s) => s.text);
}

// mots sans rôle dans la phrase : « on ajoute… », « puis affiche… », « il faut parcourir… »
const FILLERS = /^(?:(?:et|puis|ensuite|alors|donc|enfin|d'abord|on|je|tu|il faut|il suffit de)\s+)+/;

function trimFillers(p) {
  const m = FILLERS.exec(p.f);
  return m ? cut(p, m[0].length) : p;
}

// ---------------------------------------------------------------- erreurs et questions

/** Une phrase que les règles ne savent pas traduire. */
class Untranslatable extends Error {
  constructor(message, p) {
    super(message);
    this.piece = p;
  }
}

/** Il manque une information : on la demande à l'élève. */
class Ask {
  constructor(question) {
    this.question = question;
  }
}

// ---------------------------------------------------------------- expressions

const NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
// mots du français qui ne peuvent pas être des noms de variables
const STOP = new Set([
  'le', 'la', 'les', "l'", 'de', "d'", 'du', 'des', 'un', 'une', 'et', 'ou', 'est', 'sont', 'a', 'au', 'aux', 'en',
  'dans', 'pour', 'par', 'que', "qu'", 'si', 'alors', 'sinon', 'on', 'il', 'elle', 'ce', 'cet', 'cette', 'ces',
  'son', 'sa', 'ses', 'se', "s'", 'ne', "n'", 'pas', 'fois', 'avec', 'sans', 'sur', 'sous', 'puis', 'ensuite',
  'chaque', 'tout', 'toute', 'tous', 'toutes', 'plus', 'moins', 'vaut', 'faire', 'fait',
]);
/** Un nom de variable possible : « a » sans accent en est un (a, b, c…), « à » jamais. */
const isVariableName = (name) =>
  NAME_RE.test(name) && (!STOP.has(fold(name)) || name === 'a' || name === 'A') && !KEYWORDS.has(name);
const BUILTINS = new Set(['len', 'range', 'print', 'max', 'min', 'sum', 'abs', 'round', 'int', 'float', 'str', 'sorted', 'list', 'input']);

const OPS = ['<-', '←', '==', '!=', '<=', '>=', '≤', '≥', '≠', '//', '**', '<', '>', '=', '+', '-', '*', '/', '%', '^', '²', '³', '(', ')', '[', ']', ',', ':'];

function tokenize(p) {
  const src = p.text;
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const ordinal = /^\d+(?:ere|er|re|eme|e)(?![\p{L}\p{N}_])/u.exec(fold(src.slice(i, i + 8)));
    if (/\s/.test(c)) {
      i++;
    } else if (ordinal) {
      toks.push({ k: 'word', v: src.slice(i, i + ordinal[0].length), f: ordinal[0] });
      i += ordinal[0].length;
    } else if (/\d/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      toks.push({ k: 'num', v: m[0] });
      i += m[0].length;
    } else if (c === '"' || c === '«' || c === '“') {
      const close = { '"': '"', '«': '»', '“': '”' }[c];
      const j = src.indexOf(close, i + 1);
      if (j < 0) throw new Untranslatable('un texte entre guillemets n’est pas refermé', p);
      toks.push({ k: 'str', v: src.slice(i + 1, j).trim() });
      i = j + 1;
    } else if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}\p{Nd}_]+/u.exec(src.slice(i));
      let w = m[0];
      i += w.length;
      // « l'élément », « qu'on », « n'est » : l'apostrophe reste avec le petit mot
      if (src[i] === "'" || src[i] === '’') {
        w += "'";
        i++;
      }
      toks.push({ k: 'word', v: w, f: fold(w) });
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (op) {
        toks.push({ k: 'op', v: op });
        i += op.length;
      } else if (c === "'" || c === '’') {
        i++;
      } else {
        throw new Untranslatable(`je ne comprends pas le signe « ${c} »`, p);
      }
    }
  }
  return toks;
}

// comparaisons écrites en mots, des plus longues aux plus courtes
const COMPARISONS = [
  ...['est superieur ou egal a', 'est superieure ou egale a', 'est plus grand ou egal a', 'est plus grande ou egale a',
    'superieur ou egal a', 'superieure ou egale a'].map((w) => [w, '>=']),
  ...['est inferieur ou egal a', 'est inferieure ou egale a', 'est plus petit ou egal a', 'est plus petite ou egale a',
    'inferieur ou egal a', 'inferieure ou egale a'].map((w) => [w, '<=']),
  ...['est strictement superieur a', 'est strictement superieure a', 'est superieur a', 'est superieure a',
    'est plus grand que', 'est plus grande que', 'superieur a', 'superieure a', 'plus grand que', 'plus grande que',
    'depasse'].map((w) => [w, '>']),
  ...['est strictement inferieur a', 'est strictement inferieure a', 'est inferieur a', 'est inferieure a',
    'est plus petit que', 'est plus petite que', 'inferieur a', 'inferieure a', 'plus petit que', 'plus petite que']
    .map((w) => [w, '<']),
  ["n' est pas dans", 'not in'],
  ...["n' est pas egal a", "n' est pas egale a", 'est different de', 'est differente de', 'different de',
    'differente de', 'ne vaut pas', "n' est pas"].map((w) => [w, '!=']),
  ...['est egal a', 'est egale a', 'egal a', 'egale a', 'vaut'].map((w) => [w, '==']),
  ['est dans', 'in'],
  ['appartient a', 'in'],
  ['est', '=='],
];
const SYMBOLS = { '==': '==', '!=': '!=', '≠': '!=', '<': '<', '<=': '<=', '≤': '<=', '>': '>', '>=': '>=', '≥': '>=' };
const NUMBER_WORDS = new Map(Object.entries({
  zero: '0', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10', cent: '100', mille: '1000',
}));
// « le quotient de a par b », « le reste de la division euclidienne de a par b », « le produit de a et b »
const OPERATION_NOUNS = [
  ['//', ['quotient de la division euclidienne', 'quotient de la division entiere', 'quotient entier', 'quotient']],
  ['%', ['reste de la division euclidienne', 'reste de la division entiere', 'reste de la division', 'reste']],
  ['*', ['produit']],
];
const ORDINALS = [
  [['premier', '1er', 'premiere', '1ere'], 0],
  [['deuxieme', 'second', 'seconde', '2e', '2eme'], 1],
  [['troisieme', '3e', '3eme'], 2],
];

/** Traduit une expression écrite en français ou en Python (L[i] > m, « x est pair »…). */
class Expr {
  constructor(t, p, { condition = false } = {}) {
    this.t = t;
    this.p = p;
    this.toks = tokenize(p);
    this.i = 0;
    this.condition = condition;
  }

  fail(message) {
    throw new Untranslatable(message, this.p);
  }

  peek(k = 0) {
    return this.toks[this.i + k];
  }

  /** Reconnaît une suite de mots (sans accents) et avance ; sinon ne bouge pas. */
  words(phrase) {
    const ws = phrase.split(' ');
    for (let k = 0; k < ws.length; k++) {
      const tok = this.peek(k);
      if (!tok || tok.k !== 'word' || tok.f !== ws[k]) return false;
    }
    this.i += ws.length;
    return true;
  }

  op(...ops) {
    const tok = this.peek();
    if (tok?.k === 'op' && ops.includes(tok.v)) {
      this.i++;
      return tok.v;
    }
    return null;
  }

  expect(o) {
    if (!this.op(o)) this.fail(`« ${o} » attendu${this.peek() ? ` avant « ${this.rest()} »` : ''}`);
  }

  rest() {
    return this.toks.slice(this.i).map((tok) => tok.v).join(' ');
  }

  parse() {
    if (!this.toks.length) this.fail('il manque une valeur');
    const e = this.or();
    if (this.i < this.toks.length) this.fail(`je ne comprends pas « ${this.rest()} »`);
    return e;
  }

  or() {
    let e = this.and();
    while (this.words('ou') || this.words('or')) e = `${e} or ${this.and()}`;
    return e;
  }

  and() {
    let e = this.not();
    while (this.words('et') || this.words('and')) e = `${e} and ${this.not()}`;
    return e;
  }

  not() {
    if (this.words('non') || this.words('not')) return `not ${this.not()}`;
    return this.comparison();
  }

  comparison() {
    let left;
    // « on trouve 5 », « on rencontre un nombre plus petit que m » : il s'agit de l'élément visité
    if (this.words('on trouve') || this.words('on rencontre') || this.words('on tombe sur') || this.words('on voit')) {
      left = this.t.element(this.p);
      if (this.words('un nombre') || this.words('une valeur') || this.words('un element') || this.words('un entier')) {
        // la comparaison suit
      } else if (!this.atComparison()) {
        return this.compare(left, '==', this.sum());
      }
    } else {
      left = this.sum();
    }
    if (this.words('est pair')) return `${wrap(left)} % 2 == 0`;
    if (this.words('est impair')) return `${wrap(left)} % 2 == 1`;
    if (this.words("n' est pas pair")) return `${wrap(left)} % 2 != 0`;
    if (this.words('est divisible par') || this.words('est un multiple de')) return `${wrap(left)} % ${wrap(this.sum())} == 0`;
    if (this.words('est vide')) return `len(${left}) == 0`;
    if (this.words("n' est pas vide")) return `len(${left}) > 0`;
    const symbol = this.op('==', '!=', '≠', '<=', '≤', '>=', '≥', '<', '>');
    if (symbol) return this.compare(left, SYMBOLS[symbol], this.sum());
    if (this.condition && this.op('=')) return this.compare(left, '==', this.sum());
    for (const [phrase, op] of COMPARISONS) if (this.words(phrase)) return this.compare(left, op, this.sum());
    return left;
  }

  atComparison() {
    const tok = this.peek();
    if (!tok) return false;
    if (tok.k === 'op') return tok.v in SYMBOLS || tok.v === '=';
    const save = this.i;
    const found = COMPARISONS.some(([phrase]) => this.words(phrase));
    this.i = save;
    return found;
  }

  compare(left, op, right) {
    // « cela », « il » désigneront ce dont parle la condition : « x » dans « x > m »
    if (/^[\p{L}_][\p{L}\p{N}_]*(?:\[[^\]]*\])?$/u.test(left)) this.t.lastSubject = left;
    return `${left} ${op} ${right}`;
  }

  sum() {
    let e = this.term();
    for (;;) {
      if (this.op('+') || this.plusWord('plus')) e = `${e} + ${this.term()}`;
      else if (this.op('-') || this.plusWord('moins')) e = `${e} - ${this.term()}`;
      else return e;
    }
  }

  // « x plus 1 », mais pas « x plus grand que m »
  plusWord(w) {
    const next = this.peek(1)?.f;
    if (this.peek()?.f !== w || ['grand', 'grande', 'petit', 'petite'].includes(next)) return false;
    this.i++;
    return true;
  }

  term() {
    let e = this.unary();
    for (;;) {
      const o = this.op('*', '/', '//', '%');
      if (o) e = `${e} ${o} ${this.unary()}`;
      else if (this.words('fois') || this.words('multiplie par')) e = `${e} * ${this.unary()}`;
      else if (this.words('divise par')) e = `${e} / ${this.unary()}`;
      else if (this.words('modulo')) e = `${e} % ${this.unary()}`;
      else return e;
    }
  }

  unary() {
    if (this.op('-')) return `-${this.unary()}`;
    return this.power();
  }

  // 2**n, 2^n, « 2 puissance n », « 2 à la puissance n », « n au carré », n²
  power() {
    const base = this.postfix(this.primary());
    if (this.op('**')) return `${base} ** ${this.unary()}`;
    if (this.op('^')) {
      this.t.note(this.p.line, '« ^ » : j’ai compris la puissance, qui s’écrit ** en Python.');
      return `${base} ** ${this.unary()}`;
    }
    if (this.words('a la puissance') || this.words('puissance')) return `${base} ** ${this.unary()}`;
    if (this.op('²') || this.words('au carre')) return `${base} ** 2`;
    if (this.op('³') || this.words('au cube')) return `${base} ** 3`;
    return base;
  }

  postfix(e) {
    for (;;) {
      if (this.op('[')) {
        if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(e)) this.t.read(e, 'list');
        const index = this.or();
        this.expect(']');
        e = `${e}[${index}]`;
      } else if (this.peek()?.k === 'op' && this.peek().v === '(' && /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(e)) {
        this.i++;
        const args = [];
        if (!this.op(')')) {
          do args.push(this.or());
          while (this.op(','));
          this.expect(')');
        }
        if (e === 'len' && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(args[0] ?? '')) this.t.read(args[0], 'list');
        e = `${e}(${args.join(', ')})`;
      } else return e;
    }
  }

  primary() {
    const tok = this.peek();
    if (!tok) this.fail('il manque une valeur');
    if (tok.k === 'num') {
      this.i++;
      this.t.numbers.push(tok.v);
      return tok.v;
    }
    // « deux », « dix » ; « un » seul (« ajoute un au compteur »), pas l'article de « un nombre »
    const one = (tok.f === 'un' || tok.f === 'une') && (!this.peek(1) || this.peek(1).k === 'op');
    if (tok.k === 'word' && (NUMBER_WORDS.has(tok.f) || one)) {
      this.i++;
      const n = one ? '1' : NUMBER_WORDS.get(tok.f);
      this.t.numbers.push(n);
      return n;
    }
    if (tok.k === 'str') {
      this.i++;
      return JSON.stringify(tok.v);
    }
    if (this.op('(')) {
      const e = this.or();
      this.expect(')');
      return `(${e})`;
    }
    if (this.op('[')) {
      const items = [];
      if (!this.op(']')) {
        do items.push(this.or());
        while (this.op(','));
        this.expect(']');
      }
      return `[${items.join(', ')}]`;
    }
    if (tok.k === 'op') this.fail(`je ne comprends pas « ${this.rest()} »`);
    return this.nounPhrase();
  }

  // ---------------------------------------------------------------- groupes de mots

  // « le double de x », « la moitié de x », « le carré de x », « le quotient de a par b », « le reste de a par b »
  arithmeticPhrase() {
    const save = this.i;
    this.words('du') || this.words('le') || this.words('la') || this.words("l'");
    const of = (noun) => this.words(`${noun} de`) || this.words(`${noun} d'`);
    if (of('double')) return `2 * ${wrap(this.unary())}`;
    if (of('triple')) return `3 * ${wrap(this.unary())}`;
    if (of('moitie')) {
      const x = wrap(this.unary());
      this.t.note(this.p.line, `« la moitié de ${x} » : j’ai écrit ${x} / 2, une division décimale (la moitié de 7 donne 3.5). Pour un résultat entier, écris « le quotient de ${x} par 2 ».`);
      return `${x} / 2`;
    }
    if (of('carre')) return `${wrap(this.unary())} ** 2`;
    if (of('cube')) return `${wrap(this.unary())} ** 3`;
    for (const [op, nouns] of OPERATION_NOUNS) {
      const noun = nouns.find(of);
      if (noun) {
        const a = this.sum();
        if (!(this.words('par') || this.words('et'))) this.fail(`« par » attendu, comme dans « le ${noun.split(' ')[0]} de a par b »`);
        return `${wrap(a)} ${op} ${wrap(this.unary())}`;
      }
    }
    this.i = save;
    return null;
  }

  nounPhrase() {
    const arithmetic = this.arithmeticPhrase();
    if (arithmetic) return arithmetic;
    if (this.words('la longueur de') || this.words('la longueur d\'') || this.words('la taille de') ||
      this.words('la taille d\'') || this.words('longueur de') || this.words('taille de') ||
      this.words("le nombre d' elements de") || this.words("le nombre d' elements d'")) {
      const list = this.listRef();
      return `len(${list})`;
    }
    for (const [names, index] of ORDINALS) {
      for (const n of names) {
        if (this.words(`le ${n} element de`) || this.words(`le ${n} element d'`) || this.words(`la ${n} valeur de`) ||
          this.words(`le ${n} de`) || this.words(`le ${n} d'`)) {
          return `${this.listRef()}[${index}]`;
        }
      }
    }
    if (this.words('le dernier element de') || this.words("le dernier element d'") || this.words('le dernier de') ||
      this.words("le dernier d'")) {
      const list = this.listRef();
      return `${list}[len(${list}) - 1]`;
    }
    // « l'élément d'indice i de L »
    if (this.words("l' element d' indice") || this.words("l' element numero") || this.words("l' element en position") ||
      this.words("l' element a l' indice") || this.words("la valeur d' indice")) {
      const index = this.sum();
      if (!(this.words('de') || this.words("d'") || this.words('du') || this.words('dans'))) this.fail('« de » attendu : l’élément d’indice i de L');
      return `${this.listRef()}[${index}]`;
    }
    // « l'élément », « la valeur rencontrée » : l'élément que le parcours visite
    if (this.words("l' element") || this.words('cet element') || this.words('la valeur rencontree') ||
      this.words('le nombre rencontre') || this.words("l' entier")) {
      this.words('courant') || this.words('rencontre') || this.words('actuel') || this.words('visite');
      return this.t.element(this.p);
    }
    // « la valeur x rencontrée », « la valeur de m »
    if (this.words('la valeur de') || this.words("la valeur d'") || this.words('la valeur')) {
      const name = this.name();
      this.words('rencontree') || this.words('courante') || this.words('actuelle');
      return name;
    }
    // « cela », « il » : ce dont parlait la condition
    for (const w of ['cela', 'ca', 'celui-ci', 'celle-ci', 'celui', 'celle', 'il', 'elle']) {
      if (this.words(w)) {
        this.words('ci');
        if (!this.t.lastSubject) this.fail(`« ${w} » : écris plutôt le nom de la variable`);
        this.t.note(this.p.line, `« ${w} » : j’ai compris ${this.t.lastSubject}.`);
        return this.t.lastSubject;
      }
    }
    if (this.words('vrai') || this.words('true')) return 'True';
    if (this.words('faux') || this.words('false')) return 'False';
    if (this.words('rien') || this.words('none')) return 'None';
    // « le compteur », « la variable m », « la liste L »
    const article = ['le', 'la', "l'", 'les', 'un', 'une', 'son', 'sa', 'ses'].find((a) => this.peek()?.f === a);
    if (article) {
      const save = this.i;
      this.i++;
      this.words('variable') || this.words('liste') || this.words('tableau');
      if (this.isName(this.peek())) return this.name();
      this.i = save;
    }
    return this.name();
  }

  isName(tok) {
    return tok?.k === 'word' && isVariableName(tok.v);
  }

  name() {
    const tok = this.peek();
    if (!this.isName(tok)) this.fail(tok ? `je ne comprends pas « ${this.rest()} »` : 'il manque une valeur');
    this.i++;
    const name = this.t.resolve(tok.v, this.p);
    this.t.read(name, 'value');
    return name;
  }

  // « de L », « de la liste L », ou la liste du parcours en cours si elle n'est pas nommée
  listRef() {
    this.words('la liste') || this.words('le tableau') || this.words('liste');
    if (this.isName(this.peek())) {
      const name = this.name();
      this.t.read(name, 'list');
      return name;
    }
    return this.t.currentList(this.p);
  }
}

const wrap = (e) => (/^[\p{L}\p{N}_.[\]()]+$/u.test(e) ? e : `(${e})`);

// ---------------------------------------------------------------- règles

const NAME = '[a-z_][a-z0-9_]*';
// « de », « d' », « dans », « du », « parmi » : le mot entier, puis des blancs facultatifs
const OF = "(?:(?:de|dans|du|parmi)\\b|d')\\s*";
const TARGET = `${NAME}(?:\\s*\\[[^\\]]*\\])*`;

// une règle : expression régulière sur le texte replié ; les espaces valent un ou plusieurs blancs
const rule = (source) => new RegExp(`^(?:${source.replace(/ /g, '\\s+')})$`, 'd');

/** Le morceau de p capturé par le groupe g (avec sa position), ou null. */
function group(p, m, g) {
  const span = m.indices.groups[g];
  return span ? cut(p, span[0], span[1]) : null;
}

const HEADERS = [
  {
    kind: 'indices',
    re: rule(`pour (?:chaque|tout|tous les|toutes les) (?<kind>indices?|positions?|rangs?)(?: (?<v>${NAME}))?(?: ${OF}(?:(?<lw>la liste|le tableau|liste|tableau)\\b\\s*)?(?<l>${NAME})?)?`),
  },
  {
    kind: 'values',
    re: rule(`pour (?:chaque|tout|tous les|toutes les) (?:(?<kind>elements?|valeurs?|nombres?|entiers?|termes?|cases?|notes?|mots?|lettres?|caracteres?) )?(?:(?<v>${NAME}) )?${OF}(?:(?<lw>la liste|le tableau|liste|tableau)\\b\\s*)?(?<l>${NAME})?`),
  },
  {
    kind: 'range',
    re: rule(`pour (?:(?:chaque|tout|tous les|toutes les) (?:(?:entiers?|nombres?|valeurs?|indices?|rangs?|positions?) )?)?(?<v>${NAME}) (?:allant |variant |qui va |qui varie |prenant les valeurs |qui prend les valeurs )?de (?<a>.+?) (?:a|jusqu'a) (?<b>.+?)(?: inclus)?`),
  },
  // « fonction double(x) », « définir la fonction double(x) », « def double(x): »
  { kind: 'function', re: rule(`(?:(?:(?:definir|definis|definit|definissons) )?(?:la |une )?fonction|def|soit la fonction) (?<name>${NAME})\\s*\\((?<params>[^)]*)\\)\\s*:?`) },
  {
    kind: 'traverse',
    re: rule(`(?:parcour(?:s|t|ir|rir|ons|ez|e)|regarde(?:r|s)?|examine(?:r|s)?|passe(?:r)? en revue|traverse(?:r|s)?)(?: (?:chaque|tous les|toutes les|les) (?<kind>elements?|valeurs?|nombres?|cases?|entiers?)(?: (?<v1>${NAME}))? (?:de|d'|du|dans))?(?: (?<lw>la liste|le tableau|liste|tableau)\\b)?(?: (?<l>${NAME}))?(?: (?<by>avec|en utilisant|a l'aide de|a l'aide d'|en t'aidant de|en t'aidant d'|en te servant de|grace a) (?:(?:la|une) variable (?:d'indice )?|(?<idx1>l'indice|un indice) )?(?<v2>${NAME})(?<idx2> pour (?:les|ses) indices| comme indice| pour l'indice)?)?`),
  },
  { kind: 'python-for', re: rule(`for (?<v>${NAME}) in (?<e>.+)`) },
  { kind: 'while', re: rule("(?:tant que\\s+|tant qu'\\s*|while\\s+)(?<c>.+)") },
  { kind: 'elif', re: rule('(?:sinon si|sinon, si|elif) (?<c>.+)') },
  { kind: 'else', re: rule('(?:sinon|else)') },
  { kind: 'if', re: rule("(?:si\\s+|s'il\\s+|if\\s+|des que\\s+|des qu'\\s*|lorsque\\s+|lorsqu'\\s*|quand\\s+)(?<c>.+)") },
  { kind: 'each-time', re: rule("(?:a )?chaque fois (?:que\\s+|qu'\\s*)(?<c>.+)") },
];

// « fonction double(x) » : ce qui suit, décalé, est le corps de la fonction
const FUNCTION_START = /^(?:(?:(?:definir|definis|definit|definissons)\s+)?(?:la\s+|une\s+)?fonction\s|def\s|soit\s+la\s+fonction\s)/;
const HEADER_START =
  /^(?:pour\s|parcour|regard|examin|passe(?:r)?\s+en\s+revue|travers|tant\s+qu|sinon\b|si\b|s'il\b|a\s+chaque\s+fois|chaque\s+fois|des\s+qu|lorsqu|quand\s|for\s|while\s|if\s|elif\s|else\b|(?:(?:definir|definis|definit|definissons)\s+)?(?:la\s+|une\s+)?fonction\s|def\s|soit\s+la\s+fonction\s)/;
const LOOP_START = /^(?:pour\s|parcour|regard|examin|passe(?:r)?\s+en\s+revue|travers|tant\s+qu|for\s|while\s)/;

// « après avoir vu toute la liste… » : la phrase vient après le parcours
const AFTER_LOOP =
  /^(?<si>si\s+)?(?:et\s+|puis\s+)?(?:apres\s+(?:avoir\s+(?:vu|parcouru|regarde|examine|teste|passe\s+en\s+revue)\s+(?:toute\s+la\s+liste(?:\s+(?!on\b|et\b|puis\b|alors\b)[a-z_][a-z0-9_]*)?|tous\s+les\s+elements|la\s+liste(?:\s+entiere)?)|le\s+parcours|la\s+boucle)|a\s+la\s+fin(?:\s+du\s+parcours|\s+de\s+la\s+boucle|\s+de\s+la\s+liste)?|une\s+fois\s+(?:la\s+liste\s+(?:entierement\s+)?parcourue|le\s+parcours\s+(?:fini|termine))|en\s+fin\s+de\s+parcours)\s*,?\s*/;
const NOT_FOUND = /^(?:on\s+n'a\s+pas\s+trouve|on\s+ne\s+l'a\s+pas\s+trouve|on\s+n'a\s+rien\s+trouve|[a-z_][a-z0-9_]*\s+n'a\s+pas\s+ete\s+trouve)\b/;
const TITLE = /^(?:demarche|algorithme|programme|but|objectif|methode|probleme)\b/;

// « divise p par 2 en division entière », « … (division euclidienne) »
const INTEGER_DIVISION = '(?<int>,? (?:en |avec (?:la |une )?)?division (?:entiere|euclidienne)| \\(division (?:entiere|euclidienne)\\))?';

const V = {
  ajouter: 'ajoute|ajouter|ajoutes|rajoute|rajouter|rajoutes|additionne|additionner',
  retirer: 'enleve|enlever|enleves|retire|retirer|retires|soustrais|soustraire',
  mettre: 'met|mets|mettre|place|places|placer|range|ranges|ranger',
};

const STATEMENTS = [
  ['assign', rule(`(?<v>${TARGET})\\s*(?:<-|←|:=|=(?!=))\\s*(?<e>.+)`)],
  ['assign', rule(`(?<v>${TARGET}) (?:prend|prends|prendre) (?:la valeur(?: de\\b| d')?|pour valeur|comme valeur)\\s*(?<e>.+)`)],
  ['assign', rule(`(?<v>${TARGET}) (?:recoit|recois|recevoir) (?:la valeur(?: de\\b| d')?\\s*)?(?<e>.+)`)],
  ['assign', rule(`(?<e>.+?) (?:est|devient|sera|deviendra|represente) (?:la |le )?nouve(?:lle|au) (?:valeur|maximum|minimum|max|min|plus grand|plus petit)(?:\\s+(?:de|pour)\\s+|\\s+d'\\s*|\\s+)(?<v>${TARGET})`)],
  ['assign', rule(`(?<v>${TARGET}) (?:devient|devenir) (?<e>.+)`)],
  ['assign', rule(`(?:met|mets|mettre|place|places|placer|range|ranges|ranger|stocke|stockes|stocker|enregistre|enregistrer) (?<e>.+?) dans (?:la variable |la case )?(?<v>${TARGET})`)],
  ['assign', rule(`(?:initialise|initialises|initialiser) (?:la variable )?(?<v>${TARGET}) (?:a|avec) (?<e>.+)`)],
  ['append', rule(`(?:${V.ajouter}|${V.mettre}) (?<e>.+?) a la fin (?:de |d'|du )(?:(?:la liste|le tableau) )?(?<v>${NAME})`)],
  ['add', rule(`(?:${V.ajouter}) (?<e>.+?) (?:a |au |aux |dans |a la |a l')(?:(?:liste|variable|somme|valeur de) )?(?<v>${NAME})`)],
  ['assign', rule('(?:remplace|remplacer|remplaces) (?<v>.+?) par (?<e>.+)')],
  ['assign', rule('(?:met|mets|mettre|fixe|fixer|fixes) (?<v>.+?) a (?<e>.+)')],
  // « multiplie x par 2 », « divise L[i] par 2 », « le compteur est doublé », « élève x au carré »
  ['multiply', rule("(?:multiplie|multiplier|multiplies) (?<v>.+?) par (?<e>.+)")],
  ['multiply', rule("(?<v>.+?) (?:est|sera) (?:multiplie|multipliee) par (?<e>.+)")],
  ['divide', rule(`(?:divise|diviser|divises) (?<v>.+?) par (?<e>.+?)${INTEGER_DIVISION}`)],
  ['divide', rule(`(?<v>.+?) (?:est|sera) (?:divise|divisee) par (?<e>.+?)${INTEGER_DIVISION}`)],
  ['double', rule('(?:doubler|doubles|double|(?<three>tripler|triples|triple)) (?<v>.+)')],
  ['double', rule('(?<v>.+?) (?:est|sera) (?:doublee|double|(?<three>triplee|triple))')],
  ['power', rule('(?:eleve|elever|eleves) (?<v>.+?) (?:au (?<sq>carre|cube)|a la puissance (?<e>.+))')],
  ['increment', rule(`(?:augmente|augmenter|augmentes|incremente|incrementer|incrementes) (?:(?:le|la|la variable) |l')?(?<v>${NAME})(?: de (?<e>.+))?`)],
  ['increment', rule(`(?<v>${NAME}) (?:augmente|est augmente|est augmentee) de (?<e>.+)`)],
  ['decrement', rule(`(?:diminue|diminuer|diminues|decremente|decrementer|decrementes) (?:(?:le|la|la variable) |l')?(?<v>${NAME})(?: de (?<e>.+))?`)],
  ['remove', rule(`(?:${V.retirer}) (?<e>.+?) (?:a |au |de |du |d'|de la |a la )(?:(?:liste|variable) )?(?<v>${NAME})`)],
  ['swap-element', rule("(?:l'echange|l'echanger|l'echanges|echange-le|echange-la|echanger-le|echanger-la|le permuter|la permuter|l'intervertir) (?:avec|et) (?<b>.+)")],
  ['swap', rule('(?:echange|echanger|echanges|permute|permuter|permutes|intervertis|intervertir) (?<a>.+?) (?:et|avec) (?<b>.+)')],
  ['print', rule('(?:affiches|afficher|affiche|ecris|ecrire|imprimer|imprime|montrer|montre)(?:\\s+|\\s*(?=\\())(?<e>.+)')],
  ['print', rule('print\\s*\\((?<e>.*)\\)')],
  ['return', rule('(?:renvoie|renvoyer|renvoies|renvoi|retourne|retourner|retournes|return) (?<e>.+)')],
  ['next', rule("(?:passe|passer|passes|avance|avancer|avances|va|aller) (?:a l'indice suivant|a l'element suivant|a la case suivante|au suivant|au prochain|d'une case|d'un cran|a la position suivante)")],
  ['pass', rule('(?:ne )?(?:rien faire|fais rien|ne fais rien|rien|pass)')],
];

// ---------------------------------------------------------------- structure

/**
 * Arbre des phrases : un en-tête (pour, si, tant que…) contient les phrases de son bloc.
 * D'une ligne à l'autre, l'indentation décide. Dans une ligne, ce qui suit l'en-tête d'un parcours
 * est dans le parcours ; ce qui suit un « si » s'arrête à la fin de sa phrase.
 */
function structure(lines) {
  const root = { kind: 'root', children: [] };
  const stack = [{ node: root, indent: -1 }];
  for (const line of lines) {
    while (stack.length > 1 && stack.at(-1).indent >= line.indent) stack.pop();
    let base = stack.at(-1).node;
    const open = []; // blocs ouverts dans cette ligne
    const container = () => open.at(-1)?.node ?? base;
    const header = (c) => {
      const node = { kind: 'header', c, children: [], line: line.n, indent: line.indent };
      container().children.push(node);
      return node;
    };
    // un en-tête, puis ce qui le suit dans la même phrase
    const add = (p) => {
      for (let cur = trimFillers(p); cur; ) {
        if (!HEADER_START.test(cur.f)) {
          container().children.push({ kind: 'stmt', c: cur, line: line.n, indent: line.indent });
          return;
        }
        const [head, rest] = splitHeader(cur);
        open.push({ node: header(head), loop: LOOP_START.test(head.f), fn: FUNCTION_START.test(head.f), ended: Boolean(rest) });
        cur = rest ? trimFillers(rest) : null;
      }
    };
    for (const sentence of splitSentences(line)) {
      // un « si » suivi de son action s'arrête à la fin de sa phrase
      while (open.length && !open.at(-1).loop && !open.at(-1).fn && open.at(-1).ended) open.pop();
      const p = trimFillers(sentence);
      const after = AFTER_LOOP.exec(p.f);
      if (!after) {
        add(p);
        continue;
      }
      // « après avoir vu toute la liste… » : on sort du parcours
      const k = open.findLastIndex((b) => b.loop);
      if (k >= 0) open.length = k;
      else {
        const s = stack.findLastIndex((b) => b.node.kind === 'header' && LOOP_START.test(b.node.c.f));
        if (s > 0) {
          stack.length = s;
          base = stack.at(-1).node;
        }
      }
      const rest = cut(p, after[0].length);
      const notFound = NOT_FOUND.exec(rest.f);
      if (notFound) {
        // « … on n'a pas trouvé x, renvoie False » : arrivé là, on n'a pas trouvé
        const comma = rest.text.indexOf(',', notFound[0].length);
        const node = { kind: 'not-found', c: cut(rest, 0, comma < 0 ? rest.text.length : comma), children: [], line: line.n, indent: line.indent };
        container().children.push(node);
        if (comma >= 0) {
          open.push({ node, loop: false, ended: true });
          add(cut(rest, comma + 1));
        }
      } else if (after.groups.si && rest.text.includes(',')) {
        const comma = rest.text.indexOf(',');
        const node = header(cut(rest, 0, comma));
        node.condition = true; // « si après le parcours m > 10, … » : la condition seule
        open.push({ node, loop: false, ended: true });
        add(cut(rest, comma + 1));
      } else if (rest.text) add(rest);
    }
    // les lignes suivantes, plus décalées, vont dans le dernier bloc resté ouvert
    const last = open.findLast((b) => !b.ended) ?? open.findLast((b) => b.loop) ?? open.at(-1);
    if (last) stack.push({ node: last.node, indent: line.indent });
  }
  return root.children;
}

// fin de l'en-tête : « : », « , », « alors » ou « faire », hors crochets et parenthèses
function splitHeader(p) {
  // « fonction double(x) qui renvoie 2*x », « def double(x): return 2*x » : l'en-tête finit avec les paramètres
  if (FUNCTION_START.test(p.f) && p.f.includes(')')) {
    const close = p.f.indexOf(')') + 1;
    const start = close + /^\s*[:,]?\s*(?:qui\s+|et\s+)?/.exec(p.f.slice(close))[0].length;
    return [cut(p, 0, close), start < p.text.length ? cut(p, start) : null];
  }
  const bare = /^(?:sinon|else)\b(?!\s+si\b)\s*[,:]?\s*/.exec(p.f);
  if (bare) {
    const head = cut(p, 0, bare[0].replace(/[\s,:]+$/, '').length);
    return [head, bare[0].length < p.text.length ? cut(p, bare[0].length) : null];
  }
  let depth = 0;
  for (let i = 0; i < p.f.length; i++) {
    const c = p.f[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0) {
      if (c === ':' || c === ',') return [cut(p, 0, i), i + 1 < p.text.length && cut(p, i + 1).text ? cut(p, i + 1) : null];
      const m = /^\s(alors|faire)\b/.exec(p.f.slice(i));
      if (m) return [cut(p, 0, i), cut(p, i + m[0].length).text ? cut(p, i + m[0].length) : null];
    }
  }
  return [p, null];
}

// ---------------------------------------------------------------- traduction

class Translator {
  constructor(text, lines, { dismissed = new Set() } = {}) {
    this.text = text;
    this.lines = lines;
    this.dismissed = dismissed;
    this.out = []; // { depth, code, line, data? }
    this.notes = [];
    this.loops = []; // parcours ouverts : { kind: 'values' | 'indices' | 'range' | 'while', var, list }
    this.stores = new Map(); // nom → nombre d'affectations
    this.reads = new Map(); // nom → 'list' | 'value', dans l'ordre des premières lectures
    this.lists = new Set();
    this.numbers = [];
    this.lastSubject = null;
    this.returns = false;
    this.functionDepth = 0; // dans le corps d'une fonction écrite par l'élève
    this.outerNames = new Set(); // les noms du programme, vus depuis une fonction
  }

  note(line, text) {
    if (!this.notes.some((n) => n.line === line && n.text === text)) this.notes.push({ line, text });
  }

  read(name, role) {
    if (!this.reads.has(name) || role === 'list') this.reads.set(name, role);
    if (role === 'list') this.lists.add(name);
  }

  store(name) {
    this.stores.set(name, (this.stores.get(name) ?? 0) + 1);
  }

  known() {
    return new Set([...this.stores.keys(), ...this.reads.keys(), ...this.outerNames]);
  }

  // une fonction a ses propres noms : ses paramètres et ce qui y reçoit une valeur
  enterFunction(fn) {
    fn.outer = { reads: this.reads, stores: this.stores, loops: this.loops, names: this.outerNames };
    this.outerNames = this.known();
    this.reads = new Map();
    this.stores = new Map(fn.params.map((n) => [n, 1]));
    this.loops = [];
    this.functionDepth++;
  }

  leaveFunction(fn) {
    const { reads, stores } = this;
    Object.assign(this, { reads: fn.outer.reads, stores: fn.outer.stores, loops: fn.outer.loops, outerNames: fn.outer.names });
    this.functionDepth--;
    // lu dans la fonction sans y recevoir de valeur : cela vient du programme (une liste, une autre fonction…)
    for (const [name, role] of reads) if (!stores.has(name)) this.read(name, role);
  }

  /** « L[I] » quand seule la variable i existe : on comprend L[i]. */
  resolve(word, p) {
    const known = this.known();
    if (known.has(word)) return word;
    const same = [...known].find((n) => n.toLowerCase() === word.toLowerCase());
    if (same) {
      this.note(p.line, `« ${word} » : j’ai compris ${same}.`);
      return same;
    }
    return word;
  }

  expr(p, options) {
    return new Expr(this, p, options).parse();
  }

  /** Une cible d'affectation : un nom ou une case de liste. */
  target(p) {
    const before = new Set(this.reads.keys());
    const code = this.expr(p);
    if (!/^[\p{L}_][\p{L}\p{N}_]*(?:\[.+\])?$/u.test(code)) {
      throw new Untranslatable(`« ${p.text} » ne peut pas recevoir de valeur : il faut une variable ou une case de liste`, p);
    }
    const name = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(code) ? code : null;
    if (name) {
      if (!before.has(name)) this.reads.delete(name);
      this.store(name);
    }
    return code;
  }

  /** Ce que changent « multiplie x par 2 », « double L[i] » : une variable ou une case de liste, lue puis remplacée. */
  updated(p) {
    const code = this.expr(p);
    if (!/^[\p{L}_][\p{L}\p{N}_]*(?:\[.+\])?$/u.test(code)) {
      throw new Untranslatable('seule une variable ou une case de liste peut changer de valeur', p);
    }
    if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(code)) this.store(code);
    return code;
  }

  /** L'élément que visite le parcours en cours (x dans for x in L, L[i] dans for i in range(len(L))). */
  element(p) {
    const loop = this.loops.findLast((l) => l.kind === 'values' || l.kind === 'indices');
    if (!loop) throw new Untranslatable('« l’élément » : de quel élément s’agit-il ? Aucun parcours de liste n’est en cours', p);
    return loop.kind === 'values' ? loop.var : `${loop.list}[${loop.var}]`;
  }

  currentList(p) {
    const loop = this.loops.findLast((l) => l.list);
    if (loop) return loop.list;
    if (this.lists.size === 1) return [...this.lists][0];
    throw new Untranslatable('de quelle liste s’agit-il ? Écris son nom', p);
  }

  emit(depth, code, line, extra = {}) {
    this.out.push({ depth, code, line, ...extra });
  }

  // ---------------------------------------------------------------- blocs

  block(nodes, depth) {
    for (let k = 0; k < nodes.length; k++) {
      const node = nodes[k];
      if (node.kind === 'stmt') {
        this.statement(node.c, depth);
      } else if (node.kind === 'not-found') {
        this.notFound(node, nodes[k - 1]);
        this.block(node.children, depth);
      } else {
        if (!node.children.length) this.askIndent(node, nodes[k + 1]);
        const loop = this.header(node, depth);
        if (loop?.kind === 'function') this.enterFunction(loop);
        else if (loop) this.loops.push(loop);
        if (node.children.length) this.block(node.children, depth + 1);
        else this.emit(depth + 1, 'pass', node.line);
        if (loop?.kind === 'function') this.leaveFunction(loop);
        else if (loop) this.loops.pop();
      }
    }
  }

  // un parcours (ou un « si ») sans rien dedans, suivi d'une phrase au même niveau : faut-il la décaler ?
  askIndent(node, next) {
    if (!next || next.line === node.line || next.indent !== node.indent) return;
    const id = `decaler:${next.line}`;
    if (this.dismissed.has(id)) return;
    const loop = LOOP_START.test(node.c.f);
    const fn = FUNCTION_START.test(node.c.f);
    const first = this.lines.findIndex((l) => l.n === next.line);
    let last = first;
    while (last + 1 < this.lines.length && this.lines[last + 1].indent > next.indent) last++;
    throw new Ask({
      id,
      line: next.line,
      text: loop
        ? `La phrase « ${next.c.text} » est-elle à répéter à chaque tour de « ${node.c.text} » ? Alors elle doit être décalée vers la droite, sous le parcours.`
        : fn
          ? `La phrase « ${next.c.text} » fait-elle partie de la fonction ? Alors elle doit être décalée vers la droite, sous « ${node.c.text} ».`
          : `La phrase « ${next.c.text} » fait-elle partie de « ${node.c.text} » ? Alors elle doit être décalée vers la droite, sous le « si ».`,
      choices: [
        { label: 'Oui, la décaler', edit: { indent: [next.line, this.lines[last].n] } },
        { label: 'Non', dismiss: true },
      ],
    });
  }

  // « si après avoir vu toute la liste on n'a pas trouvé x, renvoie False »
  notFound(node, previous) {
    const loop = previous?.kind === 'header' && LOOP_START.test(previous.c.f) ? previous : null;
    const stops = (nodes) => nodes.some((n) => /^(?:renvo|retourn|return)/.test(n.c.f) || stops(n.children ?? []));
    if (!loop || !stops(loop.children)) {
      throw new Untranslatable(
        `« ${node.c.text} » : comment le sait-on ? Utilise une variable, par exemple « trouve <- Faux » avant le parcours et « trouve <- Vrai » quand on trouve`,
        node.c,
      );
    }
    this.note(node.line, `« ${node.c.text} » : arrivé après le parcours, on n’a rien trouvé, sinon la démarche se serait déjà arrêtée en renvoyant son résultat.`);
  }

  header(node, depth) {
    const p = node.c;
    if (node.condition) {
      this.emit(depth, `if ${this.expr(p, { condition: true })}:`, node.line);
      return null;
    }
    for (const h of HEADERS) {
      const m = h.re.exec(p.f);
      if (!m) continue;
      const g = (name) => group(p, m, name);
      switch (h.kind) {
        case 'indices':
        case 'values':
          return this.forLoop(node, depth, h.kind, m, g);
        case 'range':
          return this.rangeLoop(node, depth, g);
        case 'traverse': {
          const byIndex = Boolean(m.groups.idx1 || m.groups.idx2);
          return this.forLoop(node, depth, byIndex ? 'indices' : 'values', m, g, { v: g('v1') ?? g('v2') });
        }
        case 'python-for': {
          const v = this.loopName(g('v'));
          const iter = this.expr(g('e').text.endsWith(':') ? cut(g('e'), 0, g('e').text.length - 1) : g('e'));
          this.store(v);
          const list = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(iter) ? iter : null;
          if (list) this.read(list, 'list');
          this.emit(depth, `for ${v} in ${iter}:`, node.line);
          return { kind: list ? 'values' : 'range', var: v, list };
        }
        case 'while': {
          const c = this.expr(stripColon(g('c')), { condition: true });
          this.emit(depth, `while ${c}:`, node.line);
          return { kind: 'while', cond: c };
        }
        case 'elif':
          this.emit(depth, `elif ${this.expr(stripColon(g('c')), { condition: true })}:`, node.line);
          return null;
        case 'else':
          this.emit(depth, 'else:', node.line);
          return null;
        case 'function': {
          const name = g('name').text;
          if (!isVariableName(name)) throw new Untranslatable(`« ${name} » ne peut pas être le nom d’une fonction`, p);
          const params = g('params').text.trim() ? g('params').text.split(',').map((x) => x.trim()) : [];
          const wrong = params.find((x) => !isVariableName(x));
          if (wrong !== undefined) throw new Untranslatable(`« ${wrong} » ne peut pas être le nom d’un paramètre (il faut des noms de variables, par exemple « fonction double(x) »)`, p);
          this.store(name);
          this.emit(depth, `def ${name}(${params.join(', ')}):`, node.line);
          return { kind: 'function', name, params };
        }
        case 'if':
        case 'each-time':
          this.emit(depth, `if ${this.expr(stripColon(g('c')), { condition: true })}:`, node.line);
          return null;
      }
    }
    if (FUNCTION_START.test(p.f)) {
      throw new Untranslatable('une fonction s’écrit avec son nom puis ses paramètres entre parenthèses, par exemple « fonction double(x) »', p);
    }
    throw new Untranslatable('je ne sais pas traduire ce début de phrase', p);
  }

  loopName(p) {
    const name = p.text.replace(/:$/, '').trim();
    if (!isVariableName(name)) {
      throw new Untranslatable(`« ${name} » ne peut pas être un nom de variable`, p);
    }
    return name;
  }

  forLoop(node, depth, kind, m, g, { v = g('v') } = {}) {
    const p = node.c;
    const lw = g('lw');
    let list = g('l') ? this.resolve(g('l').text, p) : null;
    if (!list) {
      const known = [...this.lists];
      if (known.length === 1) {
        list = known[0];
        this.note(node.line, `« ${lw?.text ?? 'la liste'} » : j’ai compris ${list}, la seule liste de la démarche.`);
      } else {
        throw new Ask({
          id: `liste:${node.line}`,
          line: node.line,
          text: `« ${p.text} » : de quelle liste s’agit-il ? Écris son nom.`,
          suggestions: known.length ? known : ['L'],
          input: 'name',
          edit: lw ? { at: lw.at + lw.text.length, insert: ' {}' } : { at: p.at + p.text.length, insert: ' la liste {}' },
        });
      }
    }
    let name = v ? this.loopName(v) : null;
    if (!name && kind === 'values') name = this.inferVariable(node);
    if (!name) {
      const kindWord = g('kind');
      const used = new Set([...this.known(), ...(this.text.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])]);
      // le mot de l'élève (« pour chaque note… » : note), puis des noms courts encore libres
      const own = kind === 'values' && kindWord && !/^(?:elements?|valeurs?|cases?)$/.test(kindWord.f) ? [kindWord.text.replace(/s$/, '')] : [];
      const pool = [...own, ...(kind === 'indices' ? ['i', 'j', 'k'] : ['x', 'e', 'element']).filter((n) => !used.has(n))];
      throw new Ask({
        id: `variable:${node.line}`,
        line: node.line,
        text:
          kind === 'indices'
            ? `Pour parcourir les indices de ${list}, il faut une variable qui prend une à une les valeurs 0, 1, 2… Comment l’appelles-tu ?`
            : `Pour parcourir ${list}, il faut une variable qui prend une à une toutes les valeurs de ${list}. Comment l’appelles-tu ?`,
        suggestions: pool.filter((n) => n !== list).slice(0, 3),
        input: 'name',
        edit: kindWord
          ? { at: kindWord.at + kindWord.text.length, insert: ' {}' }
          : { at: p.at + p.text.length, insert: kind === 'indices' ? ' en utilisant la variable {} pour les indices' : ' avec la variable {}' },
        avoid: [list],
      });
    }
    this.store(name);
    this.read(list, 'list');
    if (kind === 'indices') {
      this.emit(depth, `for ${name} in range(len(${list})):`, node.line);
      return { kind: 'indices', var: name, list };
    }
    this.emit(depth, `for ${name} in ${list}:`, node.line);
    return { kind: 'values', var: name, list };
  }

  // « parcours la liste L » puis « … la valeur x rencontrée… » : la variable du parcours est x
  inferVariable(node) {
    const texts = [];
    const walk = (nodes) => nodes.forEach((n) => texts.push(n.c) && walk(n.children ?? []));
    walk(node.children);
    for (const c of texts) {
      const m = new RegExp(`(?:la valeur|l'element|le nombre) (?<v>${NAME}) (?:rencontree|rencontre|visitee|visite|courante|courant)\\b`.replace(/ /g, '\\s+'), 'd').exec(c.f);
      if (m) {
        const name = group(c, m, 'v').text;
        this.note(node.line, `La variable du parcours est ${name} : « ${cut(c, m.indices[0][0], m.indices[0][1]).text} ».`);
        return name;
      }
    }
    return null;
  }

  rangeLoop(node, depth, g) {
    const v = this.loopName(g('v'));
    const a = this.expr(g('a'));
    const b = this.expr(stripColon(g('b')));
    this.store(v);
    // « de 0 à 4 » : 4 compris, donc range s'arrête à 5
    let stop;
    const minus = / - (\d+)$/.exec(b);
    if (/^-?\d+$/.test(b)) stop = String(Number(b) + 1);
    else if (minus) stop = minus[1] === '1' ? b.slice(0, minus.index) : `${b.slice(0, minus.index)} - ${Number(minus[1]) - 1}`;
    else stop = `${b} + 1`;
    this.note(node.line, `« de ${g('a').text} à ${g('b').text.replace(/:$/, '')} » : ${v} prend toutes les valeurs de ${a} à ${b}, ${b} compris (range s’arrête juste avant ${stop}).`);
    this.emit(depth, `for ${v} in range(${a === '0' ? '' : `${a}, `}${stop}):`, node.line);
    return { kind: 'range', var: v };
  }

  // ---------------------------------------------------------------- phrases

  statement(p0, depth) {
    const p = trimFillers(p0);
    if (TITLE.test(p.f)) return this.title(p, depth);
    for (const [kind, re] of STATEMENTS) {
      const m = re.exec(p.f);
      if (!m) continue;
      const g = (name) => group(p, m, name);
      const line = p.line;
      switch (kind) {
        case 'assign': {
          const value = this.expr(g('e'));
          const target = this.target(g('v'));
          if (/^\[.*\]$/.test(value)) this.lists.add(target);
          const literal = /^(?:-?\d+(?:\.\d+)?|"[^"]*"|True|False|\[[^[\]]*\])$/.test(value);
          this.emit(depth, `${target} = ${value}`, line, depth === 0 && literal ? { data: target } : {});
          return;
        }
        case 'append': {
          const list = this.resolve(g('v').text, p);
          this.read(list, 'list');
          this.emit(depth, `${list}.append(${this.expr(g('e'))})`, line);
          return;
        }
        case 'add': {
          const value = this.expr(g('e'));
          const name = this.resolve(g('v').text, p);
          if (this.lists.has(name)) {
            this.read(name, 'list');
            this.emit(depth, `${name}.append(${value})`, line);
          } else {
            this.read(name, 'value');
            this.store(name);
            this.emit(depth, `${name} = ${name} + ${value}`, line);
          }
          return;
        }
        case 'multiply':
        case 'divide': {
          const target = this.updated(g('v'));
          const value = this.expr(g('e'));
          const op = kind === 'multiply' ? '*' : m.groups.int ? '//' : '/';
          if (op === '/') {
            this.note(line, `« ${p.text} » : j’ai compris la division décimale (7 / 2 donne 3.5). Pour la division entière (7 // 2 donne 3), écris « ${p.text} en division entière ».`);
          }
          this.emit(depth, `${target} = ${target} ${op} ${wrap(value)}`, line);
          return;
        }
        case 'double': {
          const target = this.updated(g('v'));
          this.emit(depth, `${target} = ${target} * ${m.groups.three ? 3 : 2}`, line);
          return;
        }
        case 'power': {
          const target = this.updated(g('v'));
          const exponent = m.groups.sq ? (m.groups.sq === 'carre' ? '2' : '3') : wrap(this.expr(g('e')));
          this.emit(depth, `${target} = ${target} ** ${exponent}`, line);
          return;
        }
        case 'increment':
        case 'decrement': {
          const name = this.resolve(g('v').text, p);
          const value = g('e') ? this.expr(g('e')) : '1';
          this.read(name, 'value');
          this.store(name);
          this.emit(depth, `${name} = ${name} ${kind === 'increment' ? '+' : '-'} ${value}`, line);
          return;
        }
        case 'remove': {
          const value = this.expr(g('e'));
          const name = this.resolve(g('v').text, p);
          if (this.lists.has(name)) {
            this.read(name, 'list');
            this.emit(depth, `${name}.remove(${value})`, line);
          } else {
            this.read(name, 'value');
            this.store(name);
            this.emit(depth, `${name} = ${name} - ${value}`, line);
          }
          return;
        }
        case 'swap-element': {
          const loop = this.loops.findLast((l) => l.kind === 'values' || l.kind === 'indices');
          if (loop?.kind === 'values') {
            throw new Untranslatable(
              `pour échanger l’élément rencontré avec un autre, il faut connaître sa position : parcours les indices (« pour chaque indice i de ${loop.list} ») et écris ${loop.list}[i]`,
              p,
            );
          }
          return this.swap(this.element(p), this.expr(g('b')), depth, line);
        }
        case 'swap':
          return this.swap(this.expr(g('a')), this.expr(g('b')), depth, line);
        case 'print': {
          const args = g('e') ? splitTop(g('e')).map((a) => this.expr(a)) : [];
          this.emit(depth, `print(${args.join(', ')})`, line);
          return;
        }
        case 'return':
          // hors d'une fonction écrite par l'élève, c'est toute la démarche qui devient une fonction
          if (!this.functionDepth) this.returns = true;
          this.emit(depth, `return ${this.expr(g('e'))}`, line);
          return;
        case 'next': {
          const loop = this.loops.findLast((l) => l.kind === 'while');
          const index = loop && /\[([\p{L}_][\p{L}\p{N}_]*)\]/u.exec(loop.cond)?.[1];
          if (!index) throw new Untranslatable('quel indice faut-il augmenter ? Écris par exemple « i prend la valeur i + 1 »', p);
          this.note(line, `« ${p.text} » : ${index} augmente de 1.`);
          this.store(index);
          this.emit(depth, `${index} = ${index} + 1`, line);
          return;
        }
        case 'pass':
          this.emit(depth, 'pass', line);
          return;
      }
    }
    // du Python déjà écrit : L.append(x), m = max(m, x)…
    if (/[(.]/.test(p.text) && !check(p.text)) {
      for (const name of p.text.match(/(?<![\p{L}\p{N}_.])[\p{L}_][\p{L}\p{N}_]*(?![\p{L}\p{N}_])(?!\s*\()/gu) ?? []) {
        if (!KEYWORDS.has(name)) this.read(name, 'value');
      }
      this.emit(depth, p.text, p.line);
      return;
    }
    throw new Untranslatable('je ne sais pas traduire cette phrase', p);
  }

  swap(a, b, depth, line) {
    this.store('temp');
    this.emit(depth, `temp = ${a}`, line);
    this.emit(depth, `${a} = ${b}`, line);
    this.emit(depth, `${b} = temp`, line);
  }

  // « démarche pour trier la liste L = [4, 12, 7] » : seule la liste est créée
  title(p, depth) {
    const found = [...p.text.matchAll(/([\p{L}_][\p{L}\p{N}_]*)\s*(?:=|<-|←)\s*(\[[^\]]*\])/gu)];
    for (const m of found) {
      const value = this.expr(piece(m[2], p.at + m.index + m[0].indexOf(m[2]), p.line));
      this.store(m[1]);
      this.lists.add(m[1]);
      this.emit(depth, `${m[1]} = ${value}`, p.line, depth === 0 ? { data: m[1] } : {});
    }
    this.note(p.line, found.length ? `La ligne ${p.line} annonce le but : seule la liste ${found.map((m) => m[1]).join(', ')} est créée.` : `La ligne ${p.line} annonce le but : elle ne produit pas de code.`);
  }
}

function stripColon(p) {
  return p.text.endsWith(':') ? cut(p, 0, p.text.length - 1) : p;
}

// « x, y » : arguments séparés par des virgules, hors crochets et parenthèses
function splitTop(p) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < p.text.length; i++) {
    const c = p.text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"') quote = '"';
    else if (c === '«') quote = '»';
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(cut(p, start, i));
      start = i + 1;
    }
  }
  parts.push(cut(p, start));
  return parts.filter((q) => q.text);
}

// ---------------------------------------------------------------- données

const DATA_LINE = /^[\p{L}_][\p{L}\p{N}_]*\s*(?:=|<-|←|prend\s+la\s+valeur)\s*(?:\[[^\]]*\]|-?\d+(?:\.\d+)?|"[^"]*"|vrai|faux|true|false)\s*\.?$/iu;

function sampleList(numbers) {
  const list = [4, 12, 7, 2, 33];
  const constants = [...new Set(numbers.map(Number))].filter((n) => Number.isInteger(n) && n > 1 && n < 1000).slice(0, 2);
  constants.forEach((n, k) => {
    list[2 * k] = n;
    list[2 * k + 2] = n;
  });
  return `[${list.join(', ')}]`;
}

function dataQuestion(t, name, role) {
  if (role === 'list') {
    return {
      id: `donnee:${name}`,
      text: `Pour essayer ta démarche, il faut des valeurs dans la liste ${name}. Lesquelles ? (la ligne « ${name} = … » sera ajoutée au début)`,
      suggestions: [sampleList(t.numbers)],
      input: 'list',
      edit: { dataLine: `${name} = {}` },
    };
  }
  const list = t.out.find((o) => o.data && /= \[/.test(o.code));
  const items = list ? list.code.replace(/^.*?= \[|\]$/g, '').split(', ') : [];
  return {
    id: `donnee:${name}`,
    text: `Pour essayer ta démarche, il faut une valeur pour ${name}. Laquelle ? (la ligne « ${name} = … » sera ajoutée au début)`,
    suggestions: items.length > 2 ? [items[2], '100'] : ['5'],
    input: 'value',
    edit: { dataLine: `${name} = {}` },
  };
}

// ---------------------------------------------------------------- point d'entrée

const FUNCTION_NAME = 'demarche';

/**
 * Traduit une démarche en Python restreint.
 * @param {string} text la démarche de l'élève
 * @param {{dismissed?: Set<string>}} [options] questions auxquelles l'élève a répondu « non »
 * @returns {{ok: true, python: string, map: (number|null)[], hypotheses: {line, text}[], incompris: []}
 *   | {ok: false, question: object} | {ok: false, message: string, incompris: {line, text}[]}}
 */
export function translatePseudo(text, options = {}) {
  const lines = splitLines(text);
  if (!lines.length) return { ok: false, message: 'La démarche est vide.', incompris: [] };
  const t = new Translator(text, lines, options);
  try {
    t.block(structure(lines), 0);
    // un nom lu sans jamais recevoir de valeur : ce sont les données, à demander à l'élève
    for (const [name, role] of t.reads) {
      if (!t.stores.has(name) && !BUILTINS.has(name)) throw new Ask(dataQuestion(t, name, role));
    }
  } catch (e) {
    if (e instanceof Ask) return { ok: false, question: e.question };
    if (e instanceof Untranslatable) {
      const where = e.piece ? `« ${e.piece.text} » : ` : '';
      return {
        ok: false,
        message: `Je n’ai pas compris ${where}${e.message}.`,
        incompris: [{ line: e.piece?.line ?? null, text: e.message }],
      };
    }
    throw e;
  }
  let out = t.out;
  // « renvoie … » : la démarche devient une fonction, appelée avec les données
  if (t.returns) {
    const data = out.filter((o) => o.data && (t.stores.get(o.data) ?? 0) === 1);
    const params = data.map((o) => o.data);
    const body = out.filter((o) => !data.includes(o));
    out = [
      ...data,
      { depth: 0, code: `def ${FUNCTION_NAME}(${params.join(', ')}):`, line: null },
      ...body.map((o) => ({ ...o, depth: o.depth + 1 })),
      { depth: 0, code: `print(${FUNCTION_NAME}(${params.join(', ')}))`, line: null },
    ];
    t.note(null, `Ta démarche renvoie un résultat : elle devient la fonction ${FUNCTION_NAME}(${params.join(', ')}), appelée avec tes valeurs ; son résultat est affiché.`);
  }
  // la phrase de la démarche en commentaire, sur la première ligne Python qui la traduit
  const sentences = text.split('\n');
  const seen = new Set();
  const code = out.map((o) => {
    const line = `${'    '.repeat(o.depth)}${o.code}`;
    if (o.line === null || seen.has(o.line)) return line;
    seen.add(o.line);
    const sentence = sentences[o.line - 1].trim();
    return sentence.replace(/\s+/g, '') === o.code.replace(/\s+/g, '') ? line : `${line}  # ${sentence}`;
  });
  const python = code.join('\n') + '\n';
  const error = check(python);
  if (error) {
    const line = out[error.line - 1]?.line ?? null;
    return {
      ok: false,
      message: `Je n’ai pas compris la structure de la démarche${line ? ` (ligne ${line})` : ''} : ${error.message}. Vérifie les décalages (indentation) et que chaque « sinon » suit un « si ».`,
      incompris: [{ line, text: error.message }],
    };
  }
  return { ok: true, python, map: out.map((o) => o.line), hypotheses: t.notes, incompris: [] };
}

/**
 * Complète la démarche avec la réponse de l'élève à une question.
 * @returns {{text: string} | {error: string}}
 */
export function applyAnswer(text, question, answer, choice = null) {
  const edit = choice ? choice.edit : question.edit;
  let value = String(answer ?? '').trim();
  if (!choice) {
    if (question.input === 'name') {
      if (!isVariableName(value)) {
        return { error: 'Un nom de variable s’écrit d’un seul mot : des lettres, des chiffres ou _, sans commencer par un chiffre.' };
      }
      if (question.avoid?.includes(value)) return { error: `${value} est déjà le nom de la liste : choisis un autre nom.` };
    } else if (question.input === 'list') {
      if (!value.startsWith('[')) value = `[${value}]`;
      if (check(`_ = ${value}`) || !/^\[.*\]$/.test(value)) {
        return { error: 'Une liste s’écrit entre crochets, avec des valeurs séparées par des virgules : [4, 12, 7]' };
      }
    } else if (question.input === 'value') {
      if (!value || check(`_ = ${value}`)) {
        return { error: 'Une valeur : un nombre (7), un texte entre guillemets ("oui") ou une liste ([1, 2]).' };
      }
    }
  }
  if (edit.at !== undefined) return { text: text.slice(0, edit.at) + edit.insert.replace('{}', value) + text.slice(edit.at) };
  const lines = text.split('\n');
  if (edit.dataLine) {
    // après les lignes de données (et le titre) du début de la démarche
    let k = 0;
    while (k < lines.length && (!lines[k].trim() || DATA_LINE.test(lines[k].trim()) || TITLE.test(fold(lines[k].trim())))) k++;
    lines.splice(k, 0, edit.dataLine.replace('{}', value));
    return { text: lines.join('\n') };
  }
  if (edit.indent) {
    const [from, to] = edit.indent;
    for (let n = from; n <= to; n++) if (lines[n - 1]?.trim()) lines[n - 1] = `    ${lines[n - 1]}`;
    return { text: lines.join('\n') };
  }
  return { text };
}
