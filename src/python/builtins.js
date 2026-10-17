// Fonctions prédéfinies, méthodes des listes / chaînes / dictionnaires, modules math, random et time.
// Chaque fonction reçoit (args, kwargs, ctx) ; les méthodes reçoivent (self, args, kwargs, ctx).
// ctx donne accès à l'interpréteur : emit (événements d'animation), print, input, call, random…
import { PyError } from './errors.js';
import {
  PyBoundMethod, PyBuiltin, PyDict, PyList, PyModule, PyRange, PyTuple,
  binaryOp, describe, intVal, isInt, isNumeric, normIndex, numVal, pyCmp, pyEq, repr, str, strRepr,
  toArray, truthy, typeName,
} from './values.js';

const typeError = (message) => new PyError('TypeError', message);
const valueError = (message) => new PyError('ValueError', message);

function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function checkArgs(name, args, min, max = min) {
  if (args.length >= min && args.length <= max) return;
  const expected = min === max ? plural(min, 'argument') : `de ${min} à ${plural(max, 'argument')}`;
  throw typeError(`${name}() attend ${expected}, mais en reçoit ${args.length}`);
}

function checkKwargs(name, kwargs, allowed = []) {
  for (const k of kwargs.keys()) {
    if (!allowed.includes(k)) throw typeError(`${name}() n'accepte pas d'argument nommé « ${k} »`);
  }
}

function needInt(name, v) {
  if (isInt(v)) return intVal(v);
  const hint = typeof v === 'number' ? ' (utilise // pour une division entière, ou int())' : '';
  throw typeError(`${name} attend un entier, pas ${describe(v)}${hint}`);
}

function needNumber(name, v) {
  if (isNumeric(v)) return v;
  throw typeError(`${name} attend un nombre, pas ${describe(v)}`);
}

export function shortRepr(v, max = 60) {
  const r = repr(v);
  return r.length > max ? r.slice(0, max - 1) + '…' : r;
}

// ---------------------------------------------------------------- arrondis et formats

function roundToInt(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1; // arrondi « au pair », comme Python
}

/** round(x, n) pour un flottant, avec la règle de Python (au pair sur la valeur exacte). */
function roundFloat(x, n) {
  if (!Number.isFinite(x) || x === 0) return x;
  if (n < 0) {
    const p = 10 ** -n;
    return roundToInt(x / p) * p;
  }
  if (Math.abs(x) >= 1e16 || n > 17) return x;
  const s = Math.abs(x).toFixed(Math.min(100, n + 25));
  const [intPart, fracPart] = s.split('.');
  const kept = intPart + fracPart.slice(0, n);
  const rest = fracPart.slice(n);
  let up = rest[0] > '5' || (rest[0] === '5' && /[1-9]/.test(rest.slice(1)));
  if (rest[0] === '5' && !up && !/[1-9]/.test(rest.slice(1))) up = Number(kept[kept.length - 1]) % 2 === 1;
  const scaled = BigInt(kept) + (up ? 1n : 0n);
  const result = Number(scaled) / 10 ** n;
  return x < 0 ? -result : result;
}

