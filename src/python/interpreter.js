// Interpréteur pas à pas : exécute le programme en entier et enregistre une « trace ».
// Chaque étape contient la ligne exécutée, les événements survenus (lecture d'une case,
// comparaison, affectation, échange…) et un instantané des variables et des listes.
// L'animation rejoue ensuite cette trace, en avant comme en arrière.
import { createBuiltins, formatValue, getAttribute, loadModule, shortRepr } from './builtins.js';
import { PyError } from './errors.js';
import { parse } from './parser.js';
import {
  PyBoundMethod, PyBuiltin, PyDict, PyFunction, PyList, PyModule, PyRange, PyTuple,
  binaryOp, contains, describe, intVal, isInt, makeIterator, normIndex, pyCmp, pyEq, repr,
  sliceIndices, str, toArray, truthy, typeName, unaryOp,
} from './values.js';

export const DEFAULT_LIMITS = { maxSteps: 10_000, maxDepth: 200, maxOps: 5_000_000 };

class ReturnSignal {
  constructor(value, line) {
    this.value = value;
    this.line = line;
  }
}

// Mots qu'un élève écrit souvent en pensant en français (ou par oubli d'un import).
const NAME_HINTS = {
  afficher: 'en Python, on affiche avec print(…)',
  écrire: 'en Python, on affiche avec print(…)',
  ecrire: 'en Python, on affiche avec print(…)',
  longueur: 'en Python, la longueur s’obtient avec len(…)',
  taille: 'en Python, la longueur s’obtient avec len(…)',
  si: 'en Python, « si » s’écrit if',
  sinon: 'en Python, « sinon » s’écrit else',
  pour: 'en Python, « pour » s’écrit for',
  tantque: 'en Python, « tant que » s’écrit while',
  renvoyer: 'en Python, « renvoyer » s’écrit return',
  retourner: 'en Python, « renvoyer » s’écrit return',
  vrai: 'en Python, « vrai » s’écrit True (avec une majuscule)',
  faux: 'en Python, « faux » s’écrit False (avec une majuscule)',
  true: 'en Python, on écrit True (avec une majuscule)',
  false: 'en Python, on écrit False (avec une majuscule)',
  none: 'en Python, on écrit None (avec une majuscule)',
  null: 'en Python, « rien » s’écrit None',
  et: 'en Python, « et » s’écrit and',
  ou: 'en Python, « ou » s’écrit or',
  non: 'en Python, « non » s’écrit not',
};
const IMPORT_HINTS = {
  randint: 'from random import randint',
  choice: 'from random import choice',
  shuffle: 'from random import shuffle',
  random: 'import random',
  sqrt: 'from math import sqrt',
  floor: 'from math import floor',
  ceil: 'from math import ceil',
  pi: 'from math import pi',
  math: 'import math',
  time: 'import time',
};

const isHidden = (v) =>
  v instanceof PyFunction || v instanceof PyBuiltin || v instanceof PyBoundMethod || v instanceof PyModule;

export function errorInfo(e) {
  return { type: e.pyType, title: e.title, message: e.message, line: e.line };
}

/**
 * Exécute un programme et renvoie sa trace.
 * @param {string} src
 * @param {{inputs?: string[], seed?: number, limits?: object}} [options]
 */
export function run(src, options = {}) {
  let ast;
  try {
    ast = parse(src);
    validate(ast.body);
  } catch (e) {
    if (!(e instanceof PyError)) throw e;
    return { ok: false, phase: 'syntax', error: errorInfo(e), steps: [], output: '', comments: new Map(), meta: {} };
  }
  return new Interpreter(ast, options).run();
}

/** Vérifie qu'un programme peut être exécuté (syntaxe, instructions refusées…) ; renvoie l'erreur ou null. */
export function check(src) {
  try {
    validate(parse(src).body);
    return null;
  } catch (e) {
    if (e instanceof PyError) return errorInfo(e);
    throw e;
  }
}

// Dans ce Python, une affectation ne donne une valeur qu'à une seule variable :
// un échange s'écrit en trois lignes, avec une variable temporaire.
const MULTIPLE_ASSIGNMENT =
  'une affectation ne donne une valeur qu’à une seule variable : « a, b = … » n’est pas autorisé ici. ' +
  'Pour échanger deux valeurs, utilise une variable temporaire : temp = a, puis a = b, puis b = temp';
const CHAINED_ASSIGNMENT =
  'une affectation ne donne une valeur qu’à une seule variable : « a = b = … » n’est pas autorisé ici. ' +
  'Écris une affectation par ligne';
// Ni break, ni continue, ni else après une boucle : une boucle s'arrête quand sa condition le dit,
// et chaque tour exécute tout son bloc.
const BREAK_NOT_ALLOWED =
  '« break » n’est pas autorisé ici : une boucle s’arrête quand sa condition le dit. ' +
  'Pour s’arrêter dès qu’on a trouvé ce qu’on cherche, utilise une boucle while dont la condition dit quand continuer, ' +
  'par exemple : while i < len(L) and L[i] != v';
const CONTINUE_NOT_ALLOWED =
  '« continue » n’est pas autorisé ici : pour ne traiter que certains éléments, ' +
  'place les instructions dans un if qui dit quand les exécuter';
const LOOP_ELSE_NOT_ALLOWED =
  '« else » après une boucle n’est pas autorisé ici : écris simplement les instructions après la boucle, sans else';

