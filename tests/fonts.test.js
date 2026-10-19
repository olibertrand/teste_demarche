// Polices : chaque écriture proposée a sa police, stockée avec l'application.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HAND_FONTS } from '../src/ui/handwriting.js';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const faces = new Map(
  [...css.matchAll(/@font-face\s*{[^}]*font-family:\s*"([^"]+)";[^}]*url\("fonts\/([\w.-]+)"\)/g)].map(([, family, file]) => [family, file]),
);

test('chaque écriture proposée a sa police dans src/fonts', () => {
  assert.equal(new Set(HAND_FONTS.map((f) => f.id)).size, HAND_FONTS.length);
  for (const { family } of HAND_FONTS) {
    assert.ok(faces.has(family), `pas de @font-face pour ${family}`);
    assert.ok(existsSync(new URL(`../src/fonts/${faces.get(family)}`, import.meta.url)), faces.get(family));
  }
});

test('l’écriture par défaut de la feuille de style est la première proposée', () => {
  assert.equal(css.match(/--hand-family:\s*"([^"]+)"/)[1], HAND_FONTS[0].family);
});
