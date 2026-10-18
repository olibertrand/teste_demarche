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
  // la condition, ses valeurs et le booléen obtenu : « x > m ⟶ 12 > 4 : True »
  assert.ok(flat.some((n) => n.src === 'x > m' && n.values === '12 > 4' && n.bool === true));
  assert.ok(flat.some((n) => n.src === 'x > m' && n.values === '4 > 4' && n.bool === false));
  assert.ok(flat.some((n) => n.text === 'donc on exécute le bloc du if'));
  assert.ok(flat.some((n) => n.text === 'donc on saute le bloc du if'));
  assert.ok(flat.some((n) => n.text === 'm ← 12'));
  assert.ok(flat.some((n) => n.text === 'Fin du parcours de L'));
  // l'affectation de x n'est pas répétée à côté de l'itération
  assert.ok(!flat.some((n) => n.text === 'x ← 12'));
});

test('tri par sélection et par insertion : échange et décalage', () => {
  const flat = texts(code('tri-selection')).all.flat();
  // l'échange en trois lignes : la valeur passe par temp
  assert.ok(flat.some((n) => n.text === 'temp ← T[0] = 7'));
  assert.ok(flat.some((n) => n.text === 'T[0] ← T[3] = 1'));
  assert.ok(flat.some((n) => n.text === 'T[3] ← temp = 7'));
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
  assert.ok(flat.some((n) => n.text === 'donc la boucle while s’arrête'));
  assert.ok(flat.some((n) => n.text === 'donc on exécute le bloc du if'));
});

test('condition composée : chaque comparaison puis la condition entière avec son booléen', () => {
  const { r, all } = texts(code('recherche-while'));
  const k = r.steps.findIndex((s) => s.events.some((e) => e.type === 'test' && e.result === false));
  assert.deepEqual(all[k], [
    { src: 'i < len(L)', values: '2 < 5', bool: true },
    { src: 'L[i] != v', values: '8 != 8', bool: false },
    { src: 'i < len(L) and L[i] != v', values: null, bool: false },
    { text: 'donc la boucle while s’arrête', tone: 'flow' },
  ]);
});

test('condition simple : le booléen n’est pas répété', () => {
  const { r, all } = texts('x = 3\nif (x < 4):\n    pass\nok = True\nif not ok:\n    pass');
  const first = all[r.steps.findIndex((s) => s.line === 2)];
  assert.deepEqual(first, [
    { src: 'x < 4', values: '3 < 4', bool: true },
    { text: 'donc on exécute le bloc du if', tone: 'flow' },
  ]);
  const second = all[r.steps.findIndex((s) => s.line === 5)];
  assert.deepEqual(second[0], { src: 'not ok', values: null, bool: false });
});

test('première et dernière étapes', () => {
  const { r, all } = texts(code('parcours'));
  assert.match(all[0][0].text, /^Prêt/);
  assert.equal(all.at(-1).at(-1).text, 'Fin du programme. Clique sur Exécuter pour recommencer.');
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