function groupThousands(digits, sep) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Mini-langage de format de Python : « .2f », « >5 », « 05d », « , »… */
export function formatValue(value, spec) {
  if (!spec) return str(value);
  const m = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/.exec(spec);
  if (!m) throw valueError(`format « ${spec} » non reconnu`);
  let [, fill, align, sign, , zero, width, grouping, precision, type] = m;
  const isNum = isNumeric(value);
  if (!isNum && type && type !== 's') throw valueError(`le format « ${spec} » demande un nombre, pas ${describe(value)}`);
  if (zero && !align) {
    fill = '0';
    align = '=';
  }
  fill = fill ?? ' ';
  let body;
  let prefix = '';
  if (!isNum) {
    body = str(value);
    if (precision !== undefined) body = body.slice(0, Number(precision));
    align = align ?? '<';
  } else {
    align = align ?? '>';
    let x = value;
    const neg = typeof x === 'number' ? x < 0 || Object.is(x, -0) : intVal(x) < 0n;
    if (type === 'd' || type === 'b' || type === 'o' || type === 'x' || type === 'X' || type === 'n' || type === 'c') {
      if (!isInt(x)) throw valueError(`le format « ${type} » demande un entier`);
      const n = intVal(x);
      const abs = n < 0n ? -n : n;
      if (type === 'c') body = String.fromCodePoint(Number(abs));
      else {
        body = abs.toString({ b: 2, o: 8, x: 16, X: 16, d: 10, n: 10 }[type]);
        if (type === 'X') body = body.toUpperCase();
      }
    } else if (type || precision !== undefined || typeof x === 'number') {
      const f = numVal(x);
      const abs = Math.abs(f);
      const p = precision === undefined ? 6 : Number(precision);
      if (type === 'f' || type === 'F') body = roundFloat(abs, p).toFixed(p);
      else if (type === '%') body = roundFloat(abs * 100, p).toFixed(p) + '%';
      else if (type === 'e' || type === 'E') {
        body = abs.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        if (type === 'E') body = body.toUpperCase();
      } else if (!type && precision === undefined) body = str(abs);
      else {
        // g (ou précision sans type) : chiffres significatifs, sans zéros inutiles
        body = String(Number(abs.toPrecision(Math.max(1, p))));
        if (!type && typeof x === 'number' && !/[.e]/.test(body)) body += '.0';
        if (type === 'G') body = body.toUpperCase();
      }
      if (!Number.isFinite(f)) body = Number.isNaN(f) ? 'nan' : 'inf';
    } else {
      body = (intVal(x) < 0n ? -intVal(x) : intVal(x)).toString();
    }
    if (grouping) {
      const [ip, ...restParts] = body.split('.');
      body = [groupThousands(ip, grouping), ...restParts].join('.');
    }
    prefix = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
  }
  const total = prefix + body;
  const w = width ? Number(width) : 0;
  if (total.length >= w) return total;
  const pad = w - total.length;
  switch (align) {
    case '<':
      return total + fill.repeat(pad);
    case '^':
      return fill.repeat(Math.floor(pad / 2)) + total + fill.repeat(Math.ceil(pad / 2));
    case '=':
      return prefix + fill.repeat(pad) + body;
    default:
      return fill.repeat(pad) + total;
  }
}

/** "…{}…{:.2f}…".format(…) */
function strFormat(template, args, kwargs) {
  let auto = 0;
  return template.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (match, field) => {
    if (match === '{{') return '{';
    if (match === '}}') return '}';
    const [ref, spec = ''] = field.split(/:(.*)/s);
    let value;
    if (ref === '') value = args[auto++];
    else if (/^\d+$/.test(ref)) value = args[Number(ref)];
    else value = kwargs.get(ref);
    if (value === undefined) throw new PyError('IndexError', `format() : pas de valeur pour « {${field}} »`);
    return formatValue(value, spec);
  });
}

// ---------------------------------------------------------------- tri

function sortInPlace(items, kwargs, ctx, name) {
  checkKwargs(name, kwargs, ['key', 'reverse']);
  const key = kwargs.get('key') ?? null;
  const reverse = truthy(kwargs.get('reverse') ?? false);
  const decorated = items.map((x) => ({ x, k: key ? ctx.call(key, [x]) : x }));
  decorated.sort((p, q) => {
    const c = reverse ? pyCmp(q.k, p.k, '<') : pyCmp(p.k, q.k, '<');
    return Number.isNaN(c) ? 0 : c;
  });
  decorated.forEach((d, i) => (items[i] = d.x));
}

// ---------------------------------------------------------------- fonctions prédéfinies

