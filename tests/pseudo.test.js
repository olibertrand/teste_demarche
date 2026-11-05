// Traduction sans IA des démarches écrites en pseudo-code français.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/python/interpreter.js';
import { applyAnswer, translatePseudo } from '../src/translate/pseudo.js';
import { DEMARCHE_EXAMPLES } from '../src/ui/examples.js';

/** Répond aux questions (réponse donnée, sinon première proposition, sinon « Oui ») jusqu'à la traduction. */
function dialogue(text, answers = {}) {
  const asked = [];
  for (let k = 0; k < 10; k++) {
    const t = translatePseudo(text);
    if (!t.question) return { ...t, text, asked };
    const q = t.question;
    asked.push(q.id);
    const choice = q.choices ? q.choices[0] : null;
    const r = applyAnswer(text, q, answers[q.id] ?? q.suggestions?.[0], choice);
    assert.ok(!r.error, r.error);
    text = r.text;
  }
  throw new Error('trop de questions');
}

const python = (t) => t.python.replace(/ {2}# .*$/gm, '');
const lastValue = (r, name) => r.steps.at(-1).frames[0].vars.find(([n]) => n === name)?.[1];

test('« compteur <- 0. pour chaque élément x de la liste L, si x est égal à 5, ajoute 1 au compteur »', () => {
  const t = dialogue('compteur <- 0. pour chaque élément x de la liste L, si x est égal à 5, ajoute 1 au compteur');
  assert.deepEqual(t.asked, ['donnee:L']);
  // la liste proposée contient la valeur cherchée
  assert.match(t.text, /^L = \[5, 12, 5, 2, 33\]\n/);
  assert.equal(
    python(t),
    'L = [5, 12, 5, 2, 33]\ncompteur = 0\nfor x in L:\n    if x == 5:\n        compteur = compteur + 1\n',
  );
  assert.equal(lastValue(run(t.python), 'compteur').r, '2');
});

test('« parcourir la liste. A chaque fois qu’on trouve 5, ajoute 1 au compteur. » : trois questions, puis l’erreur de l’élève', () => {
  const first = translatePseudo("parcourir la liste. A chaque fois qu'on trouve 5, ajoute 1 au compteur.");
  assert.equal(first.question.id, 'liste:1');
  assert.match(first.question.text, /de quelle liste s’agit-il/);
  const t = dialogue("parcourir la liste. A chaque fois qu'on trouve 5, ajoute 1 au compteur.");
  assert.deepEqual(t.asked, ['liste:1', 'variable:1', 'donnee:L']);
  // les réponses complètent la phrase de l'élève
  assert.match(t.text, /parcourir la liste L avec la variable x\. A chaque fois/);
  assert.equal(python(t), 'L = [5, 12, 5, 2, 33]\nfor x in L:\n    if x == 5:\n        compteur = compteur + 1\n');
  // compteur n'a pas de valeur de départ : c'est la démarche qui est à corriger
  assert.equal(run(t.python).error.type, 'NameError');
});

test('« regarde chaque élément de la liste. Si l’élément vaut x, renvoie True… » devient une fonction', () => {
  const t = dialogue(
    "regarde chaque élément de la liste. Si l'élément vaut x, renvoie True. Si après avoir vu toute la liste on n'a pas trouvé x, renvoie False",
  );
  assert.deepEqual(t.asked, ['liste:1', 'variable:1', 'donnee:L', 'donnee:x']);
  // x est déjà pris par la valeur cherchée : on ne le propose pas pour le parcours
  assert.match(t.text, /regarde chaque élément e de la liste L\./);
  assert.equal(
    python(t),
    'L = [4, 12, 7, 2, 33]\nx = 7\ndef demarche(L, x):\n    for e in L:\n        if e == x:\n            return True\n    return False\nprint(demarche(L, x))\n',
  );
  assert.equal(run(t.python).output, 'True\n');
  assert.ok(t.hypotheses.some((h) => /on n’a rien trouvé/.test(h.text)));
  assert.ok(t.hypotheses.some((h) => /devient la fonction demarche\(L, x\)/.test(h.text)));
});

test('« pour chaque élément x de la liste L: si x == 5, ajoute 1 à compteur »', () => {
  const t = dialogue('pour chaque élément x de la liste L: si x == 5, ajoute 1 à compteur');
  assert.equal(python(t), 'L = [5, 12, 5, 2, 33]\nfor x in L:\n    if x == 5:\n        compteur = compteur + 1\n');
  assert.equal(run(t.python).error.type, 'NameError');
});

test('« pour chaque indice i de L: si L[i] > max alors L[I] est la nouvelle valeur de max »', () => {
  const t = dialogue('pour chaque indice i de L: si L[i] > max alors L[I] est la nouvelle valeur de max');
  assert.equal(python(t), 'L = [4, 12, 7, 2, 33]\nfor i in range(len(L)):\n    if L[i] > max:\n        max = L[i]\n');
  assert.ok(t.hypotheses.some((h) => h.text === '« I » : j’ai compris i.'));
  // max n'a pas de valeur de départ : c'est encore la fonction max de Python
  const error = run(t.python).error;
  assert.equal(error.type, 'TypeError');
  assert.match(error.message, /« max » n’a pas encore reçu de valeur/);
});

test('affectation : <-, ←, = et « prend la valeur »', () => {
  for (const line of ['m <- 3', 'm ← 3', 'm = 3', 'm prend la valeur 3', 'm<-3', 'm reçoit 3', 'on met 3 dans m', 'initialise m à 3']) {
    const t = translatePseudo(line);
    assert.ok(t.ok, `${line} : ${t.message}`);
    assert.equal(python(t), 'm = 3\n', line);
  }
  assert.equal(python(translatePseudo('L = [1, 2]\nL[0] prend la valeur L[1]')), 'L = [1, 2]\nL[0] = L[1]\n');
});

test('puissance : 2**n, 2^n, « 2 puissance n », « au carré », n²', () => {
  const cases = {
    'affiche 2**n': 'print(2 ** n)',
    'affiche 2 ** n': 'print(2 ** n)',
    'affiche 2^n': 'print(2 ** n)',
    'p <- 2 puissance n': 'p = 2 ** n',
    'p <- 2 à la puissance n': 'p = 2 ** n',
    'p <- n au carré': 'p = n ** 2',
    'p <- n au cube + 1': 'p = n ** 3 + 1',
    'p <- n²': 'p = n ** 2',
    'p <- n³': 'p = n ** 3',
    'affiche -n**2, 2**-1, 2**3**2': 'print(-n ** 2, 2 ** -1, 2 ** 3 ** 2)',
  };
  for (const [line, code] of Object.entries(cases)) {
    const t = translatePseudo(`n = 3\n${line}`);
    assert.ok(t.ok, `${line} : ${t.message}`);
    assert.equal(python(t).split('\n')[1], code, line);
  }
  // « ^ » est la puissance des maths ; en Python, c'est ** : la traduction le dit
  assert.ok(translatePseudo('n = 3\naffiche 2^n').hypotheses.some((h) => /\*\* en Python/.test(h.text)));
  assert.equal(run(python(translatePseudo('n = 10\naffiche 2**n, n²'))).output, '1024 100\n');
});

test('les blocs suivent l’indentation ; dans une ligne, « si » s’arrête à la fin de sa phrase', () => {
  const t = translatePseudo('L = [5, 2, 8]\nc = 0\npour chaque élément x de L :\n    si x > 4 :\n        affiche x\n    sinon :\n        augmente c de 1\naffiche c');
  assert.equal(
    python(t),
    'L = [5, 2, 8]\nc = 0\nfor x in L:\n    if x > 4:\n        print(x)\n    else:\n        c = c + 1\nprint(c)\n',
  );
  const sameLine = translatePseudo('L = [5, 2]\npour chaque élément x de L : si x > 4 alors affiche x. affiche 0');
  assert.equal(python(sameLine), 'L = [5, 2]\nfor x in L:\n    if x > 4:\n        print(x)\n    print(0)\n');
});

test('« de 0 à 4 » compte 4 ; les bornes sont simplifiées', () => {
  const t = translatePseudo('pour i allant de 0 à 4 :\n    affiche i');
  assert.equal(python(t), 'for i in range(5):\n    print(i)\n');
  assert.equal(run(t.python).output, '0\n1\n2\n3\n4\n');
  assert.match(t.hypotheses[0].text, /4 compris/);
  assert.equal(python(translatePseudo('L = [1]\npour i de 0 à len(L) - 1 :\n    affiche i')), 'L = [1]\nfor i in range(len(L)):\n    print(i)\n');
  assert.equal(python(translatePseudo('n = 3\npour k de 1 à n :\n    affiche k')), 'n = 3\nfor k in range(1, n + 1):\n    print(k)\n');
  assert.equal(python(translatePseudo('L = [1, 2, 3]\npour i de 0 à len(L) - 2 :\n    affiche i')), 'L = [1, 2, 3]\nfor i in range(len(L) - 1):\n    print(i)\n');
});

test('une phrase à répéter, mais pas décalée : la question propose de la décaler', () => {
  const text = 'L = [4, 12, 7, 2, 33]\nm = L[0]\nparcours la liste L\nchaque fois que la valeur x rencontrée est supérieure à m, cela devient la nouvelle valeur de m';
  const first = translatePseudo(text);
  assert.equal(first.question.id, 'decaler:4');
  assert.deepEqual(first.question.choices.map((c) => c.label), ['Oui, la décaler', 'Non']);
  const indented = applyAnswer(text, first.question, null, first.question.choices[0]).text;
  assert.match(indented, /\n {4}chaque fois que/);
  const t = translatePseudo(indented);
  // la variable du parcours vient de « la valeur x rencontrée », « cela » est x
  assert.equal(python(t), 'L = [4, 12, 7, 2, 33]\nm = L[0]\nfor x in L:\n    if x > m:\n        m = x\n');
  assert.ok(t.hypotheses.some((h) => h.text === '« cela » : j’ai compris x.'));
  assert.equal(lastValue(run(t.python), 'm').r, '33');
  // « Non » : la question ne revient pas, le parcours reste vide
  const refused = translatePseudo(text, { dismissed: new Set(['decaler:4']) });
  assert.notEqual(refused.question?.id, 'decaler:4');
});

test('les réponses sont vérifiées avant de compléter la démarche', () => {
  const name = { input: 'name', edit: { at: 0, insert: '{} ' }, avoid: ['L'] };
  assert.match(applyAnswer('x', name, 'mon nom').error, /un seul mot/);
  assert.match(applyAnswer('x', name, 'si').error, /un seul mot/);
  assert.match(applyAnswer('x', name, 'L').error, /déjà le nom de la liste/);
  assert.equal(applyAnswer('x', name, 'e').text, 'e x');
  const list = { input: 'list', edit: { dataLine: 'L = {}' } };
  assert.match(applyAnswer('parcours la liste L', list, '[1, 2').error, /entre crochets/);
  // sans crochets, la liste est complétée ; la ligne vient après les données déjà écrites
  assert.equal(applyAnswer('v = 3\nparcours la liste L', list, '4, 5').text, 'v = 3\nL = [4, 5]\nparcours la liste L');
  const value = { input: 'value', edit: { dataLine: 'x = {}' } };
  assert.match(applyAnswer('a', value, 'deux mots').error, /Une valeur/);
});

test('ce que les règles ne savent pas traduire est signalé, avec la phrase en cause', () => {
  const unknown = translatePseudo('L = [1, 2]\npour chaque élément x de L, fais clignoter x');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.incompris[0].line, 2);
  assert.match(unknown.message, /« fais clignoter x »/);
  // échanger l'élément rencontré demande sa position
  const swap = translatePseudo("L = [4, 2]\npour chaque élément x de L : si x < L[0], on l'échange avec le premier de la liste");
  assert.match(swap.message, /parcours les indices/);
  // « on n'a pas trouvé x » sans arrêt possible dans le parcours : comment le sait-on ?
  const flag = translatePseudo("L = [1]\nx = 2\npour chaque élément e de L :\n    si e == x alors affiche e\nsi après avoir vu toute la liste on n'a pas trouvé x, affiche 0");
  assert.match(flag.message, /comment le sait-on/);
  // « on recommence… » : hors de portée des règles
  const again = translatePseudo('L = [3, 1]\non recommence pour placer le 2e plus petit en 2e position');
  assert.equal(again.ok, false);
});

