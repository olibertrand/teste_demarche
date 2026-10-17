// Modèle des valeurs Python et opérations de base.
//   int → BigInt   float → number   bool → boolean   str → string   None → null
//   list → PyList  tuple → PyTuple  dict → PyDict    range → PyRange
import { PyError } from './errors.js';

let nextId = 1;

// Au-delà, une liste n'a plus d'intérêt pour une animation et risque de bloquer le navigateur.
export const MAX_SEQUENCE = 1_000_000;

export class PyList {
  constructor(items = []) {
    this.items = items;
    this.id = nextId++;
    this.version = 0; // incrémenté à chaque modification (pour les instantanés)
  }
  touch() {
    this.version++;
  }
}

export class PyTuple {
  constructor(items) {
    this.items = items;
  }
}

export class PyDict {
  constructor() {
    this.map = new Map(); // clé normalisée → [clé, valeur]
    this.id = nextId++;
    this.version = 0;
  }
  static keyOf(k) {
    if (k === null) return 'N';
    switch (typeof k) {
      case 'boolean':
        return k ? 'n1' : 'n0';
      case 'bigint':
        return 'n' + k;
      case 'number':
        return Number.isInteger(k) ? 'n' + BigInt(k) : 'f' + k;
      case 'string':
        return 's' + k;
    }
    if (k instanceof PyTuple) return 't' + JSON.stringify(k.items.map(PyDict.keyOf));
    throw new PyError('TypeError', `${describe(k)} ne peut pas servir de clé de dictionnaire`);
  }
  get size() {
    return this.map.size;
  }
  has(k) {
    return this.map.has(PyDict.keyOf(k));
  }
  get(k) {
    return this.map.get(PyDict.keyOf(k))?.[1];
  }
  set(k, v) {
    const key = PyDict.keyOf(k);
    const old = this.map.get(key);
    this.map.set(key, [old ? old[0] : k, v]);
    this.version++;
  }
  delete(k) {
    this.version++;
    return this.map.delete(PyDict.keyOf(k));
  }
  keys() {
    return [...this.map.values()].map((e) => e[0]);
  }
  values() {
    return [...this.map.values()].map((e) => e[1]);
  }
  entries() {
    return [...this.map.values()];
  }
}

export class PyRange {
  constructor(start, stop, step) {
    this.start = start;
    this.stop = stop;
    this.step = step;
  }
  get length() {
    const { start, stop, step } = this;
    if (step > 0n) return stop > start ? Number((stop - start + step - 1n) / step) : 0;
    return start > stop ? Number((start - stop - step - 1n) / -step) : 0;
  }
  at(i) {
    return this.start + BigInt(i) * this.step;
  }
}

export class PyFunction {
  constructor(node, closure) {
    this.node = node; // nœud FunctionDef
    this.name = node.name;
    this.closure = closure; // portée où la fonction a été définie (null = globale)
    this.defaults = []; // valeurs par défaut évaluées à la définition
  }
}

export class PyBuiltin {
  /** fn(args, kwargs, ctx) */
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
  }
}

export class PyBoundMethod {
  constructor(self, name, fn) {
    this.self = self;
    this.name = name;
    this.fn = fn;
  }
}

export class PyModule {
  constructor(name, attrs) {
    this.name = name;
    this.attrs = attrs; // Map nom → valeur
  }
}

// ---------------------------------------------------------------- types

export function typeName(v) {
  if (v === null) return 'NoneType';
  switch (typeof v) {
    case 'bigint':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'str';
  }
  if (v instanceof PyList) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PyRange) return 'range';
  if (v instanceof PyFunction) return 'function';
  if (v instanceof PyBuiltin || v instanceof PyBoundMethod) return 'builtin_function_or_method';
  if (v instanceof PyModule) return 'module';
  return 'object';
}

const DESCRIPTIONS = {
  int: 'un entier (int)',
  float: 'un flottant (float)',
  bool: 'un booléen (bool)',
  str: 'une chaîne (str)',
  NoneType: 'None',
  list: 'une liste (list)',
  tuple: 'un tuple',
  dict: 'un dictionnaire (dict)',
  range: 'un range',
  function: 'une fonction',
  builtin_function_or_method: 'une fonction',
  module: 'un module',
};

/** Description en français du type d'une valeur : « un entier (int) »… */
export function describe(v) {
  return DESCRIPTIONS[typeName(v)] ?? typeName(v);
}

