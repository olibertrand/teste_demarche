// Tests de la trace produite pour l'animation : événements, instantanés, messages d'erreur.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/python/interpreter.js';
import { EXAMPLES } from '../src/ui/examples.js';

const example = (id) => EXAMPLES.find((e) => e.id === id).code;
const events = (r, type) => r.steps.flatMap((s) => s.events.filter((e) => e.type === type));
const varsAt = (step) => Object.fromEntries(step.frames.at(-1).vars.map(([n, v]) => [n, v.r ?? `#${v.ref}`]));

test('maximum : chaque élément est visité dans l’ordre puis comparé à m', () => {
  const r = run(example('maximum'));
  assert.ok(r.ok);
  assert.deepEqual(
    events(r, 'iter').map((e) => [e.var, e.index, e.value]),
    [['x', 0, '4'], ['x', 1, '12'], ['x', 2, '7'], ['x', 3, '2'], ['x', 4, '33']],
  );
  const compares = events(r, 'compare');
  assert.deepEqual(compares.map((c) => c.result), [false, true, false, false, true]);
  assert.equal(compares[1].src, 'x > m');
  assert.deepEqual(compares[1].operands, [{ name: 'x' }, { name: 'm' }]);
  const assigns = events(r, 'assign').filter((e) => e.name === 'm');
  assert.deepEqual(assigns.map((e) => e.value), ['4', '12', '33']);
  assert.equal(varsAt(r.steps.at(-1)).m, '33');
  assert.equal(r.steps.at(-1).kind, 'end');
});

test('parcours : le curseur de boucle suit l’élément visité puis disparaît', () => {
  const r = run(example('parcours'));
  const iterSteps = r.steps.filter((s) => s.events.some((e) => e.type === 'iter'));
  assert.deepEqual(
    iterSteps.map((s) => s.frames[0].loops[0].index),
    [0, 1, 2, 3, 4],
  );
  assert.equal(iterSteps[0].frames[0].loops[0].var, 'x');
  const last = r.steps.at(-2);
  assert.ok(last.events.some((e) => e.type === 'loopEnd'));
  assert.equal(last.frames[0].loops.length, 0);
});

test('tri par sélection : l’échange se fait en trois lignes, avec temp', () => {
  const r = run(example('tri-selection'));
  assert.ok(r.ok);
  assert.equal(r.output, '[1, 2, 3, 5, 7, 9]\n');
  // premier échange : T[0] (7) et T[3] (1)
  const k = r.steps.findIndex((s) => s.events.some((e) => e.type === 'assign' && e.name === 'temp'));
  const [keep, move, back] = r.steps.slice(k, k + 3).map((s) => s.events.find((e) => e.type === 'assign' || e.type === 'write'));
  assert.deepEqual([keep.name, keep.value, keep.fromText, keep.fromCell.index], ['temp', '7', 'T[0]', 0]);
  assert.deepEqual([move.index, move.from, move.value], [0, 3, '1']);
  assert.deepEqual([back.index, back.fromVar, back.value], [3, 'temp', '7']);
});

test('une affectation ne donne une valeur qu’à une seule variable', () => {
  for (const code of ['a, b = 1, 2', 'L = [1, 2]\nL[0], L[1] = L[1], L[0]', '[a, b] = [1, 2]', 'def f():\n    x, y = 0, 0\nf()']) {
    const r = run(code);
    assert.equal(r.phase, 'syntax', code);
    assert.equal(r.error.type, 'NotAllowed');
    assert.match(r.error.message, /temp = a, puis a = b, puis b = temp/);
  }
  const chained = run('a = b = 0');
  assert.equal(chained.error.type, 'NotAllowed');
  assert.match(chained.error.message, /une affectation par ligne/);
  // le parcours avec deux variables reste possible
  assert.ok(run('for i, x in enumerate([5, 6]):\n    print(i, x)').ok);
});

test('tri par insertion : les décalages indiquent la case d’origine', () => {
  const r = run(example('tri-insertion'));
  assert.ok(r.ok);
  const shifts = events(r, 'write').filter((w) => w.from !== null);
  assert.ok(shifts.length > 0);
  for (const w of shifts) assert.equal(w.from, w.index - 1);
});

test('comparaison de deux cases : les cases comparées sont repérées', () => {
  const r = run(example('tri-selection'));
  const c = events(r, 'compare').find((e) => e.src === 'T[j] < T[imin]');
  assert.ok(c.operands[0].cell && c.operands[1].cell);
  assert.deepEqual([c.operands[0].cell.index, c.operands[1].cell.index], [1, 0]);
});

test('dichotomie : milieu est reconnu comme indice de L', () => {
  const r = run(example('dichotomie'));
  assert.equal(r.output, '5\n');
  const listId = Object.keys(r.meta.indexNames)[0];
  assert.ok(r.meta.indexNames[listId].includes('milieu'));
});