export function createBuiltins() {
  const b = new Map();
  const def = (name, fn, isType = false) => {
    const f = new PyBuiltin(name, fn);
    f.isType = isType;
    b.set(name, f);
  };

  def('print', (args, kwargs, ctx) => {
    checkKwargs('print', kwargs, ['sep', 'end']);
    const sep = kwargs.get('sep') ?? ' ';
    const end = kwargs.get('end') ?? '\n';
    if (typeof sep !== 'string' || typeof end !== 'string') throw typeError('sep et end doivent être des chaînes');
    ctx.print(args.map(str).join(sep) + end);
    return null;
  });

  def('input', (args, kwargs, ctx) => {
    checkArgs('input', args, 0, 1);
    return ctx.input(args.length ? str(args[0]) : '');
  });

  def('len', (args) => {
    checkArgs('len', args, 1);
    const v = args[0];
    if (typeof v === 'string') return BigInt([...v].length);
    if (v instanceof PyList || v instanceof PyTuple) return BigInt(v.items.length);
    if (v instanceof PyDict) return BigInt(v.size);
    if (v instanceof PyRange) return BigInt(v.length);
    throw typeError(`${describe(v)} n'a pas de longueur : len() s'applique aux listes, chaînes, tuples et dictionnaires`);
  });

  def(
    'range',
    (args, kwargs) => {
      checkKwargs('range', kwargs);
      checkArgs('range', args, 1, 3);
      const ints = args.map((a) => needInt('range()', a));
      const [start, stop, step] = ints.length === 1 ? [0n, ints[0], 1n] : [ints[0], ints[1], ints[2] ?? 1n];
      if (step === 0n) throw valueError('le pas de range() ne peut pas être 0');
      return new PyRange(start, stop, step);
    },
    true,
  );

  def(
    'int',
    (args) => {
      checkArgs('int', args, 0, 2);
      if (args.length === 0) return 0n;
      const [v, baseArg] = args;
      if (typeof v === 'string') {
        const base = baseArg === undefined ? 10 : Number(needInt('int()', baseArg));
        let s = v.trim().replace(/_/g, '').toLowerCase();
        const neg = s.startsWith('-');
        if (s[0] === '-' || s[0] === '+') s = s.slice(1);
        const prefix = { 16: '0x', 8: '0o', 2: '0b' }[base];
        if (prefix && s.startsWith(prefix)) s = s.slice(2);
        const valid = { 10: /^\d+$/, 16: /^[0-9a-f]+$/, 8: /^[0-7]+$/, 2: /^[01]+$/ }[base];
        if (!valid || !valid.test(s)) {
          const decimal = /^[+-]?\d*[.,]\d+$/.test(v.trim());
          throw valueError(
            `impossible de convertir ${strRepr(v)} en entier` + (decimal ? ' (c’est un nombre à virgule : utilise float())' : ''),
          );
        }
        const n = BigInt((prefix ?? '') + s);
        return neg ? -n : n;
      }
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw valueError(`impossible de convertir ${repr(v)} en entier`);
        return BigInt(Math.trunc(v));
      }
      if (isInt(v)) return intVal(v);
      throw typeError(`int() ne sait pas convertir ${describe(v)}`);
    },
    true,
  );

  def(
    'float',
    (args) => {
      checkArgs('float', args, 0, 1);
      if (args.length === 0) return 0;
      const v = args[0];
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase().replace(/_/g, '');
        if (/^[+-]?(inf|infinity)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
        if (/^[+-]?nan$/.test(s)) return NaN;
        if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s)) {
          const comma = s.includes(',') ? ' (en Python, la virgule décimale s’écrit avec un point : 3.5)' : '';
          throw valueError(`impossible de convertir ${strRepr(v)} en flottant${comma}`);
        }
        return Number(s);
      }
      if (isNumeric(v)) return numVal(v);
      throw typeError(`float() ne sait pas convertir ${describe(v)}`);
    },
    true,
  );

  def('str', (args) => (checkArgs('str', args, 0, 1), args.length ? str(args[0]) : ''), true);
  def('repr', (args) => (checkArgs('repr', args, 1), repr(args[0])));
  def('bool', (args) => (checkArgs('bool', args, 0, 1), args.length ? truthy(args[0]) : false), true);
  def('list', (args) => (checkArgs('list', args, 0, 1), new PyList(args.length ? toArray(args[0]) : [])), true);
  def('tuple', (args) => (checkArgs('tuple', args, 0, 1), new PyTuple(args.length ? toArray(args[0]) : [])), true);
  def(
    'dict',
    (args, kwargs) => {
      checkArgs('dict', args, 0, 1);
      const d = new PyDict();
      if (args.length) {
        const src = args[0];
        if (src instanceof PyDict) src.entries().forEach(([k, v]) => d.set(k, v));
        else {
          for (const pair of toArray(src)) {
            const kv = toArray(pair);
            if (kv.length !== 2) throw valueError('dict() attend des paires (clé, valeur)');
            d.set(kv[0], kv[1]);
          }
        }
      }
      for (const [k, v] of kwargs) d.set(k, v);
      return d;
    },
    true,
  );

  def('type', (args) => {
    checkArgs('type', args, 1);
    const name = typeName(args[0]);
    if (b.has(name) && b.get(name).isType) return b.get(name);
    const t = new PyBuiltin(name, () => {
      throw typeError(`impossible d'appeler le type ${name}`);
    });
    t.isType = true;
    return t;
  });

  def('isinstance', (args) => {
    checkArgs('isinstance', args, 2);
    const [v, t] = args;
    const types = t instanceof PyTuple ? t.items : [t];
    return types.some((ty) => {
      if (!(ty instanceof PyBuiltin) || !ty.isType) throw typeError('le second argument de isinstance() doit être un type');
      return typeName(v) === ty.name || (ty.name === 'int' && typeof v === 'boolean');
    });
  });

  def('abs', (args) => {
    checkArgs('abs', args, 1);
    const v = needNumber('abs()', args[0]);
    if (typeof v === 'number') return Math.abs(v);
    const n = intVal(v);
    return n < 0n ? -n : n;
  });

  const minmax = (name, sign) => (args, kwargs, ctx) => {
    checkKwargs(name, kwargs, ['key', 'default']);
    if (args.length === 0) throw typeError(`${name}() attend au moins un argument`);
    const items = args.length === 1 ? toArray(args[0]) : args;
    if (items.length === 0) {
      if (kwargs.has('default')) return kwargs.get('default');
      throw valueError(`${name}() d'une séquence vide`);
    }
    const key = kwargs.get('key') ?? null;
    let best = items[0];
    let bestKey = key ? ctx.call(key, [best]) : best;
    for (const x of items.slice(1)) {
      const k = key ? ctx.call(key, [x]) : x;
      const c = pyCmp(k, bestKey, sign < 0 ? '<' : '>');
      if (sign < 0 ? c < 0 : c > 0) {
        best = x;
        bestKey = k;
      }
    }
    return best;
  };
  def('min', minmax('min', -1));
  def('max', minmax('max', 1));

  def('sum', (args) => {
    checkArgs('sum', args, 1, 2);
    let total = args.length > 1 ? args[1] : 0n;
    if (typeof total === 'string') throw typeError("sum() n'additionne pas des chaînes : utilise ''.join(…)");
    for (const x of toArray(args[0])) total = binaryOp('+', total, x);
    return total;
  });

  def('round', (args) => {
    checkArgs('round', args, 1, 2);
    const [x, nd] = args;
    needNumber('round()', x);
    if (nd === undefined || nd === null) {
      if (isInt(x)) return intVal(x);
      if (!Number.isFinite(x)) throw valueError(`impossible d'arrondir ${repr(x)} à un entier`);
      return BigInt(roundToInt(x));
    }
    const n = Number(needInt('round()', nd));
    if (isInt(x)) {
      if (n >= 0) return intVal(x);
      const p = 10n ** BigInt(-n);
      const v = intVal(x);
      const q = v / p;
      const r = v - q * p;
      const twice = 2n * (r < 0n ? -r : r);
      let rounded = q;
      if (twice > p || (twice === p && q % 2n !== 0n)) rounded += v < 0n ? -1n : 1n;
      return rounded * p;
    }
    return roundFloat(x, n);
  });

  def('pow', (args) => {
    checkArgs('pow', args, 2);
    return binaryOp('**', args[0], args[1]);
  });

  def('divmod', (args) => {
    checkArgs('divmod', args, 2);
    return new PyTuple([binaryOp('//', args[0], args[1]), binaryOp('%', args[0], args[1])]);
  });

  def('sorted', (args, kwargs, ctx) => {
    checkArgs('sorted', args, 1);
    const items = toArray(args[0]);
    sortInPlace(items, kwargs, ctx, 'sorted');
    return new PyList(items);
  });

  def('reversed', (args) => {
    checkArgs('reversed', args, 1);
    return new PyList(toArray(args[0]).reverse());
  });

  def('enumerate', (args, kwargs) => {
    checkArgs('enumerate', args, 1, 2);
    const start = needInt('enumerate()', args[1] ?? kwargs.get('start') ?? 0n);
    return new PyList(toArray(args[0]).map((v, i) => new PyTuple([BigInt(i) + start, v])));
  });

  def('zip', (args) => {
    const seqs = args.map(toArray);
    const n = seqs.length ? Math.min(...seqs.map((s) => s.length)) : 0;
    return new PyList(Array.from({ length: n }, (_, i) => new PyTuple(seqs.map((s) => s[i]))));
  });

  def('map', (args, kwargs, ctx) => {
    if (args.length < 2) throw typeError('map() attend une fonction et une séquence');
    const seqs = args.slice(1).map(toArray);
    const n = Math.min(...seqs.map((s) => s.length));
    return new PyList(Array.from({ length: n }, (_, i) => ctx.call(args[0], seqs.map((s) => s[i]))));
  });

  def('filter', (args, kwargs, ctx) => {
    checkArgs('filter', args, 2);
    const [fn, seq] = args;
    return new PyList(toArray(seq).filter((x) => truthy(fn === null ? x : ctx.call(fn, [x]))));
  });

  def('any', (args) => (checkArgs('any', args, 1), toArray(args[0]).some(truthy)));
  def('all', (args) => (checkArgs('all', args, 1), toArray(args[0]).every(truthy)));

  def('chr', (args) => {
    checkArgs('chr', args, 1);
    const n = Number(needInt('chr()', args[0]));
    if (n < 0 || n > 0x10ffff) throw valueError('chr() : code hors limites');
    return String.fromCodePoint(n);
  });
  def('ord', (args) => {
    checkArgs('ord', args, 1);
    const s = args[0];
    if (typeof s !== 'string' || [...s].length !== 1) throw typeError('ord() attend un seul caractère');
    return BigInt(s.codePointAt(0));
  });
  const baseRepr = (name, base, prefix) => (args) => {
    checkArgs(name, args, 1);
    const n = needInt(`${name}()`, args[0]);
    return (n < 0n ? '-' : '') + prefix + (n < 0n ? -n : n).toString(base);
  };
  def('bin', baseRepr('bin', 2, '0b'));
  def('oct', baseRepr('oct', 8, '0o'));
  def('hex', baseRepr('hex', 16, '0x'));

  def('format', (args) => {
    checkArgs('format', args, 1, 2);
    return formatValue(args[0], args.length > 1 ? str(args[1]) : '');
  });

  return b;
}