export function isInt(v) {
  return typeof v === 'bigint' || typeof v === 'boolean';
}

export function isNumeric(v) {
  const t = typeof v;
  return t === 'bigint' || t === 'number' || t === 'boolean';
}

export const intVal = (v) => (typeof v === 'boolean' ? (v ? 1n : 0n) : v);
export const numVal = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v));

// ---------------------------------------------------------------- affichage

/** Écriture d'un flottant comme le fait Python (3.0, 0.1, 1e-05, 1e+16…). */
export function floatRepr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const [mantissa, expText] = x.toExponential().split('e'); // chiffres les plus courts
  const exp = Number(expText);
  const digits = mantissa.replace('-', '').replace('.', '');
  let s;
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    s = m + 'e' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(2, '0');
  } else if (exp < 0) {
    s = '0.' + '0'.repeat(-exp - 1) + digits;
  } else if (digits.length <= exp + 1) {
    s = digits + '0'.repeat(exp + 1 - digits.length) + '.0';
  } else {
    s = digits.slice(0, exp + 1) + '.' + digits.slice(exp + 1);
  }
  return x < 0 ? '-' + s : s;
}

export function strRepr(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    if (ch === quote || ch === '\\') out += '\\' + ch;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch < ' ' || ch === '\x7f') out += '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + quote;
}

/** Équivalent de repr() en Python. */
export function repr(v, seen = new Set()) {
  if (v === null) return 'None';
  switch (typeof v) {
    case 'bigint':
      return v.toString();
    case 'number':
      return floatRepr(v);
    case 'boolean':
      return v ? 'True' : 'False';
    case 'string':
      return strRepr(v);
  }
  if (v instanceof PyList || v instanceof PyDict) {
    if (seen.has(v)) return v instanceof PyList ? '[...]' : '{...}';
    seen.add(v);
    const s =
      v instanceof PyList
        ? '[' + v.items.map((x) => repr(x, seen)).join(', ') + ']'
        : '{' + v.entries().map(([k, x]) => repr(k, seen) + ': ' + repr(x, seen)).join(', ') + '}';
    seen.delete(v);
    return s;
  }
  if (v instanceof PyTuple) {
    const parts = v.items.map((x) => repr(x, seen));
    return parts.length === 1 ? `(${parts[0]},)` : `(${parts.join(', ')})`;
  }
  if (v instanceof PyRange) {
    return v.step === 1n ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  }
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  if (v instanceof PyBuiltin) return v.isType ? `<class '${v.name}'>` : `<built-in function ${v.name}>`;
  if (v instanceof PyBoundMethod) return `<built-in method ${v.name}>`;
  if (v instanceof PyModule) return `<module '${v.name}'>`;
  return String(v);
}

/** Équivalent de str() en Python (ce qu'affiche print). */
export function str(v) {
  return typeof v === 'string' ? v : repr(v);
}

export function truthy(v) {
  if (v === null) return false;
  switch (typeof v) {
    case 'boolean':
      return v;
    case 'bigint':
      return v !== 0n;
    case 'number':
      return v !== 0;
    case 'string':
      return v.length > 0;
  }
  if (v instanceof PyList || v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  return true;
}

// ---------------------------------------------------------------- comparaisons

function seqEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!pyEq(a[i], b[i])) return false;
  return true;
}

export function pyEq(a, b) {
  if (a === b) return typeof a !== 'number' || !Number.isNaN(a);
  if (isNumeric(a) && isNumeric(b)) {
    if (typeof a === 'number' || typeof b === 'number') return numVal(a) === numVal(b);
    return intVal(a) === intVal(b);
  }
  if (a instanceof PyList && b instanceof PyList) return seqEq(a.items, b.items);
  if (a instanceof PyTuple && b instanceof PyTuple) return seqEq(a.items, b.items);
  if (a instanceof PyDict && b instanceof PyDict) {
    return a.size === b.size && a.entries().every(([k, v]) => b.has(k) && pyEq(v, b.get(k)));
  }
  if (a instanceof PyRange && b instanceof PyRange) {
    return a.length === b.length && (a.length === 0 || (a.start === b.start && (a.length === 1 || a.step === b.step)));
  }
  return false;
}