test('la liste passée en paramètre est la même que la liste globale', () => {
  const r = run(example('tri-insertion'));
  const call = r.steps.find((s) => s.kind === 'call');
  const globalRef = call.frames[0].vars.find(([n]) => n === 'L')[1].ref;
  const localRef = call.frames[1].vars.find(([n]) => n === 'T')[1].ref;
  assert.equal(localRef, globalRef);
});

test('appel et retour de fonction produisent leurs propres étapes', () => {
  const r = run(example('appartient'));
  const calls = r.steps.filter((s) => s.kind === 'call');
  const returns = r.steps.filter((s) => s.kind === 'return');
  assert.equal(calls.length, 2);
  assert.deepEqual(returns.map((s) => s.events.find((e) => e.type === 'return').value), ['True', 'False']);
  assert.equal(returns[0].line, 4);
  assert.deepEqual(calls[0].events[0].args, [['v', '8'], ['L', '[5, 3, 8, 1, 9]']]);
});

test('une liste non modifiée garde le même instantané d’une étape à l’autre', () => {
  const r = run(example('maximum'));
  const [a, b] = r.steps.slice(-3, -1);
  const id = Object.keys(a.heap)[0];
  assert.equal(a.heap[id], b.heap[id]);
});

test('indice de trop : message clair et état au moment de l’erreur', () => {
  const r = run(example('indice-de-trop'));
  assert.equal(r.error.type, 'IndexError');
  assert.equal(r.error.line, 3);
  assert.equal(r.error.message, 'indice 5 hors de la liste L : les indices vont de 0 à 4');
  const last = r.steps.at(-1);
  assert.equal(last.kind, 'error');
  assert.equal(varsAt(last).i, '4');
});

test('variable non initialisée : on indique où elle reçoit une valeur', () => {
  const r = run(example('oubli-initialisation'));
  assert.equal(r.error.type, 'NameError');
  assert.equal(r.error.line, 3);
  assert.match(r.error.message, /« m » n'a pas encore de valeur.*ligne 4/);
});

test('boucle infinie : arrêt après le nombre maximal d’étapes', () => {
  const r = run(example('boucle-infinie'), { limits: { maxSteps: 500 } });
  assert.equal(r.error.type, 'StepLimit');
  assert.equal(r.steps.length, 501);
  assert.match(r.error.message, /500 étapes/);
  assert.equal(r.error.title, 'Trop d’étapes');
});

test('les mots français et les imports oubliés sont signalés', () => {
  assert.match(run('afficher("bonjour")').error.message, /print/);
  assert.match(run('x = Vrai').error.message, /True/);
  assert.match(run('n = randint(1, 6)').error.message, /from random import randint/);
  assert.match(run('longeur = 3\nprint(longueur)').error.message, /voulais-tu écrire « longeur »/);
});

test('une égalité seule sur sa ligne déclenche une remarque', () => {
  const r = run('x = 1\nx == 2');
  assert.ok(events(r, 'note').length === 1);
});

test('les fonctionnalités hors programme sont refusées clairement', () => {
  const r = run('class A:\n    pass');
  assert.equal(r.phase, 'syntax');
  assert.equal(r.error.type, 'NotSupported');
  assert.match(r.error.message, /classes/);
});

test('input() lit les valeurs fournies dans l’ordre', () => {
  const r = run('a = input("a ? ")\nb = int(input())\nprint(a, b + 1)', { inputs: ['bonjour', '41'] });
  assert.ok(r.ok);
  assert.equal(r.output, 'a ? bonjour\n41\nbonjour 42\n');
  const missing = run('x = input()');
  assert.equal(missing.error.type, 'EOFError');
});

test('rendu de monnaie : les ajouts à la liste sont des événements', () => {
  const r = run(example('rendu-monnaie'));
  assert.equal(r.output, '[200, 50, 10, 2, 1]\n');
  const appends = events(r, 'mutate').filter((e) => e.method === 'append');
  assert.deepEqual(appends.map((e) => [e.target, e.index, e.value]), [
    ['rendu', 0, '200'],
    ['rendu', 1, '50'],
    ['rendu', 2, '10'],
    ['rendu', 3, '2'],
    ['rendu', 4, '1'],
  ]);
});

test('le hasard est reproductible avec une graine', () => {
  const code = 'from random import randint\nprint([randint(1, 100) for _ in range(5)])';
  assert.equal(run(code, { seed: 42 }).output, run(code, { seed: 42 }).output);
});

test('tous les exemples se terminent sans erreur interne', () => {
  for (const e of EXAMPLES) {
    const r = run(e.code, { limits: { maxSteps: 2000 } });
    assert.notEqual(r.error?.type, 'InternalError', `${e.id} : ${r.error?.message}`);
    assert.ok(r.steps.length > 1, e.id);
  }
});