// ---------------------------------------------------------------- méthodes

function emitMutation(ctx, self, method, extra = {}) {
  ctx.emit({ type: 'mutate', method, ref: self.id, target: ctx.targetText, ...extra });
}

const LIST_METHODS = {
  append(self, args, kwargs, ctx) {
    checkArgs('append', args, 1);
    self.items.push(args[0]);
    self.touch();
    emitMutation(ctx, self, 'append', { index: self.items.length - 1, value: shortRepr(args[0]) });
    return null;
  },
  extend(self, args, kwargs, ctx) {
    checkArgs('extend', args, 1);
    const added = toArray(args[0]);
    self.items.push(...added);
    self.touch();
    emitMutation(ctx, self, 'extend', { count: added.length });
    return null;
  },
  insert(self, args, kwargs, ctx) {
    checkArgs('insert', args, 2);
    const len = self.items.length;
    let i = Number(needInt('insert()', args[0]));
    if (i < 0) i = Math.max(0, i + len);
    i = Math.min(i, len);
    self.items.splice(i, 0, args[1]);
    self.touch();
    emitMutation(ctx, self, 'insert', { index: i, value: shortRepr(args[1]) });
    return null;
  },
  pop(self, args, kwargs, ctx) {
    checkArgs('pop', args, 0, 1);
    if (self.items.length === 0) throw new PyError('IndexError', 'pop() sur une liste vide');
    const i = normIndex(self.items.length, args.length ? needInt('pop()', args[0]) : -1n);
    if (i < 0) throw new PyError('IndexError', `pop() : indice ${repr(args[0])} hors de la liste`);
    const [value] = self.items.splice(i, 1);
    self.touch();
    emitMutation(ctx, self, 'pop', { index: i, value: shortRepr(value) });
    return value;
  },
  remove(self, args, kwargs, ctx) {
    checkArgs('remove', args, 1);
    const i = self.items.findIndex((x) => pyEq(x, args[0]));
    if (i < 0) throw valueError(`remove() : ${repr(args[0])} n'est pas dans la liste`);
    self.items.splice(i, 1);
    self.touch();
    emitMutation(ctx, self, 'remove', { index: i, value: shortRepr(args[0]) });
    return null;
  },
  index(self, args) {
    checkArgs('index', args, 1, 3);
    const start = args.length > 1 ? normalizeBound(self.items.length, args[1]) : 0;
    const end = args.length > 2 ? normalizeBound(self.items.length, args[2]) : self.items.length;
    for (let i = start; i < end; i++) if (pyEq(self.items[i], args[0])) return BigInt(i);
    throw valueError(`index() : ${repr(args[0])} n'est pas dans la liste`);
  },
  count(self, args) {
    checkArgs('count', args, 1);
    return BigInt(self.items.filter((x) => pyEq(x, args[0])).length);
  },
  reverse(self, args, kwargs, ctx) {
    checkArgs('reverse', args, 0);
    self.items.reverse();
    self.touch();
    emitMutation(ctx, self, 'reverse');
    return null;
  },
  sort(self, args, kwargs, ctx) {
    checkArgs('sort', args, 0);
    sortInPlace(self.items, kwargs, ctx, 'sort');
    self.touch();
    emitMutation(ctx, self, 'sort');
    return null;
  },
  copy(self, args) {
    checkArgs('copy', args, 0);
    return new PyList([...self.items]);
  },
  clear(self, args, kwargs, ctx) {
    checkArgs('clear', args, 0);
    self.items.length = 0;
    self.touch();
    emitMutation(ctx, self, 'clear');
    return null;
  },
};