test('l’erreur écrite par l’élève est gardée : « x devient 0 » ne change pas la liste', () => {
  const t = translatePseudo('L = [3, -1, 4]\npour chaque x de L, si x < 0, x devient 0\naffiche L');
  assert.equal(python(t), 'L = [3, -1, 4]\nfor x in L:\n    if x < 0:\n        x = 0\nprint(L)\n');
  assert.equal(run(t.python).output, '[3, -1, 4]\n');
});

test('majuscules, accents, mots en plus et lignes de Python sont acceptés', () => {
  const t = translatePseudo('L = [1, 5]\nPour Chaque Élément X De La Liste L : si X Est Supérieur À 3, Affiche X');
  assert.equal(python(t), 'L = [1, 5]\nfor X in L:\n    if X > 3:\n        print(X)\n');
  const mixed = translatePseudo('L = [4, 12, 7]\nfor x in L:\n    if x > 5:\n        print(x)\nL.append(9)');
  assert.equal(python(mixed), 'L = [4, 12, 7]\nfor x in L:\n    if x > 5:\n        print(x)\nL.append(9)\n');
  const words = translatePseudo('notes = [12, 15]\ns <- 0\npour chaque note n de la liste notes :\n    on ajoute n à s\nmoyenne = s / la longueur de notes\nafficher moyenne');
  assert.equal(run(words.python).output, '13.5\n');
  // la phrase de la démarche accompagne la première ligne Python qui la traduit
  assert.match(words.python, /^for n in notes: {2}# pour chaque note n de la liste notes :$/m);
  assert.deepEqual(words.map, [1, 2, 3, 4, 5, 6]);
});

test('chaque démarche proposée en exemple se traduit et s’exécute', () => {
  const expected = {
    'demarche-maximum': '33\n',
    'demarche-somme': '12.4\n',
    'demarche-pairs': '3\n',
    'demarche-appartient': 'True\n',
    'demarche-recherche': '2\n',
    'demarche-bulles': '[3, 7, 1, 9]\n',
  };
  for (const ex of DEMARCHE_EXAMPLES) {
    const t = dialogue(ex.text);
    assert.ok(t.ok, `${ex.id} : ${t.message}`);
    const r = run(t.python);
    assert.notEqual(r.error?.type, 'InternalError', ex.id);
    if (expected[ex.id]) assert.equal(r.output, expected[ex.id], ex.id);
  }
});
