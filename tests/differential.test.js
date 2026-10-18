// Test différentiel : chaque programme est exécuté par le vrai Python 3 et par notre
// interpréteur ; les affichages et le type d'erreur éventuel doivent être identiques.
// (Ignoré si python3 n'est pas installé.)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { run } from '../src/python/interpreter.js';
import { EXAMPLES } from '../src/ui/examples.js';

const python = spawnSync('python3', ['--version']);
const hasPython = python.status === 0;

function cpython(code) {
  const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8', timeout: 20000 });
  const lastLine = r.stderr.trim().split('\n').pop() ?? '';
  const match = /^(\w+(?:Error|Exception)?)\b/.exec(lastLine);
  let error = r.status === 0 ? null : (match?.[1] ?? 'UnknownError');
  if (error === 'ModuleNotFoundError') error = 'ImportError';
  return { output: r.stdout, error };
}

function ours(code) {
  const r = run(code, { seed: 1 });
  return { output: r.output, error: r.error?.type ?? null, message: r.error?.message };
}

const PROGRAMS = {
  arithmetique: `
print(7 // 2, -7 // 2, 7 % 3, -7 % 3, 7 / 2, 6 / 2, 2 ** 10, 2 ** -1, 7.5 // 2, -7.5 % 2)
print(0.1 + 0.2, 1e16, 1e-5, 123456789.0, 1/3, 100.0, -0.0, 3.14159, 2.5e-7, 1.5e300 * 10)
print(round(2.5), round(3.5), round(2.675, 2), round(0.125, 2), round(1234, -2), round(-2.5), round(7.45, 1))
print(int("42"), int(" -7 "), int(3.9), int(-3.9), float("3.5"), float("1e3"), str(12) + "a", bool(0), bool([]), bool([0]))
print(abs(-3), abs(-2.5), min(3, 1, 2), max([4, 9, 2]), sum([1, 2, 3]), sum([0.5, 1]), sum(range(101)))
print(divmod(17, 5), divmod(-17, 5), pow(2, 8), 10 ** 20, 2 ** 64, 3 * 0.1, 1 - 0.9)
print(True + True, True * 3, 3 == 3.0, 1 < 2 < 3, 3 > 2 > 2, "a" < "b", [1, 2] < [1, 3], (1, 2) == (1, 2))
print(int("ff", 16), int("101", 2), bin(10), hex(255), oct(8), chr(65), ord("a"), 0b1010, 0xff, 1_000_000)
print(5 & 3, 5 | 3, 5 ^ 3, 1 << 4, 256 >> 2, ~5, -7 // 2.0, 10 % -3)
`,
  chaines: `
s = "Bonjour"
print(s[0], s[-1], s[1:4], s[::-1], len(s), s.upper(), s.lower(), "jour" in s, s * 2)
print("a,b,c".split(","), "  un  deux ".split(), " x ".strip(), "-".join(["a", "b"]), "abc".replace("b", "B"), "banane".count("an"))
print(f"{3.14159:.2f} {42:5d}|{'x':>3}|{'y':<3}|{'z':^5}|{7:03d} {1234567:,} {0.256:.1%} {-3:+d}")
x = 5
print(f"{x=} {x!r} {'texte'!r} {x * 2} {[1, 2]} {x:>4}|")
print("{} + {} = {}".format(2, 3, 5), "{:.1f}".format(2.25), "{0}{1}{0}".format("a", "b"))
print(repr("l'arbre"), repr('dit "oui"'), repr("a\\nb"), "tab\\tok", 'q\\'uote')
print("abc".find("c"), "abc".find("z"), "abc".startswith("ab"), "123".isdigit(), "aBc".swapcase(), "ab".center(6, "*"))
print(str(3.0), str(True), str(None), str([1, "a"]), len("été"), "é" < "f", "Zèbre".lower())
print("""triple
guillemets""", 'a' 'b', r"\\n brut")
`,
  listes: `
L = [3, 1, 2]
L.append(5); L.insert(0, 9); print(L)
print(L.pop(), L.pop(0), L)
L.sort(); print(L); L.reverse(); print(L)
print(L.index(2), L.count(1), [0] * 3, [1, 2] + [3], L[1:], L[:-1], L[::2], L[-2:], L[10:])
M = L
M.append(7)
print(L, M is L, L == [3, 2, 1, 7], L is [3, 2, 1, 7])
T = [[0] * 2 for _ in range(2)]
T[0][1] = 5
print(T, len(T), T[0][1])
print(sorted([3, 1, 2], reverse=True), list(range(5)), list(range(10, 0, -3)), list(reversed([1, 2, 3])))
print([x * x for x in range(6) if x % 2 == 0], list(enumerate("ab")), list(zip([1, 2], "ab")), [(i, j) for i in range(2) for j in range(2)])
a = 1
b = 2
temp = a
a = b
b = temp
print(a, b)
L = [1, 2, 3]
temp = L[0]
L[0] = L[2]
L[2] = temp
print(L)
for i, x in enumerate([7, 8]):
    print(i, x)
del L[1]
print(L)
L += [4]
print(L, L.copy(), list("abc"), sum([[1], [2]], []))
print(sorted(["b", "A", "c"]), sorted([(2, "b"), (1, "z"), (2, "a")]))
print(sorted([3, 1, 2], key=lambda v: -v), max(["aa", "b"], key=len), min([], default="vide"))
print([1, 2, 3][-1], (1, 2)[0], (1,), (), [], [[]], 3 in [1, 2, 3], 4 not in (1, 2))
print(any([0, 0, 1]), all([1, 1, 0]), list(map(str, [1, 2])), list(filter(lambda v: v > 1, [1, 2, 3])))
U = [5, 6, 7, 8]
U[1:3] = [0]
print(U, U.remove(0), U, [x for x in U if x not in (5,)])
`,
  dictionnaires: `
d = {"a": 1, "b": 2}
d["c"] = 3
print(d, d["a"], len(d), "a" in d, list(d.keys()), list(d.values()), d.get("z", 0), d.get("a"))
for k in d:
    print(k, d[k])
for k, v in d.items():
    print(k, v)
compte = {}
for c in "abracadabra":
    if c in compte:
        compte[c] += 1
    else:
        compte[c] = 1
print(compte, {1: "un", (1, 2): [3]}, d.pop("a"), d, dict([("x", 1)]))
`,
  fonctions: `
def f(a, b=2):
    return a * b
print(f(3), f(3, 4), f(b=5, a=1))
compteur = 0
def incremente():
    global compteur
    compteur += 1
incremente(); incremente()
print(compteur)
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
print(fact(10), fact(25))
def fibo(n):
    a = 0
    b = 1
    for _ in range(n):
        c = a + b
        a = b
        b = c
    return a
print([fibo(k) for k in range(10)])
def externe():
    x = 10
    def interne():
        return x + 1
    return interne()
print(externe())
def rien():
    pass
print(rien(), type(3), type("a") == str, isinstance(True, int), isinstance(2.0, (int, float)))
def somme(L):
    """Renvoie la somme des éléments de L."""
    s = 0
    for x in L:
        s += x
    return s
print(somme([1, 2, 3]))
carre = lambda x: x * x
print(carre(7))
`,
  controle: `
for i in range(10):
    if i == 2:
        continue
    if i == 5:
        break
    print(i, end=" ")
print()
n = 0
while True:
    n += 1
    if n >= 3:
        break
print(n)
for i in range(3):
    pass
else:
    print("fini", i)
x = 7
print("pair" if x % 2 == 0 else "impair")
print(not True, 1 and 2, 0 or "défaut", None is None, [] or [0], 0 and 1 / 0)
k = 0
while k < 3:
    k += 1
else:
    print("while terminé", k)
if x > 5: print("grand")
for c in "abc": print(c, end="")
print()
print(1, 2, sep="-", end="!\\n")
`,
  modules: `
import math
from math import sqrt, pi
print(math.sqrt(16), sqrt(2), round(pi, 4), math.floor(2.7), math.ceil(2.1), math.gcd(12, 18), math.factorial(5))
import random
random.seed(3)
r = random.randint(1, 6)
print(1 <= r <= 6, 0 <= random.random() < 1)
`,
};