function normalizeBound(len, v) {
  let i = Number(needInt('index()', v));
  if (i < 0) i += len;
  return Math.min(Math.max(i, 0), len);
}

const isSpace = (s) => /^\s+$/.test(s);

const STR_METHODS = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  capitalize: (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s),
  title: (s) => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()),
  swapcase: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  strip: (s, args) => stripChars(s, args[0], true, true),
  lstrip: (s, args) => stripChars(s, args[0], true, false),
  rstrip: (s, args) => stripChars(s, args[0], false, true),
  split(s, args, kwargs) {
    checkArgs('split', args, 0, 2);
    const sep = args[0] ?? kwargs.get('sep') ?? null;
    if (sep === null) return new PyList(s.split(/\s+/).filter((x) => x !== ''));
    if (sep === '') throw valueError('split() : séparateur vide');
    return new PyList(s.split(sep));
  },
  join(s, args) {
    checkArgs('join', args, 1);
    const parts = toArray(args[0]);
    parts.forEach((p) => {
      if (typeof p !== 'string') throw typeError(`join() n'assemble que des chaînes, pas ${describe(p)} (convertis avec str())`);
    });
    return parts.join(s);
  },
  replace(s, args) {
    checkArgs('replace', args, 2, 3);
    const [a, b2] = args;
    if (typeof a !== 'string' || typeof b2 !== 'string') throw typeError('replace() attend deux chaînes');
    return s.split(a).join(b2);
  },
  find: (s, args) => (checkArgs('find', args, 1), BigInt(s.indexOf(args[0]))),
  index(s, args) {
    checkArgs('index', args, 1);
    const i = s.indexOf(args[0]);
    if (i < 0) throw valueError(`${repr(args[0])} n'est pas dans la chaîne`);
    return BigInt(i);
  },
  count: (s, args) => (checkArgs('count', args, 1), BigInt(args[0] === '' ? s.length + 1 : s.split(args[0]).length - 1)),
  startswith: (s, args) => s.startsWith(args[0]),
  endswith: (s, args) => s.endsWith(args[0]),
  isdigit: (s) => /^\d+$/.test(s),
  isnumeric: (s) => /^\p{N}+$/u.test(s),
  isalpha: (s) => /^\p{L}+$/u.test(s),
  isalnum: (s) => /^[\p{L}\p{N}]+$/u.test(s),
  isspace: (s) => isSpace(s),
  islower: (s) => /\p{Ll}/u.test(s) && s === s.toLowerCase(),
  isupper: (s) => /\p{Lu}/u.test(s) && s === s.toUpperCase(),
  center: (s, args) => padStr(s, args, '^'),
  ljust: (s, args) => padStr(s, args, '<'),
  rjust: (s, args) => padStr(s, args, '>'),
  zfill: (s, args) => s.padStart(Number(needInt('zfill()', args[0])), '0'),
  format: (s, args, kwargs) => strFormat(s, args, kwargs),
};

