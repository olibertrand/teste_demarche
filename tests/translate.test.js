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
  assert.equal(examples.length, 2);
  for (const [, numbered, json] of examples) {
    const text = numbered
      .split('\n')
      .map((l) => l.replace(/^\d+\| /, ''))
      .join('\n');
    const t = assemble(JSON.parse(json), text);
    assert.ok(t.ok, t.message);
  }
  // exemple 2 : une passe du tri à bulles, avec des échanges reconnus par l'animation
  const [, numbered, json] = examples[1];
  const t = assemble(JSON.parse(json), numbered.replace(/^\d+\| /gm, ''));
  const r = run(t.python);
  assert.ok(r.ok);
  assert.equal(r.steps.at(-1).heap[r.steps.at(-1).frames[0].vars[0][1].ref].items.map((v) => v.r).join(' '), '3 5 1 8');
});

test('tri par sélection décrit par un élève : la traduction attendue trie la liste', () => {
  const text = EXAMPLES_DEMARCHE.find((e) => e.id === 'demarche-tri-selection').text;
  // traduction de référence, telle que la consigne la décrit (renvois « On recommence », « On continue de même »)
  const answer = {
    lignes: [
      { code: 'L = [4, 12, 7, 2, 33]', demarche: 1 },
      { code: 'for j in range(1, len(L)):', demarche: 2 },
      { code: '    if L[j] < L[0]:', demarche: 2 },
      { code: '        L[0], L[j] = L[j], L[0]', demarche: 2 },
      { code: 'for j in range(2, len(L)):', demarche: 3 },
      { code: '    if L[j] < L[1]:', demarche: 3 },
      { code: '        L[1], L[j] = L[j], L[1]', demarche: 3 },
      { code: 'for j in range(3, len(L)):', demarche: 4 },
      { code: '    if L[j] < L[2]:', demarche: 4 },
      { code: '        L[2], L[j] = L[j], L[2]', demarche: 4 },
      { code: 'for i in range(3, len(L)):', demarche: 5 },
      { code: '    for j in range(i + 1, len(L)):', demarche: 5 },
      { code: '        if L[j] < L[i]:', demarche: 5 },
      { code: '            L[i], L[j] = L[j], L[i]', demarche: 5 },
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
  const swaps = r.steps.flatMap((s) => s.events.filter((e) => e.type === 'swap'));
  assert.equal(swaps.length, 4);
});