const ERRORS = {
  'nom inconnu': 'print(x)',
  'indice hors liste': 'L = [1, 2]\nprint(L[5])',
  'division par zéro': 'print(1 / 0)',
  'modulo par zéro': 'print(5 % 0)',
  'str + int': 'print("a" + 1)',
  'int invalide': 'int("abc")',
  'clé absente': 'd = {}\nprint(d["k"])',
  'récursion infinie': 'def f():\n    return f()\nf()',
  'assertion': 'assert 1 == 2',
  'locale non définie': 'x = 0\ndef f():\n    x += 1\nf()',
  'méthode inconnue': 'L = [1]\nL.push(2)',
  'égalité dans if': 'x = 3\nif x = 3:\n    pass',
  'deux-points manquant': 'for i in range(3)\n    print(i)',
  'bloc non indenté': 'def f():\nreturn 1',
  'indentation inattendue': 'x = 1\n    y = 2',
  'première ligne indentée': '  x = 1',
  'chaîne non terminée': 'print("abc)',
  'parenthèse non fermée': 'x = (1, 2\nprint(x)',
  'trop de valeurs': 'for a, b in [[1, 2, 3]]:\n    pass',
  'len d’un entier': 'len(5)',
  'indice flottant': 'print([1, 2][1.0])',
  'chaîne non modifiable': 's = "abc"\ns[0] = "z"',
  'module absent': 'import module_qui_n_existe_pas',
  'break hors boucle': 'break',
  'return hors fonction': 'return 5',
  'désindentation incohérente': 'if True:\n        x = 1\n    y = 2',
  'argument manquant': 'def f(a, b):\n    return a\nf(1)',
  'trop d’arguments': 'def f(a):\n    return a\nf(1, 2)',
  'comparaison impossible': 'print(1 < "a")',
  'pop liste vide': '[].pop()',
  'remove absent': '[1].remove(2)',
  'index absent': '[1].index(2)',
  'max vide': 'max([])',
  'appel d’une liste': 'L = [1]\nL(0)',
  'caractère inattendu': 'x = 3 ≤ 4',
  'print sans parenthèses': 'print "bonjour"',
  'else if': 'x = 1\nif x > 0:\n    pass\nelse if x < 0:\n    pass',
  'mot réservé': 'def = 3',
  'répartition impossible': 'for a, b in [5]:\n    pass',
  'float invalide': 'float("3,5")',
  'sortie partielle': 'print("avant")\nprint(1 // 0)',
};