function stripChars(s, chars, left, right) {
  const set = chars === undefined || chars === null ? null : [...chars];
  const strip = (c) => (set ? set.includes(c) : /\s/.test(c));
  const a = [...s];
  let i = 0;
  let j = a.length;
  if (left) while (i < j && strip(a[i])) i++;
  if (right) while (j > i && strip(a[j - 1])) j--;
  return a.slice(i, j).join('');
}

function padStr(s, args, align) {
  const width = Number(needInt('largeur', args[0]));
  return formatValue(s, `${args[1] ?? ' '}${align}${width}`);
}

const DICT_METHODS = {
  keys: (d) => new PyList(d.keys()),
  values: (d) => new PyList(d.values()),
  items: (d) => new PyList(d.entries().map(([k, v]) => new PyTuple([k, v]))),
  get: (d, args) => (checkArgs('get', args, 1, 2), d.has(args[0]) ? d.get(args[0]) : (args[1] ?? null)),
  pop(d, args) {
    checkArgs('pop', args, 1, 2);
    if (!d.has(args[0])) {
      if (args.length > 1) return args[1];
      throw new PyError('KeyError', `la clé ${repr(args[0])} n'existe pas dans le dictionnaire`);
    }
    const v = d.get(args[0]);
    d.delete(args[0]);
    return v;
  },
  copy(d) {
    const c = new PyDict();
    d.entries().forEach(([k, v]) => c.set(k, v));
    return c;
  },
};