function validate(body, inFunction = false) {
  for (const s of body) {
    switch (s.type) {
      case 'Assign':
        if (s.targets.length > 1) throw new PyError('NotAllowed', CHAINED_ASSIGNMENT, s.line);
        if (s.targets[0].type === 'Tuple' || s.targets[0].type === 'List') {
          throw new PyError('NotAllowed', MULTIPLE_ASSIGNMENT, s.line);
        }
        break;
      case 'Break':
        throw new PyError('NotAllowed', BREAK_NOT_ALLOWED, s.line);
      case 'Continue':
        throw new PyError('NotAllowed', CONTINUE_NOT_ALLOWED, s.line);
      case 'Return':
        if (!inFunction) throw new PyError('SyntaxError', '« return » en dehors d’une fonction', s.line);
        break;
      case 'If':
        validate(s.body, inFunction);
        validate(s.orelse, inFunction);
        break;
      case 'While':
      case 'For':
        validate(s.body, inFunction);
        if (s.orelse.length) throw new PyError('NotAllowed', LOOP_ELSE_NOT_ALLOWED, s.elseLine);
        break;
      case 'FunctionDef':
        validate(s.body, true);
        break;
    }
  }
}

/** Noms recevant une valeur dans un bloc (sans entrer dans les fonctions), avec leurs lignes. */
export function assignedNames(body, into = new Map(), globals = null) {
  const add = (name, line) => {
    if (!into.has(name)) into.set(name, []);
    into.get(name).push(line);
  };
  const target = (t, line) => {
    if (t.type === 'Name') add(t.id, line);
    else if (t.type === 'Tuple' || t.type === 'List') t.elts.forEach((e) => target(e, line));
  };
  for (const s of body) {
    switch (s.type) {
      case 'Assign':
        s.targets.forEach((t) => target(t, s.line));
        break;
      case 'AugAssign':
      case 'AnnAssign':
        target(s.target, s.line);
        break;
      case 'Delete':
        s.targets.forEach((t) => target(t, s.line));
        break;
      case 'For':
        target(s.target, s.line);
        assignedNames(s.body, into, globals);
        assignedNames(s.orelse, into, globals);
        break;
      case 'While':
      case 'If':
        assignedNames(s.body, into, globals);
        assignedNames(s.orelse, into, globals);
        break;
      case 'FunctionDef':
        add(s.name, s.line);
        break;
      case 'Import':
        s.names.forEach((n) => add(n.asname ?? n.name.split('.')[0], s.line));
        break;
      case 'ImportFrom':
        if (s.names !== '*') s.names.forEach((n) => add(n.asname ?? n.name, s.line));
        break;
      case 'Global':
        if (globals) s.names.forEach((n) => globals.add(n));
        break;
    }
  }
  return into;
}

/** Variables locales d'une fonction : paramètres et noms affectés, sauf ceux déclarés global. */
function functionScope(node) {
  const globals = new Set();
  const locals = new Set(node.params.map((p) => p.name));
  if (node.type === 'FunctionDef') for (const name of assignedNames(node.body, new Map(), globals).keys()) locals.add(name);
  for (const g of globals) locals.delete(g);
  return { locals, globals };
}

function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