/** Ordre de Python : renvoie <0, 0 ou >0 (NaN si incomparable, comme les flottants nan). */
export function pyCmp(a, b, op) {
  if (isNumeric(a) && isNumeric(b)) {
    if (typeof a === 'number' || typeof b === 'number') {
      const x = numVal(a);
      const y = numVal(b);
      return x < y ? -1 : x > y ? 1 : x === y ? 0 : NaN;
    }
    const x = intVal(a);
    const y = intVal(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
    const n = Math.min(a.items.length, b.items.length);
    for (let i = 0; i < n; i++) {
      if (!pyEq(a.items[i], b.items[i])) return pyCmp(a.items[i], b.items[i], op);
    }
    return a.items.length - b.items.length;
  }
  throw new PyError('TypeError', `impossible de comparer ${describe(a)} et ${describe(b)} avec « ${op} »`);
}

export function contains(container, item) {
  if (container instanceof PyList || container instanceof PyTuple) {
    return container.items.some((x) => pyEq(x, item));
  }
  if (typeof container === 'string') {
    if (typeof item !== 'string') {
      throw new PyError('TypeError', `on ne peut chercher qu'une chaîne dans une chaîne, pas ${describe(item)}`);
    }
    return container.includes(item);
  }
  if (container instanceof PyDict) return container.has(item);
  if (container instanceof PyRange) {
    if (!isInt(item) && !(typeof item === 'number' && Number.isInteger(item))) return false;
    const x = typeof item === 'number' ? BigInt(item) : intVal(item);
    const { start, stop, step } = container;
    const inside = step > 0n ? x >= start && x < stop : x <= start && x > stop;
    return inside && (x - start) % step === 0n;
  }
  throw new PyError('TypeError', `« in » ne s'applique pas à ${describe(container)}`);
}

// ---------------------------------------------------------------- arithmétique

const zeroDivision = (what) => new PyError('ZeroDivisionError', what);

function floorDivBig(x, y) {
  const q = x / y;
  return x % y !== 0n && x < 0n !== y < 0n ? q - 1n : q;
}

function modBig(x, y) {
  const r = x % y;
  return r !== 0n && r < 0n !== y < 0n ? r + y : r;
}

function numericOp(op, a, b) {
  if (op === '/') {
    const y = numVal(b);
    if (y === 0) throw zeroDivision('division par zéro');
    return numVal(a) / y;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = numVal(a);
    const y = numVal(b);
    switch (op) {
      case '+':
        return x + y;
      case '-':
        return x - y;
      case '*':
        return x * y;
      case '//':
        if (y === 0) throw zeroDivision('division entière par zéro');
        return Math.floor(x / y);
      case '%': {
        if (y === 0) throw zeroDivision('reste d’une division par zéro');
        const r = x % y;
        return r !== 0 && r < 0 !== y < 0 ? r + y : r;
      }
      case '**':
        if (x === 0 && y < 0) throw zeroDivision('0 ne peut pas être élevé à une puissance négative');
        return x ** y;
    }
  } else {
    const x = intVal(a);
    const y = intVal(b);
    switch (op) {
      case '+':
        return x + y;
      case '-':
        return x - y;
      case '*':
        return x * y;
      case '//':
        if (y === 0n) throw zeroDivision('division entière par zéro');
        return floorDivBig(x, y);
      case '%':
        if (y === 0n) throw zeroDivision('reste d’une division par zéro');
        return modBig(x, y);
      case '**':
        if (y < 0n) {
          if (x === 0n) throw zeroDivision('0 ne peut pas être élevé à une puissance négative');
          return Number(x) ** Number(y);
        }
        if (x > 1n || x < -1n) {
          if (x.toString(2).length * Number(y) > 4_000_000) {
            throw new PyError('ValueError', 'résultat trop grand pour être calculé ici');
          }
        }
        return x ** y;
      case '&':
        return x & y;
      case '|':
        return x | y;
      case '^':
        return x ^ y;
      case '<<':
        if (y < 0n) throw new PyError('ValueError', 'décalage négatif');
        if (y > 100_000n) throw new PyError('ValueError', 'décalage trop grand');
        return x << y;
      case '>>':
        if (y < 0n) throw new PyError('ValueError', 'décalage négatif');
        return x >> y;
    }
  }
  return undefined;
}

function checkSize(n) {
  if (n > MAX_SEQUENCE) throw new PyError('ValueError', `séquence trop grande (${n} éléments)`);
}

export function repeatSequence(seq, n) {
  const k = Math.max(0, Number(intVal(n)));
  if (typeof seq === 'string') {
    checkSize(seq.length * k);
    return seq.repeat(k);
  }
  checkSize(seq.items.length * k);
  const items = [];
  for (let i = 0; i < k; i++) items.push(...seq.items);
  return seq instanceof PyList ? new PyList(items) : new PyTuple(items);
}

export function binaryOp(op, a, b) {
  if (isNumeric(a) && isNumeric(b)) {
    const r = numericOp(op, a, b);
    if (r !== undefined) return r;
  } else if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (a instanceof PyList && b instanceof PyList) return new PyList([...a.items, ...b.items]);
    if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
  } else if (op === '*') {
    const isSeq = (s) => typeof s === 'string' || s instanceof PyList || s instanceof PyTuple;
    if (isSeq(a) && isInt(b)) return repeatSequence(a, b);
    if (isInt(a) && isSeq(b)) return repeatSequence(b, a);
  }
  let message = `« ${op} » ne s'applique pas à ${describe(a)} et ${describe(b)}`;
  const mixesText = (typeof a === 'string') !== (typeof b === 'string') && (isNumeric(a) || isNumeric(b));
  if (mixesText) message += ' (pour mélanger texte et nombre, convertis avec str(…) ou int(…))';
  throw new PyError('TypeError', message);
}