const TUPLE_METHODS = {
  index: (t, args) => LIST_METHODS.index(t, args),
  count: (t, args) => LIST_METHODS.count(t, args),
};

const ATTRIBUTE_HINTS = {
  push: 'append',
  add: 'append',
  ajouter: 'append',
  length: 'len(…)',
  size: 'len(…)',
  longueur: 'len(…)',
  taille: 'len(…)',
};

export function getAttribute(obj, name) {
  if (obj instanceof PyModule) {
    if (obj.attrs.has(name)) return obj.attrs.get(name);
    throw new PyError('AttributeError', `le module ${obj.name} ne contient pas « ${name} »`);
  }
  let table = null;
  if (obj instanceof PyList) table = LIST_METHODS;
  else if (typeof obj === 'string') table = STR_METHODS;
  else if (obj instanceof PyDict) table = DICT_METHODS;
  else if (obj instanceof PyTuple) table = TUPLE_METHODS;
  const method = table && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
  if (method) {
    const wrapped =
      table === STR_METHODS
        ? (self, args, kwargs) => {
            if (!['split', 'format'].includes(name)) checkKwargs(name, kwargs);
            return method(self, args, kwargs);
          }
        : method;
    return new PyBoundMethod(obj, name, wrapped);
  }
  const hint = ATTRIBUTE_HINTS[name];
  throw new PyError(
    'AttributeError',
    `${describe(obj)} n'a pas de méthode « ${name} »` + (hint ? ` : en Python, on utilise ${hint}` : ''),
  );
}

// ---------------------------------------------------------------- modules

function mathModule() {
  const m = new Map();
  const fn = (name, f) => m.set(name, new PyBuiltin(name, f));
  const real = (name, f) =>
    fn(name, (args) => {
      checkArgs(name, args, 1);
      return f(numVal(needNumber(`${name}()`, args[0])));
    });
  m.set('pi', Math.PI);
  m.set('e', Math.E);
  m.set('tau', 2 * Math.PI);
  m.set('inf', Infinity);
  m.set('nan', NaN);
  fn('sqrt', (args) => {
    checkArgs('sqrt', args, 1);
    const x = numVal(needNumber('sqrt()', args[0]));
    if (x < 0) throw valueError("racine carrée d'un nombre négatif");
    return Math.sqrt(x);
  });
  for (const [name, f] of Object.entries({ floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc })) {
    fn(name, (args) => {
      checkArgs(name, args, 1);
      const v = needNumber(`${name}()`, args[0]);
      if (isInt(v)) return intVal(v);
      if (!Number.isFinite(v)) throw valueError(`${name}() d'une valeur infinie`);
      return BigInt(f(v));
    });
  }
  real('fabs', Math.abs);
  real('exp', Math.exp);
  real('sin', Math.sin);
  real('cos', Math.cos);
  real('tan', Math.tan);
  real('asin', Math.asin);
  real('acos', Math.acos);
  real('atan', Math.atan);
  real('degrees', (x) => (x * 180) / Math.PI);
  real('radians', (x) => (x * Math.PI) / 180);
  real('log2', (x) => {
    if (x <= 0) throw valueError('log2() : le nombre doit être strictement positif');
    return Math.log2(x);
  });
  real('log10', (x) => {
    if (x <= 0) throw valueError('log10() : le nombre doit être strictement positif');
    return Math.log10(x);
  });
  fn('log', (args) => {
    checkArgs('log', args, 1, 2);
    const x = numVal(needNumber('log()', args[0]));
    if (x <= 0) throw valueError('log() : le nombre doit être strictement positif');
    return args.length > 1 ? Math.log(x) / Math.log(numVal(args[1])) : Math.log(x);
  });
  fn('hypot', (args) => Math.hypot(...args.map((a) => numVal(needNumber('hypot()', a)))));
  fn('gcd', (args) => {
    let [a, c] = args.map((x) => needInt('gcd()', x));
    a = a < 0n ? -a : a;
    c = c < 0n ? -c : c;
    while (c) [a, c] = [c, a % c];
    return a;
  });
  fn('factorial', (args) => {
    checkArgs('factorial', args, 1);
    const n = needInt('factorial()', args[0]);
    if (n < 0n) throw valueError('factorial() d’un nombre négatif');
    if (n > 5000n) throw valueError('factorial() : nombre trop grand pour ce simulateur');
    let r = 1n;
    for (let k = 2n; k <= n; k++) r *= k;
    return r;
  });
  fn('isqrt', (args) => {
    const n = needInt('isqrt()', args[0]);
    if (n < 0n) throw valueError('isqrt() d’un nombre négatif');
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
  });
  return m;
}

