// Tests des phrases affichées dans « Ce qui se passe » et de la phrase de la démarche.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/python/interpreter.js';
import { EXAMPLES } from '../src/ui/examples.js';
import { narrate, phraseFor } from '../src/ui/narration.js';

const code = (id) => EXAMPLES.find((e) => e.id === id).code;

function texts(src) {
  const r = run(src);
  const lines = src.split('\n');
  return { r, all: r.steps.map((s) => narrate(s, lines)) };
}

test('maximum : visite, comparaison et décision sont racontées', () => {
  const { all } = texts(code('maximum'));
  const flat = all.flat();
  assert.ok(flat.some((n) => n.text === 'x ← L[1] = 12'));
  const compare = flat.find((n) => n.text.startsWith('x > m') && n.text.endsWith('12 > 4'));
  assert.equal(compare.result, true);
  assert.ok(flat.some((n) => n.text === 'Condition vraie : on exécute le bloc du if'));
  assert.ok(flat.some((n) => n.text === 'm ← 12'));
  assert.ok(flat.some((n) => n.text === 'Fin du parcours de L'));
  // l'affectation de x n'est pas répétée à côté de l'itération
  assert.ok(!flat.some((n) => n.text === 'x ← 12'));
});

test('tri par sélection et par insertion : échange et décalage', () => {
  const flat = texts(code('tri-selection')).all.flat();
  assert.ok(flat.some((n) => n.text === 'Échange de T[0] et T[3]'));
  const insertion = texts(code('tri-insertion')).all.flat();
  assert.ok(insertion.some((n) => n.text === 'T[1] ← T[0] = 7'));
});

test('appel, retour et affichage', () => {
  const flat = texts(code('appartient')).all.flat();
  assert.ok(flat.some((n) => n.text === 'Appel de appartient(v = 8, L = [5, 3, 8, 1, 9])'));
  assert.ok(flat.some((n) => n.text === 'appartient() renvoie True'));
  assert.ok(flat.some((n) => n.text === 'Affiche : True'));
});

test('boucle while : la condition fausse arrête la boucle', () => {
  const flat = texts(code('recherche-while')).all.flat();
  assert.ok(flat.some((n) => n.text === 'Condition fausse : la boucle while s’arrête'));
  assert.ok(flat.some((n) => n.text === 'Condition vraie : on exécute le bloc du if'));
});

test('première et dernière étapes', () => {
  const { r, all } = texts(code('parcours'));
  assert.match(all[0][0].text, /^Prêt/);
  assert.equal(all.at(-1).at(-1).text, 'Fin du programme.');
  const passStep = r.steps.findIndex((s) => s.line === 3);
  assert.equal(all[passStep][0].text, 'pass : il n’y a rien à faire');
});

test('phrase de la démarche : commentaire de fin de ligne ou commentaires au-dessus', () => {
  const src = '# on parcourt la liste\n# élément par élément\nfor x in [1]:\n    y = x  # on copie x\n';
  const { comments } = run(src);
  assert.equal(phraseFor(3, comments), 'on parcourt la liste élément par élément');
  assert.equal(phraseFor(4, comments), 'on copie x');
  assert.equal(phraseFor(null, comments), null);
});