function hashSeed(v) {
  const text = typeof v === 'string' ? v : String(v);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Frame {
  constructor(name, fn, vars, scope) {
    this.name = name;
    this.fn = fn;
    this.vars = vars; // Map nom → valeur (pour le module : les variables globales)
    this.isModule = fn === null;
    this.locals = scope?.locals ?? new Set();
    this.globalNames = scope?.globals ?? new Set();
    this.compScopes = []; // portées des listes en compréhension en cours
    this.loops = []; // boucles for en cours sur une liste (curseur de parcours)
    this.line = null;
  }
}

class Interpreter {
  constructor(ast, options) {
    this.ast = ast;
    this.src = ast.source;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.inputs = [...(options.inputs ?? [])];
    this.builtins = createBuiltins();
    this.globals = new Map();
    this.frames = [new Frame('<module>', null, this.globals, null)];
    this.hiddenNames = new Set(); // noms importés, masqués dans l'affichage des variables
    this.steps = [];
    this.events = [];
    this.output = '';
    this.ops = 0;
    this.silent = 0;
    this.lastCell = null;
    this.curLine = null;
    this.listCache = new Map();
    this.indexNames = new Map(); // id de liste → noms de variables utilisées comme indices
    this.assignLines = assignedNames(ast.body);
    this.seedRandom(options.seed ?? null);
  }

  get frame() {
    return this.frames[this.frames.length - 1];
  }

  text(node) {
    return this.src.slice(node.start, node.end);
  }

  run() {
    let error = null;
    this.step(null, 'start');
    try {
      this.execBlock(this.ast.body);
      this.step(null, 'end');
    } catch (e) {
      error = this.toPyError(e);
      this.steps.push({ kind: 'error', line: error.line, events: this.events, error: errorInfo(error), ...this.snapshot() });
      this.events = [];
    }
    const indexNames = {};
    for (const [id, names] of this.indexNames) indexNames[id] = [...names];
    return {
      ok: !error,
      phase: 'run',
      error: error && errorInfo(error),
      steps: this.steps,
      output: this.output,
      comments: this.ast.comments,
      meta: { indexNames },
    };
  }

  toPyError(e) {
    if (e instanceof PyError) {
      if (e.line == null) e.line = this.curLine;
      return e;
    }
    if (e instanceof RangeError && /call stack/i.test(e.message)) {
      return new PyError('RecursionError', 'trop d’appels imbriqués : la récursion ne s’arrête peut-être jamais', this.curLine);
    }
    const err = new PyError('InternalError', `erreur interne du simulateur (${e?.message ?? e})`, this.curLine);
    err.cause = e;
    return err;
  }

  // ---------------------------------------------------------------- trace

  emit(event) {
    if (this.silent === 0) this.events.push(event);
  }

  step(line, kind = 'line') {
    if (this.steps.length >= this.limits.maxSteps) {
      throw new PyError(
        'StepLimit',
        `programme arrêté après ${this.limits.maxSteps.toLocaleString('fr-FR')} étapes : une boucle ne s'arrête peut-être jamais (vérifie que sa condition finit par devenir fausse)`,
        line,
      );
    }
    if (line != null) this.frame.line = line;
    this.steps.push({ kind, line, events: this.events, ...this.snapshot() });
    this.events = [];
  }

  tick() {
    if (++this.ops > this.limits.maxOps) {
      throw new PyError('StepLimit', 'programme arrêté : trop de calculs pour être animé');
    }
  }

  snapshot() {
    const heap = {};
    const visit = (v) => {
      if (v instanceof PyList && !(v.id in heap)) {
        heap[v.id] = this.snapList(v);
        v.items.forEach(visit);
      }
    };
    const frames = this.frames.map((f) => {
      const vars = [];
      for (const [name, v] of f.vars) {
        if (isHidden(v) || (f.isModule && this.hiddenNames.has(name))) continue;
        vars.push([name, this.snapValue(v)]);
        visit(v);
      }
      const loops = f.loops.map((l) => {
        visit(l.list);
        return { ref: l.list.id, index: l.index, var: l.var, label: l.label };
      });
      return { name: f.name, vars, loops };
    });
    return { frames, heap, out: this.output.length };
  }

  snapValue(v) {
    if (v instanceof PyList) return { t: 'list', ref: v.id };
    return { t: typeName(v), r: shortRepr(v, 120) };
  }

  snapList(list) {
    const cached = this.listCache.get(list.id);
    if (cached && cached.version === list.version) return cached.snap;
    const snap = { items: list.items.map((x) => this.snapValue(x)) };
    if (!list.items.some((x) => x instanceof PyDict)) this.listCache.set(list.id, { version: list.version, snap });
    return snap;
  }

  recordIndexName(list, indexNode) {
    let name = null;
    if (indexNode.type === 'Name') name = indexNode.id;
    else if (
      indexNode.type === 'BinOp' &&
      (indexNode.op === '+' || indexNode.op === '-') &&
      indexNode.left.type === 'Name' &&
      indexNode.right.type === 'Constant'
    ) {
      name = indexNode.left.id;
    }
    if (!name) return;
    if (!this.indexNames.has(list.id)) this.indexNames.set(list.id, new Set());
    this.indexNames.get(list.id).add(name);
  }

  // ---------------------------------------------------------------- variables

  lookup(name, node) {
    const f = this.frame;
    for (let k = f.compScopes.length - 1; k >= 0; k--) {
      if (f.compScopes[k].has(name)) return f.compScopes[k].get(name);
    }
    if (!f.isModule && !f.globalNames.has(name)) {
      if (f.vars.has(name)) return f.vars.get(name);
      if (f.locals.has(name)) {
        let message = `la variable locale « ${name} » est utilisée avant d'avoir reçu une valeur dans ${f.name}()`;
        if (this.globals.has(name)) {
          message += ` ; comme ${name} reçoit une valeur dans la fonction, Python la considère comme locale (ajoute « global ${name} » pour modifier la variable globale)`;
        }
        throw new PyError('UnboundLocalError', message, node.line);
      }
      for (let c = f.fn.closure; c; c = c.fn ? c.fn.closure : null) {
        if (c.vars.has(name)) return c.vars.get(name);
      }
    }
    if (this.globals.has(name)) return this.globals.get(name);
    if (this.builtins.has(name)) return this.builtins.get(name);
    throw this.nameError(name, node);
  }

  nameError(name, node) {
    const lines = this.assignLines.get(name);
    if (lines) {
      const later = lines.find((l) => l > node.line) ?? lines[0];
      return new PyError(
        'NameError',
        `la variable « ${name} » n'a pas encore de valeur à ce moment du programme (elle n'en reçoit une qu'à la ligne ${later})`,
        node.line,
      );
    }
    // d'abord une faute de frappe sur un nom de l'élève, puis les mots « français », puis les imports
    const ownSimilar = this.similarName(name, false);
    let hint = ownSimilar ? `voulais-tu écrire « ${ownSimilar} » ?` : NAME_HINTS[name.toLowerCase()];
    if (!hint && IMPORT_HINTS[name]) hint = `il faut d'abord l'importer : ${IMPORT_HINTS[name]}`;
    if (!hint) {
      const similar = this.similarName(name, true);
      hint = similar ? `voulais-tu écrire « ${similar} » ?` : 'aucune variable ni fonction ne porte ce nom';
    }
    return new PyError('NameError', `« ${name} » n'est pas défini : ${hint}`, node.line);
  }

  similarName(name, includeBuiltins) {
    const f = this.frame;
    const candidates = new Set([...f.vars.keys(), ...this.globals.keys()]);
    if (includeBuiltins) for (const k of this.builtins.keys()) candidates.add(k);
    for (const scope of f.compScopes) for (const k of scope.keys()) candidates.add(k);
    let best = null;
    let bestDistance = Infinity;
    for (const c of candidates) {
      if (c === name) continue;
      const d = c.toLowerCase() === name.toLowerCase() ? 0 : levenshtein(c, name);
      const allowed = name.length >= 5 ? 2 : 1;
      if (d <= allowed && d < bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    return best;
  }

  assignName(name, value, event = true, origin = null) {
    const f = this.frame;
    if (f.isModule || f.globalNames.has(name)) {
      this.globals.set(name, value);
      this.hiddenNames.delete(name);
    } else {
      f.vars.set(name, value);
    }
    if (!event) return;
    const ev = { type: 'assign', name, value: shortRepr(value) };
    if (origin?.cell) Object.assign(ev, { fromCell: origin.cell, fromText: origin.text });
    else if (origin?.name && origin.name !== name) ev.fromVar = origin.name;
    this.emit(ev);
  }

  // ---------------------------------------------------------------- instructions

  execBlock(body) {
    for (const s of body) this.execStmt(s);
  }

  execStmt(s) {
    this.curLine = s.line;
    switch (s.type) {
      case 'Assign':
        return this.execAssign(s);
      case 'AugAssign':
        return this.execAugAssign(s);
      case 'AnnAssign':
        if (s.value) this.assignTarget(s.target, this.evalExpr(s.value));
        return this.step(s.line);
      case 'ExprStmt':
        if (s.value.type === 'Constant' && typeof s.value.value === 'string') return undefined; // docstring
        this.evalExpr(s.value);
        if (s.suspiciousEquality) {
          this.emit({
            type: 'note',
            text: 'Cette ligne compare deux valeurs mais ne change rien. Pour donner une valeur à une variable, on écrit un seul =.',
          });
        }
        return this.step(s.line);
      case 'If':
        return this.execIf(s);
      case 'While':
        return this.execWhile(s);
      case 'For':
        return this.execFor(s);
      case 'FunctionDef':
        this.assignName(s.name, this.makeFunction(s), false);
        this.emit({ type: 'def', name: s.name, params: s.params.map((p) => p.name) });
        return this.step(s.line);
      case 'Return':
        throw new ReturnSignal(s.value ? this.evalExpr(s.value) : null, s.line);
      case 'Pass':
        return this.step(s.line);
      case 'Import':
        for (const { name, asname } of s.names) this.importName(asname ?? name, loadModule(name));
        this.emit({ type: 'import', names: s.names.map((n) => n.name) });
        return this.step(s.line);
      case 'ImportFrom': {
        const mod = loadModule(s.module);
        const names = s.names === '*' ? [...mod.attrs.keys()].map((name) => ({ name, asname: null })) : s.names;
        for (const { name, asname } of names) {
          if (!mod.attrs.has(name)) throw new PyError('ImportError', `le module ${s.module} ne contient pas « ${name} »`, s.line);
          this.importName(asname ?? name, mod.attrs.get(name));
        }
        this.emit({ type: 'import', module: s.module, names: s.names === '*' ? ['*'] : s.names.map((n) => n.name) });
        return this.step(s.line);
      }
      case 'Assert': {
        if (!truthy(this.evalExpr(s.test))) {
          const message = s.msg ? str(this.evalExpr(s.msg)) : '';
          throw new PyError('AssertionError', message || `la condition « ${this.text(s.test)} » est fausse`, s.line);
        }
        this.emit({ type: 'assert', src: this.text(s.test) });
        return this.step(s.line);
      }
      case 'Global':
        return undefined;
      case 'Delete':
        s.targets.forEach((t) => this.deleteTarget(t));
        return this.step(s.line);
    }
    throw new PyError('NotSupported', `L’instruction ${s.type} n'est pas encore prise en charge`, s.line);
  }

  importName(name, value) {
    this.assignName(name, value, false);
    if (this.frame.isModule) this.hiddenNames.add(name);
  }

  execAssign(s) {
    this.lastCell = null;
    const value = this.evalExpr(s.value);
    // d'où vient la valeur : une case de liste (temp = L[i]) ou une variable (L[j] = temp, m = x) ;
    // l'animation la fait voyager de là jusqu'à sa destination
    let origin = null;
    if (s.value.type === 'Subscript' && this.lastCell) {
      origin = { cell: this.lastCell, text: `${this.text(s.value.value)}[${this.lastCell.index}]` };
    } else if (s.value.type === 'Name') {
      origin = { name: s.value.id };
    }
    this.assignTarget(s.targets[0], value, origin);
    this.step(s.line);
  }

  execAugAssign(s) {
    const t = s.target;
    if (t.type === 'Name') {
      const old = this.lookup(t.id, t);
      const result = this.inplace(s.op, old, this.evalExpr(s.value));
      this.assignName(t.id, result);
    } else {
      const obj = this.evalExpr(t.value);
      if (t.slice.type === 'Slice') throw new PyError('NotSupported', 'L’opération sur une tranche n’est pas prise en charge', t.line);
      const index = this.evalExpr(t.slice);
      const old = this.getItem(obj, index, t);
      const result = this.inplace(s.op, old, this.evalExpr(s.value));
      this.setItem(obj, index, result, t, null);
    }
    this.step(s.line);
  }

  inplace(op, a, b) {
    if (op === '+' && a instanceof PyList) {
      // L += … modifie la liste elle-même (contrairement à L = L + …)
      a.items.push(...toArray(b));
      a.touch();
      this.emit({ type: 'mutate', method: 'extend', ref: a.id });
      return a;
    }
    return binaryOp(op, a, b);
  }

  execIf(s) {
    const result = truthy(this.evalExpr(s.test));
    const next = s.orelse.length ? (s.orelse[0].isElif ? 'elif' : 'else') : 'none';
    this.emit({ type: 'test', kind: s.isElif ? 'elif' : 'if', src: this.text(s.test), result, next });
    this.step(s.line);
    this.execBlock(result ? s.body : s.orelse);
  }

  execWhile(s) {
    for (;;) {
      const result = truthy(this.evalExpr(s.test));
      this.emit({ type: 'test', kind: 'while', src: this.text(s.test), result });
      this.step(s.line);
      if (!result) break;
      this.execBlock(s.body);
    }
  }

  execFor(s) {
    const iterable = this.evalExpr(s.iter);
    let it;
    try {
      it = makeIterator(iterable);
    } catch (e) {
      if (e instanceof PyError && e.line == null) e.line = s.line;
      throw e;
    }
    const varText = this.text(s.target);
    const iterText = this.text(s.iter);
    const frame = this.frame;
    const loop = it.kind === 'list' ? { list: iterable, index: -1, var: varText, label: iterText } : null;
    if (loop) frame.loops.push(loop);
    for (let e = it.next(); e; e = it.next()) {
      if (loop) {
        loop.index = e.index;
        this.emit({ type: 'read', ref: iterable.id, index: e.index });
      }
      this.assignTarget(s.target, e.value);
      this.emit({
        type: 'iter',
        var: varText,
        iter: iterText,
        kind: it.kind,
        index: e.index,
        value: shortRepr(e.value),
        ref: loop ? iterable.id : null,
      });
      this.step(s.line);
      this.execBlock(s.body);
    }
    if (loop) frame.loops.splice(frame.loops.indexOf(loop), 1);
    this.emit({ type: 'loopEnd', var: varText, iter: iterText, kind: it.kind });
    this.step(s.line);
  }

  deleteTarget(t) {
    if (t.type === 'Name') {
      const f = this.frame;
      const scope = f.isModule || f.globalNames.has(t.id) ? this.globals : f.vars;
      if (!scope.has(t.id)) throw this.nameError(t.id, t);
      scope.delete(t.id);
      this.emit({ type: 'delete', name: t.id });
      return;
    }
    const obj = this.evalExpr(t.value);
    if (t.slice.type === 'Slice') throw new PyError('NotSupported', 'del sur une tranche n’est pas pris en charge', t.line);
    const index = this.evalExpr(t.slice);
    if (obj instanceof PyList) {
      const i = this.checkIndex(obj, index, t);
      obj.items.splice(i, 1);
      obj.touch();
      this.emit({ type: 'mutate', method: 'del', ref: obj.id, index: i, target: this.text(t.value) });
    } else if (obj instanceof PyDict) {
      if (!obj.has(index)) throw new PyError('KeyError', `la clé ${shortRepr(index)} n'existe pas`, t.line);
      obj.delete(index);
    } else {
      throw new PyError('TypeError', `del ne s'applique pas à ${describe(obj)}`, t.line);
    }
  }

  // ---------------------------------------------------------------- affectations

  assignTarget(t, value, origin = null) {
    switch (t.type) {
      case 'Name':
        this.assignName(t.id, value, true, origin);
        return null;
      case 'Subscript': {
        const obj = this.evalExpr(t.value);
        if (t.slice.type === 'Slice') return this.setSlice(obj, t, value);
        const index = this.evalExpr(t.slice);
        return this.setItem(obj, index, value, t, origin);
      }
      case 'Tuple':
      case 'List': {
        const items = this.unpack(value, t.elts.length, t.line);
        return t.elts.map((e, k) => this.assignTarget(e, items[k]));
      }
    }
    throw new PyError('NotSupported', 'Ce type d’affectation n’est pas pris en charge', t.line);
  }

  unpack(value, n, line) {
    if (!(value instanceof PyList || value instanceof PyTuple || typeof value === 'string' || value instanceof PyRange)) {
      throw new PyError('TypeError', `impossible de répartir ${describe(value)} entre ${n} variables`, line);
    }
    const items = toArray(value);
    if (items.length !== n) {
      throw new PyError(
        'ValueError',
        items.length > n
          ? `trop de valeurs à répartir : ${items.length} valeurs pour ${n} variables`
          : `pas assez de valeurs à répartir : ${items.length} pour ${n} variables`,
        line,
      );
    }
    return items;
  }

  checkIndex(obj, index, node, len = obj.items?.length) {
    if (!isInt(index)) {
      const hint = typeof index === 'number' ? ' (utilise // pour une division entière)' : '';
      throw new PyError('TypeError', `un indice doit être un entier, pas ${describe(index)}${hint}`, node.line);
    }
    const i = normIndex(len, index);
    if (i < 0) {
      if (obj instanceof PyList) this.emit({ type: 'outOfRange', ref: obj.id, index: Number(intVal(index)) });
      const kind =
        typeof obj === 'string' ? 'la chaîne' : obj instanceof PyTuple ? 'le tuple' : obj instanceof PyRange ? 'le range' : 'la liste';
      const range = len === 0 ? `${kind.split(' ')[0] === 'la' ? 'elle' : 'il'} est vide` : `les indices vont de 0 à ${len - 1}`;
      throw new PyError('IndexError', `indice ${repr(index)} hors de ${kind} ${this.text(node.value)} : ${range}`, node.line);
    }
    return i;
  }

  getItem(obj, index, node) {
    this.lastCell = null;
    if (obj instanceof PyList || obj instanceof PyTuple) {
      const i = this.checkIndex(obj, index, node);
      if (obj instanceof PyList) {
        this.recordIndexName(obj, node.slice);
        this.emit({ type: 'read', ref: obj.id, index: i });
        this.lastCell = { ref: obj.id, index: i };
      }
      return obj.items[i];
    }
    if (typeof obj === 'string') {
      const chars = [...obj];
      return chars[this.checkIndex(obj, index, node, chars.length)];
    }
    if (obj instanceof PyDict) {
      if (!obj.has(index)) {
        throw new PyError('KeyError', `la clé ${shortRepr(index)} n'existe pas dans le dictionnaire ${this.text(node.value)}`, node.line);
      }
      return obj.get(index);
    }
    if (obj instanceof PyRange) return obj.at(this.checkIndex(obj, index, node, obj.length));
    throw new PyError('TypeError', `${describe(obj)} ne s'indexe pas avec des crochets`, node.line);
  }

  setItem(obj, index, value, node, origin) {
    if (obj instanceof PyList) {
      const i = this.checkIndex(obj, index, node);
      obj.items[i] = value;
      obj.touch();
      this.recordIndexName(obj, node.slice);
      const sameList = origin?.cell?.ref === obj.id;
      this.emit({
        type: 'write',
        ref: obj.id,
        index: i,
        value: shortRepr(value),
        name: this.text(node.value),
        from: sameList ? origin.cell.index : null,
        fromVar: origin?.name ?? null,
        // R[k] = L[i] : la valeur vient d'une case d'une autre liste
        ...(origin?.cell && !sameList ? { fromCell: origin.cell, fromText: origin.text } : {}),
      });
      return { ref: obj.id, index: i };
    }
    if (obj instanceof PyDict) {
      obj.set(index, value);
      this.emit({ type: 'dictSet', name: this.text(node.value), key: shortRepr(index), value: shortRepr(value) });
      return null;
    }
    if (typeof obj === 'string') {
      throw new PyError('TypeError', 'une chaîne de caractères ne peut pas être modifiée : construis une nouvelle chaîne', node.line);
    }
    if (obj instanceof PyTuple) throw new PyError('TypeError', 'un tuple ne peut pas être modifié', node.line);
    throw new PyError('TypeError', `${describe(obj)} ne permet pas de modifier un élément avec des crochets`, node.line);
  }

  sliceBounds(node) {
    const sl = node.slice;
    return [sl.lower, sl.upper, sl.step].map((e) => (e ? this.evalExpr(e) : null));
  }

  getSlice(obj, node) {
    const [lo, hi, st] = this.sliceBounds(node);
    if (obj instanceof PyList || obj instanceof PyTuple) {
      const indices = sliceIndices(obj.items.length, lo, hi, st);
      if (obj instanceof PyList && indices.length) this.emit({ type: 'slice', ref: obj.id, indices });
      const items = indices.map((i) => obj.items[i]);
      return obj instanceof PyList ? new PyList(items) : new PyTuple(items);
    }
    if (typeof obj === 'string') {
      const chars = [...obj];
      return sliceIndices(chars.length, lo, hi, st)
        .map((i) => chars[i])
        .join('');
    }
    throw new PyError('TypeError', `${describe(obj)} ne se découpe pas en tranches`, node.line);
  }

  setSlice(obj, node, value) {
    if (!(obj instanceof PyList)) throw new PyError('TypeError', `${describe(obj)} ne permet pas de modifier une tranche`, node.line);
    const [lo, hi, st] = this.sliceBounds(node);
    if (st !== null && !(isInt(st) && intVal(st) === 1n)) {
      throw new PyError('NotSupported', 'L’affectation d’une tranche avec un pas n’est pas prise en charge', node.line);
    }
    const indices = sliceIndices(obj.items.length, lo, hi, null);
    const start = indices.length ? indices[0] : Math.min(Math.max(lo === null ? 0 : normStart(obj.items.length, lo), 0), obj.items.length);
    const items = toArray(value);
    obj.items.splice(start, indices.length, ...items);
    obj.touch();
    this.emit({ type: 'mutate', method: 'slice', ref: obj.id, target: this.text(node.value), index: start, count: items.length });
    return null;
  }

  // ---------------------------------------------------------------- expressions

  evalExpr(node) {
    this.tick();
    this.curLine = node.line;
    switch (node.type) {
      case 'Constant':
        return node.value;
      case 'Name':
        return this.lookup(node.id, node);
      case 'List':
        return new PyList(node.elts.map((e) => this.evalExpr(e)));
      case 'Tuple':
        return new PyTuple(node.elts.map((e) => this.evalExpr(e)));
      case 'Dict': {
        const d = new PyDict();
        node.keys.forEach((k, i) => d.set(this.evalExpr(k), this.evalExpr(node.values[i])));
        return d;
      }
      case 'BinOp': {
        const left = this.evalExpr(node.left);
        const right = this.evalExpr(node.right);
        return this.located(node, () => binaryOp(node.op, left, right));
      }
      case 'UnaryOp': {
        const operand = this.evalExpr(node.operand);
        return this.located(node, () => unaryOp(node.op, operand));
      }
      case 'BoolOp': {
        let v = null;
        for (const e of node.values) {
          v = this.evalExpr(e);
          if (node.op === 'and' ? !truthy(v) : truthy(v)) return v;
        }
        return v;
      }
      case 'Compare':
        return this.evalCompare(node);
      case 'IfExp':
        return truthy(this.evalExpr(node.test)) ? this.evalExpr(node.body) : this.evalExpr(node.orelse);
      case 'Call':
        return this.evalCall(node);
      case 'Subscript': {
        const obj = this.evalExpr(node.value);
        if (node.slice.type === 'Slice') return this.getSlice(obj, node);
        const index = this.evalExpr(node.slice);
        return this.getItem(obj, index, node);
      }
      case 'Attribute': {
        const obj = this.evalExpr(node.value);
        return this.located(node, () => getAttribute(obj, node.attr));
      }
      case 'ListComp':
      case 'GeneratorExp':
        return this.evalComprehension(node);
      case 'FString':
        return this.evalFString(node);
      case 'Lambda':
        return this.makeFunction(node);
      case 'Slice':
        throw new PyError('SyntaxError', 'une tranche (a:b) ne s’écrit qu’entre crochets', node.line);
    }
    throw new PyError('NotSupported', `L’expression ${node.type} n'est pas prise en charge`, node.line);
  }

  located(node, fn) {
    try {
      return fn();
    } catch (e) {
      if (e instanceof PyError && e.line == null) e.line = node.line;
      throw e;
    }
  }

  operandInfo(node) {
    if (node.type === 'Subscript' && this.lastCell) return { cell: this.lastCell };
    if (node.type === 'Name') return { name: node.id };
    return null;
  }

  evalCompare(node) {
    let leftNode = node.left;
    this.lastCell = null;
    let left = this.evalExpr(leftNode);
    let leftInfo = this.operandInfo(leftNode);
    for (let k = 0; k < node.ops.length; k++) {
      const op = node.ops[k];
      const rightNode = node.comparators[k];
      this.lastCell = null;
      const right = this.evalExpr(rightNode);
      const rightInfo = this.operandInfo(rightNode);
      const result = this.located(node, () => compareValues(op, left, right));
      this.emit({
        type: 'compare',
        src: `${this.text(leftNode)} ${op} ${this.text(rightNode)}`,
        op,
        left: shortRepr(left, 40),
        right: shortRepr(right, 40),
        result,
        operands: [leftInfo, rightInfo],
      });
      if (!result) return false;
      left = right;
      leftNode = rightNode;
      leftInfo = rightInfo;
    }
    return true;
  }

  evalCall(node) {
    const func = this.evalExpr(node.func);
    // d'où vient chaque argument (une variable, une case de liste) : R.append(x) fait voyager la valeur
    const origins = [];
    const args = node.args.map((a) => {
      this.lastCell = null;
      const value = this.evalExpr(a);
      const info = this.operandInfo(a);
      origins.push(info?.cell ? { ...info, text: `${this.text(a.value)}[${info.cell.index}]` } : info);
      return value;
    });
    const kwargs = new Map();
    for (const k of node.keywords) kwargs.set(k.arg, this.evalExpr(k.value));
    return this.callFunction(func, args, kwargs, node, origins);
  }

  callFunction(func, args, kwargs, node, origins = []) {
    if (func instanceof PyFunction) return this.callUser(func, args, kwargs, node);
    if (func instanceof PyBuiltin) return this.located(node, () => func.fn(args, kwargs, this.ctx(node, origins)));
    if (func instanceof PyBoundMethod) return this.located(node, () => func.fn(func.self, args, kwargs, this.ctx(node, origins)));
    const hint = func instanceof PyList ? ' (pour lire un élément, utilise des crochets : L[i])' : '';
    throw new PyError('TypeError', `${describe(func)} ne peut pas être appelé comme une fonction${hint}`, node.line);
  }

  ctx(node, origins = []) {
    return {
      emit: (ev) => this.emit(ev),
      print: (text) => {
        this.output += text;
        this.emit({ type: 'print', text });
      },
      input: (prompt) => this.readInput(prompt),
      call: (fn, args, kwargs = new Map()) => this.callFunction(fn, args, kwargs, node),
      random: () => this.random(),
      seed: (s) => this.seedRandom(s),
      targetText: node.func?.type === 'Attribute' ? this.text(node.func.value) : null,
      argText: (k) => (node.args?.[k] ? this.text(node.args[k]) : null),
      argOrigin: (k) => origins[k] ?? null,
    };
  }

  readInput(prompt) {
    this.output += prompt;
    if (this.inputs.length === 0) {
      throw new PyError('EOFError', 'input() attend une valeur : écris-la dans le champ « Entrées » (une valeur par ligne), puis relance');
    }
    const value = this.inputs.shift();
    this.output += value + '\n';
    this.emit({ type: 'input', prompt, value });
    return value;
  }

  seedRandom(seed) {
    let s = seed === null || seed === undefined ? Math.floor(Math.random() * 2 ** 32) : hashSeed(seed);
    // mulberry32 : générateur pseudo-aléatoire simple et reproductible
    this.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  makeFunction(node) {
    const fn = new PyFunction(node, this.frame.isModule ? null : this.frame);
    if (node.type === 'Lambda') fn.name = '<lambda>';
    fn.defaults = node.params.map((p) => (p.default ? this.evalExpr(p.default) : undefined));
    return fn;
  }

  callUser(fn, args, kwargs, node) {
    const def = fn.node;
    const name = fn.name;
    if (this.frames.length > this.limits.maxDepth) {
      throw new PyError(
        'RecursionError',
        `plus de ${this.limits.maxDepth} appels imbriqués de ${name}() : la récursion ne s'arrête peut-être jamais (as-tu prévu un cas de base ?)`,
        node.line,
      );
    }
    const params = def.params;
    if (args.length > params.length) {
      throw new PyError(
        'TypeError',
        `${name}() attend ${params.length} argument${params.length > 1 ? 's' : ''}, mais en reçoit ${args.length}`,
        node.line,
      );
    }
    const given = new Map();
    args.forEach((a, k) => given.set(params[k].name, a));
    for (const [k, v] of kwargs) {
      if (!params.some((p) => p.name === k)) throw new PyError('TypeError', `${name}() n'a pas de paramètre « ${k} »`, node.line);
      if (given.has(k)) throw new PyError('TypeError', `${name}() reçoit deux valeurs pour « ${k} »`, node.line);
      given.set(k, v);
    }
    const vars = new Map();
    params.forEach((p, k) => {
      if (given.has(p.name)) vars.set(p.name, given.get(p.name));
      else if (p.default) vars.set(p.name, fn.defaults[k]);
      else throw new PyError('TypeError', `il manque l'argument « ${p.name} » dans l'appel de ${name}()`, node.line);
    });
    def.scope ??= functionScope(def);
    const frame = new Frame(name, fn, vars, def.scope);
    this.frames.push(frame);

    if (def.type === 'Lambda') {
      this.silent++;
      try {
        return this.evalExpr(def.body);
      } finally {
        this.silent--;
        this.frames.pop();
      }
    }

    this.emit({ type: 'call', name, args: params.map((p) => [p.name, shortRepr(vars.get(p.name))]) });
    this.step(def.line, 'call');
    let result = null;
    let line = null;
    try {
      this.execBlock(def.body);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) throw e;
      result = e.value;
      line = e.line;
    }
    this.emit({ type: 'return', name, value: shortRepr(result), implicit: line === null });
    this.step(line ?? frame.line ?? def.line, 'return');
    this.frames.pop();
    return result;
  }

  evalComprehension(node) {
    const frame = this.frame;
    const scope = new Map();
    const out = [];
    frame.compScopes.push(scope);
    this.silent++;
    try {
      const loop = (k) => {
        if (k === node.generators.length) {
          out.push(this.evalExpr(node.elt));
          return;
        }
        const g = node.generators[k];
        const it = makeIterator(this.evalExpr(g.iter));
        for (let e = it.next(); e; e = it.next()) {
          this.tick();
          this.assignCompTarget(g.target, e.value, scope);
          if (g.ifs.every((c) => truthy(this.evalExpr(c)))) loop(k + 1);
        }
      };
      loop(0);
    } finally {
      this.silent--;
      frame.compScopes.pop();
    }
    return new PyList(out);
  }

  assignCompTarget(t, value, scope) {
    if (t.type === 'Name') {
      scope.set(t.id, value);
      return;
    }
    if (t.type === 'Tuple' || t.type === 'List') {
      const items = this.unpack(value, t.elts.length, t.line);
      t.elts.forEach((e, k) => this.assignCompTarget(e, items[k], scope));
      return;
    }
    throw new PyError('NotSupported', 'Cette forme de compréhension n’est pas prise en charge', t.line);
  }

  evalFString(node) {
    let out = '';
    for (const part of node.parts) {
      if (part.kind === 'text') {
        out += part.value;
        continue;
      }
      const v = this.evalExpr(part.expr);
      const converted = part.conversion === 'r' || part.conversion === 'a' ? repr(v) : part.conversion === 's' ? str(v) : v;
      const formatted = this.located(node, () => formatValue(converted, part.formatSpec));
      if (part.debug !== null) out += part.debug + (part.conversion || part.formatSpec ? formatted : repr(v));
      else out += formatted;
    }
    return out;
  }
}

function normStart(len, v) {
  const i = Number(intVal(v));
  return i < 0 ? i + len : i;
}

function compareValues(op, a, b) {
  switch (op) {
    case '==':
      return pyEq(a, b);
    case '!=':
      return !pyEq(a, b);
    case '<':
      return pyCmp(a, b, op) < 0;
    case '<=':
      return pyCmp(a, b, op) <= 0;
    case '>':
      return pyCmp(a, b, op) > 0;
    case '>=':
      return pyCmp(a, b, op) >= 0;
    case 'in':
      return contains(b, a);
    case 'not in':
      return !contains(b, a);
    case 'is':
      return a === b || (isInt(a) && isInt(b) && pyEq(a, b) && typeof a === typeof b);
    case 'is not':
      return !compareValues('is', a, b);
  }
  throw new PyError('NotSupported', `comparaison ${op}`);
}