test('le vrai Python est disponible pour les tests différentiels', { skip: !hasPython && 'python3 absent' }, () => {
  assert.equal(python.status, 0);
});

for (const [name, code] of Object.entries(PROGRAMS)) {
  test(`même affichage que Python : ${name}`, { skip: !hasPython && 'python3 absent' }, () => {
    const expected = cpython(code);
    const actual = ours(code);
    assert.equal(actual.error, expected.error, actual.message);
    assert.equal(actual.output, expected.output);
  });
}

for (const [name, code] of Object.entries(ERRORS)) {
  test(`même erreur que Python : ${name}`, { skip: !hasPython && 'python3 absent' }, () => {
    const expected = cpython(code);
    const actual = ours(code);
    assert.equal(actual.error, expected.error, actual.message);
    assert.equal(actual.output, expected.output);
  });
}

for (const example of EXAMPLES) {
  test(`exemple « ${example.title} » : même comportement que Python`, { skip: !hasPython && 'python3 absent' }, () => {
    const actual = ours(example.code);
    if (actual.error === 'StepLimit') return; // boucle infinie volontaire : Python ne s'arrêterait pas
    const expected = cpython(example.code);
    assert.equal(actual.error, expected.error, actual.message);
    assert.equal(actual.output, expected.output);
  });
}