export function unaryOp(op, v) {
  if (op === 'not') return !truthy(v);
  if (typeof v === 'number') {
    if (op === '-') return -v;
    if (op === '+') return v;
  } else if (isInt(v)) {
    const x = intVal(v);
    if (op === '-') return -x;
    if (op === '+') return x;
    if (op === '~') return ~x;
  }
  throw new PyError('TypeError', `« ${op} » ne s'applique pas à ${describe(v)}`);
}

// ---------------------------------------------------------------- indices, tranches, parcours

/** Indice Python (négatifs acceptés) → indice JS, ou -1 s'il sort de la séquence. */
export function normIndex(len, idx) {
  let i = Number(intVal(idx));
  if (i < 0) i += len;
  return i >= 0 && i < len ? i : -1;
}

/** Indices sélectionnés par seq[lo:hi:st], avec la sémantique de Python. */
export function sliceIndices(len, lo, hi, st) {
  const toNum = (v) => {
    if (!isInt(v)) throw new PyError('TypeError', `les bornes d'une tranche doivent être des entiers, pas ${describe(v)}`);
    return Number(intVal(v));
  };
  const step = st == null ? 1 : toNum(st);
  if (step === 0) throw new PyError('ValueError', "le pas d'une tranche ne peut pas être nul");
  const norm = (v) => {
    const x = toNum(v);
    return x < 0 ? x + len : x;
  };
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  let start;
  let stop;
  if (step > 0) {
    start = lo == null ? 0 : clamp(norm(lo), 0, len);
    stop = hi == null ? len : clamp(norm(hi), 0, len);
  } else {
    start = lo == null ? len - 1 : clamp(norm(lo), -1, len - 1);
    stop = hi == null ? -1 : clamp(norm(hi), -1, len - 1);
  }
  const out = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}

/**
 * Itérateur sur une valeur Python. Pour les listes, l'itération suit la liste vivante
 * (comme en Python) et indique l'indice visité, ce qui permet de l'« allumer ».
 */
export function makeIterator(v) {
  let i = 0;
  if (v instanceof PyList || v instanceof PyTuple) {
    return {
      kind: v instanceof PyList ? 'list' : 'tuple',
      ref: v,
      next: () => (i < v.items.length ? { value: v.items[i], index: i++ } : null),
    };
  }
  if (typeof v === 'string') {
    const chars = [...v];
    return { kind: 'str', ref: v, next: () => (i < chars.length ? { value: chars[i], index: i++ } : null) };
  }
  if (v instanceof PyRange) {
    const n = v.length;
    return { kind: 'range', ref: v, next: () => (i < n ? { value: v.at(i), index: i++ } : null) };
  }
  if (v instanceof PyDict) {
    const keys = v.keys();
    return { kind: 'dict', ref: v, next: () => (i < keys.length ? { value: keys[i], index: i++ } : null) };
  }
  throw new PyError('TypeError', `${describe(v)} ne se parcourt pas avec une boucle for`);
}

/** Tous les éléments d'un itérable, dans un tableau JS. */
export function toArray(v) {
  if (v instanceof PyList || v instanceof PyTuple) return [...v.items];
  if (v instanceof PyRange) checkSize(v.length);
  const it = makeIterator(v);
  const out = [];
  for (let e = it.next(); e; e = it.next()) out.push(e.value);
  return out;
}
