// Polices : celles de la feuille de style sont stockées avec l'application.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const faces = new Map(
  [...css.matchAll(/@font-face\s*{[^}]*font-family:\s*"([^"]+)";[^}]*url\("fonts\/([\w.-]+)"\)/g)].map(([, family, file]) => [family, file]),
);

test('chaque police de la feuille de style est dans src/fonts, et seulement elles', () => {
  for (const [family, file] of faces) assert.ok(existsSync(new URL(`../src/fonts/${file}`, import.meta.url)), `${family} : ${file}`);
  const files = readdirSync(new URL('../src/fonts/', import.meta.url)).filter((f) => f.endsWith('.woff2'));
  assert.deepEqual(files.sort(), [...faces.values()].sort());
});

test('les phrases de la démarche s’écrivent en Playpen Sans', () => {
  assert.ok(faces.has('Playpen Sans'));
  assert.match(css, /--font-hand:\s*"Playpen Sans"/);
});
