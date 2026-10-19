// Tests de la traduction démarche → Python : consigne envoyée et contrôle de la réponse.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/python/interpreter.js';
import { assemble } from '../src/translate/assemble.js';
import { buildPrompt, demarcheLines } from '../src/translate/prompt.js';
import { DEMARCHE_EXAMPLES as EXAMPLES_DEMARCHE } from '../src/ui/examples.js';

const MAXIMUM = `L = [4,12,7,2,33]
m = L[0]
parcours la liste L
chaque fois que la valeur x rencontrée est supérieure à m, cela devient la nouvelle valeur de m`;

const MAXIMUM_ANSWER = {
  lignes: [
    { code: 'L = [4, 12, 7, 2, 33]', demarche: 1 },
    { code: 'm = L[0]', demarche: 2 },
    { code: 'for x in L:', demarche: 3 },
    { code: '    if x > m:', demarche: 4 },
    { code: '        m = x', demarche: 4 },
  ],
  hypotheses: [{ demarche: 4, texte: '« cela » désigne la valeur x.' }],
  incompris: [],
};

test('la consigne numérote les lignes de la démarche en sautant les lignes vides', () => {
  const text = 'L = [1, 2]\n\nparcours la liste L\n';
  assert.deepEqual(demarcheLines(text), [
    { n: 1, text: 'L = [1, 2]' },
    { n: 3, text: 'parcours la liste L' },
  ]);
  const prompt = buildPrompt(text);
  assert.match(prompt, /1\| L = \[1, 2\]\n3\| parcours la liste L\n/);
  assert.match(prompt, /traduis ce qui est écrit, pas ce que l'élève voulait dire/);
  assert.match(prompt, /annonce le but de la démarche/);
});

test('la traduction du maximum devient un programme commenté et exécutable', () => {
  const t = assemble(MAXIMUM_ANSWER, MAXIMUM);
  assert.ok(t.ok, t.message);
  assert.equal(
    t.python,
    `L = [4, 12, 7, 2, 33]
m = L[0]
for x in L:  # parcours la liste L
    if x > m:  # chaque fois que la valeur x rencontrée est supérieure à m, cela devient la nouvelle valeur de m
        m = x
`,
  );
  assert.deepEqual(t.map, [1, 2, 3, 4, 4]);
  assert.deepEqual(t.hypotheses, [{ line: 4, text: '« cela » désigne la valeur x.' }]);
  const r = run(t.python);
  assert.ok(r.ok);
  assert.equal(r.steps.at(-1).frames[0].vars.find(([n]) => n === 'm')[1].r, '33');
});

test('plusieurs lignes dans un même morceau, tabulations et numéros invalides', () => {
  const t = assemble(
    {
      lignes: [
        { code: 'L = [3, 1]', demarche: 1 },
        { code: 'for x in L:\n\tprint(x)', demarche: 2 },
        { code: 'fin = True', demarche: 99 },
        { code: '   ', demarche: 2 },
      ],
    },
    'L = [3, 1]\naffiche chaque élément',
  );
  assert.ok(t.ok, t.message);
  assert.equal(t.python, 'L = [3, 1]\nfor x in L:  # affiche chaque élément\n    print(x)\nfin = True\n');
  assert.deepEqual(t.map, [1, 2, 2, null]);
  assert.deepEqual(t.hypotheses, []);
});

test('une réponse sans traduction ou vide est refusée', () => {
  assert.equal(assemble(null, 'x').ok, false);
  assert.equal(assemble({ code: 'x = 1' }, 'x').ok, false);
  const empty = assemble({ lignes: [{ code: '  ', demarche: 1 }] }, 'rien');
  assert.equal(empty.ok, false);
  assert.match(empty.message, /vide/);
});

test('un Python non exécutable est refusé avec la ligne en cause', () => {
  const t = assemble({ lignes: [{ code: 'for x in L', demarche: 1 }, { code: '    pass', demarche: 1 }] }, 'parcours L');
  assert.equal(t.ok, false);
  assert.equal(t.line, 1);
  assert.match(t.message, /n'est pas exécutable \(ligne 1 : « : » attendu/);
  const unsupported = assemble({ lignes: [{ code: 'class A:', demarche: 1 }, { code: '    pass', demarche: 1 }] }, 'une classe');
  assert.equal(unsupported.ok, false);
  const breakOutside = assemble({ lignes: [{ code: 'break', demarche: 1 }] }, 'on arrête');
  assert.equal(breakOutside.ok, false);
});

test('une instruction refusée (break, a, b = b, a) : la traduction est redemandée avec l’explication', () => {
  const text = 'L = [5, 3, 8]\non parcourt la liste et on s’arrête dès qu’on trouve 3';
  const withBreak = assemble(
    {
      lignes: [
        { code: 'L = [5, 3, 8]', demarche: 1 },
        { code: 'for x in L:', demarche: 2 },
        { code: '    if x == 3:', demarche: 2 },
        { code: '        break', demarche: 2 },
      ],
    },
    text,
  );
  assert.equal(withBreak.ok, false);
  assert.equal(withBreak.line, 4);
  assert.match(withBreak.feedback, /^Ta ligne « break » est refusée par l'application : « break » n’est pas autorisé/);
  const swap = assemble({ lignes: [{ code: 'a = 1', demarche: 1 }, { code: 'b = 2', demarche: 1 }, { code: 'a, b = b, a', demarche: 2 }] }, 'a et b\non échange a et b');
  assert.match(swap.feedback, /« a, b = b, a »[\s\S]*temp = a, puis a = b, puis b = temp/);
  // une erreur de syntaxe n'est pas redemandée automatiquement
  assert.equal(assemble({ lignes: [{ code: 'for x in L', demarche: 1 }, { code: '    pass', demarche: 1 }] }, 'parcours L').feedback, undefined);
  assert.match(buildPrompt(text), /break est interdit/);
  assert.match(buildPrompt(text), /continue est interdit/);
  assert.match(buildPrompt(text), /Pas de break, pas de continue, pas de else après une boucle/);
  assert.doesNotMatch(buildPrompt(text), /while, (break|continue)/);
});

test('hypothèses et phrases incomprises : seules les entrées bien formées sont gardées', () => {
  const t = assemble(
    {
      lignes: [{ code: 'x = 1', demarche: 1 }],
      hypotheses: [{ demarche: 1, texte: '  x est un entier.  ' }, { demarche: 1 }, 'n’importe quoi', { demarche: 7, texte: 'hors limite' }],
      incompris: [{ demarche: 2, raison: 'ce n’est pas une action' }],
    },
    'x vaut 1\nvoilà',
  );
  assert.ok(t.ok);
  assert.deepEqual(t.hypotheses, [
    { line: 1, text: 'x est un entier.' },
    { line: null, text: 'hors limite' },
  ]);
  assert.deepEqual(t.incompris, [{ line: 2, text: 'ce n’est pas une action' }]);
});

test('une erreur de la démarche est gardée : l’animation la montrera', () => {
  const text = 'L = [4,12,7,2,33]\nparcours la liste L\nchaque fois que x est supérieure à m, x devient m';
  const t = assemble(
    {
      lignes: [
        { code: 'L = [4, 12, 7, 2, 33]', demarche: 1 },
        { code: 'for x in L:', demarche: 2 },
        { code: '    if x > m:', demarche: 3 },
        { code: '        m = x', demarche: 3 },
      ],
    },
    text,
  );
  assert.ok(t.ok);
  const r = run(t.python);
  assert.equal(r.error.type, 'NameError');
  assert.equal(r.error.line, 3);
});

test('les exemples de la consigne sont des réponses que le contrôle accepte', () => {
  const prompt = buildPrompt('x = 1');
  const examples = [...prompt.matchAll(/Démarche :\n([\s\S]*?)\nRéponse :\n([\s\S]*?)\n\(/g)];
  assert.equal(examples.length, 3);
  for (const [, numbered, json] of examples) {
    const text = numbered
      .split('\n')
      .map((l) => l.replace(/^\d+\| /, ''))
      .join('\n');
    const t = assemble(JSON.parse(json), text);
    assert.ok(t.ok, t.message);
  }
  const finalList = ([, numbered, json]) => {
    const r = run(assemble(JSON.parse(json), numbered.replace(/^\d+\| /gm, '')).python);
    assert.ok(r.ok);
    const last = r.steps.at(-1);
    return last.heap[last.frames[0].vars[0][1].ref].items.map((v) => v.r).join(' ');
  };
  // exemple 2 : une passe du tri à bulles ; exemple 3 : le plus grand échangé avec le dernier
  assert.equal(finalList(examples[1]), '3 5 1 8');
  assert.equal(finalList(examples[2]), '6 7 2 9');
});

// la traduction obtenue de Claude pour le tri par sélection (consigne 3) : l'échange se terminait
// par « x = temp », et le 4 disparaissait de la liste
const SELECTION = `démarche pour trier la liste L = [4,12,7,2,33]
on parcourt la liste pour placer son minimum en tete (chaque fois qu'on rencontre un nombre plus petit que le 1er de la liste, on l'échange avec le 1er de la liste.)`;
const swapThroughX = (demarche = 2) => ({
  lignes: [
    { code: 'L = [4, 12, 7, 2, 33]', demarche: 1 },
    { code: 'for x in L:', demarche },
    { code: '    if x < L[0]:', demarche },
    { code: '        temp = L[0]', demarche },
    { code: '        L[0] = x', demarche },
    { code: '        x = temp', demarche },
  ],
});

test('une traduction qui écrit dans la variable de la boucle au lieu de la liste est refusée', () => {
  const t = assemble(swapThroughX(), SELECTION);
  assert.equal(t.ok, false);
  assert.equal(t.line, 6);
  assert.match(t.message, /modifie x, la variable de la boucle « for x in L » \(ligne 6\)/);
  // l'explication donnée à Claude pour redemander la traduction
  assert.match(t.feedback, /« x = temp »/);
  assert.match(t.feedback, /for j in range\(len\(L\)\)\) et écris dans L\[j\]/);
  assert.match(buildPrompt(SELECTION, { feedback: t.feedback }), /ATTENTION : une traduction précédente[\s\S]*« x = temp »[\s\S]*Réponds uniquement/);
  assert.doesNotMatch(buildPrompt(SELECTION), /ATTENTION/);
  // même si l'élève appelle x le nombre rencontré : il parle d'échanger des éléments de la liste
  const named = SELECTION.replace('un nombre plus petit', 'un nombre x plus petit');
  assert.equal(assemble(swapThroughX(), named).ok, false);
});

test('la démarche qui donne elle-même une valeur à la variable de la boucle est traduite telle quelle', () => {
  const text = 'L = [3, -1, 4]\npour chaque x de L, si x < 0, x devient 0';
  const t = assemble(
    {
      lignes: [
        { code: 'L = [3, -1, 4]', demarche: 1 },
        { code: 'for x in L:', demarche: 2 },
        { code: '    if x < 0:', demarche: 2 },
        { code: '        x = 0', demarche: 2 },
      ],
    },
    text,
  );
  assert.ok(t.ok, t.message);
  // c'est l'erreur de l'élève : l'animation montre que la liste ne change pas
  const last = run(t.python).steps.at(-1);
  assert.equal(last.heap[last.frames[0].vars[0][1].ref].items.map((v) => v.r).join(' '), '3 -1 4');
  // une boucle sur les indices n'est pas concernée
  const indices = assemble(
    { lignes: [{ code: 'for i in range(3):', demarche: 1 }, { code: '    i = i + 1', demarche: 1 }] },
    'pour i de 0 à 2, on augmente i de 1',
  );
  assert.ok(indices.ok, indices.message);
});

test('tri par sélection décrit par un élève : la traduction attendue trie la liste', () => {
  const text = EXAMPLES_DEMARCHE.find((e) => e.id === 'demarche-tri-selection').text;
  // traduction de référence, telle que la consigne la décrit (renvois « On recommence », « On continue de même »)
  const answer = {
    lignes: [
      { code: 'L = [4, 12, 7, 2, 33]', demarche: 1 },
      { code: 'for j in range(1, len(L)):', demarche: 2 },
      { code: '    if L[j] < L[0]:', demarche: 2 },
      { code: '        temp = L[0]', demarche: 2 },
      { code: '        L[0] = L[j]', demarche: 2 },
      { code: '        L[j] = temp', demarche: 2 },
      { code: 'for j in range(2, len(L)):', demarche: 3 },
      { code: '    if L[j] < L[1]:', demarche: 3 },
      { code: '        temp = L[1]', demarche: 3 },
      { code: '        L[1] = L[j]', demarche: 3 },
      { code: '        L[j] = temp', demarche: 3 },
      { code: 'for j in range(3, len(L)):', demarche: 4 },
      { code: '    if L[j] < L[2]:', demarche: 4 },
      { code: '        temp = L[2]', demarche: 4 },
      { code: '        L[2] = L[j]', demarche: 4 },
      { code: '        L[j] = temp', demarche: 4 },
      { code: 'for i in range(3, len(L)):', demarche: 5 },
      { code: '    for j in range(i + 1, len(L)):', demarche: 5 },
      { code: '        if L[j] < L[i]:', demarche: 5 },
      { code: '            temp = L[i]', demarche: 5 },
      { code: '            L[i] = L[j]', demarche: 5 },
      { code: '            L[j] = temp', demarche: 5 },
    ],
    hypotheses: [{ demarche: 3, texte: '« On recommence » : même méthode avec la 2e position, sur la suite de la liste.' }],
    incompris: [],
  };
  const t = assemble(answer, text);
  assert.ok(t.ok, t.message);
  assert.deepEqual([...new Set(t.map)], [1, 2, 3, 4, 5]);
  const r = run(t.python);
  assert.ok(r.ok);
  const last = r.steps.at(-1);
  assert.equal(last.heap[last.frames[0].vars.find(([n]) => n === 'L')[1].ref].items.map((v) => v.r).join(' '), '2 4 7 12 33');
  // 4 échanges, chacun en trois lignes : la valeur part dans temp puis en revient
  const fromTemp = r.steps.flatMap((s) => s.events.filter((e) => e.type === 'write' && e.fromVar === 'temp'));
  assert.equal(fromTemp.length, 4);
});