function randomModule() {
  const m = new Map();
  const fn = (name, f) => m.set(name, new PyBuiltin(name, f));
  const randBelow = (ctx, n) => BigInt(Math.floor(ctx.random() * Number(n)));
  fn('random', (args, kwargs, ctx) => (checkArgs('random', args, 0), ctx.random()));
  fn('randint', (args, kwargs, ctx) => {
    checkArgs('randint', args, 2);
    const [a, c] = args.map((x) => needInt('randint()', x));
    if (c < a) throw valueError('randint(a, b) demande a <= b');
    return a + randBelow(ctx, c - a + 1n);
  });
  fn('randrange', (args, kwargs, ctx) => {
    checkArgs('randrange', args, 1, 3);
    const ints = args.map((x) => needInt('randrange()', x));
    const r = ints.length === 1 ? new PyRange(0n, ints[0], 1n) : new PyRange(ints[0], ints[1], ints[2] ?? 1n);
    if (r.length === 0) throw valueError('randrange() : intervalle vide');
    return r.at(Number(randBelow(ctx, r.length)));
  });
  fn('uniform', (args, kwargs, ctx) => {
    checkArgs('uniform', args, 2);
    const [a, c] = args.map((x) => numVal(needNumber('uniform()', x)));
    return a + (c - a) * ctx.random();
  });
  fn('choice', (args, kwargs, ctx) => {
    checkArgs('choice', args, 1);
    const items = toArray(args[0]);
    if (!items.length) throw new PyError('IndexError', 'choice() sur une séquence vide');
    return items[Math.floor(ctx.random() * items.length)];
  });
  fn('shuffle', (args, kwargs, ctx) => {
    checkArgs('shuffle', args, 1);
    const L = args[0];
    if (!(L instanceof PyList)) throw typeError('shuffle() attend une liste');
    for (let i = L.items.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.random() * (i + 1));
      [L.items[i], L.items[j]] = [L.items[j], L.items[i]];
    }
    L.touch();
    ctx.emit({ type: 'mutate', method: 'shuffle', ref: L.id, target: ctx.argText(0) });
    return null;
  });
  fn('sample', (args, kwargs, ctx) => {
    checkArgs('sample', args, 2);
    const items = toArray(args[0]);
    const k = Number(needInt('sample()', args[1]));
    if (k < 0 || k > items.length) throw valueError('sample() : échantillon plus grand que la population');
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return new PyList(items.slice(0, k));
  });
  fn('seed', (args, kwargs, ctx) => {
    ctx.seed(args.length ? args[0] : null);
    return null;
  });
  return m;
}

function timeModule() {
  const m = new Map();
  const fn = (name, f) => m.set(name, new PyBuiltin(name, f));
  fn('time', () => Date.now() / 1000);
  fn('perf_counter', () => performance.now() / 1000);
  fn('sleep', () => null); // pas d'attente réelle : l'animation a son propre rythme
  return m;
}

const MODULES = { math: mathModule, random: randomModule, time: timeModule };

export function loadModule(name) {
  const make = MODULES[name];
  if (!make) {
    throw new PyError(
      'ImportError',
      `le module « ${name} » n'est pas disponible ici (modules disponibles : ${Object.keys(MODULES).join(', ')})`,
    );
  }
  return new PyModule(name, make());
}
