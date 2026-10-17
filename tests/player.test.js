// Tests du lecteur : on avance et on recule d'une étape, sans sortir de la trace.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../src/ui/player.js';

test('le lecteur avance et recule sans sortir de la trace', () => {
  const shown = [];
  const player = new Player({ onShow: (k) => shown.push(k), onState: () => {} });
  player.load(3);
  player.prev(); // déjà au début : rien ne se passe
  player.next();
  player.next();
  assert.equal(player.atEnd, true);
  player.next(); // déjà à la fin : rien ne se passe
  player.prev();
  assert.deepEqual(shown, [0, 1, 2, 1]);
  assert.equal(player.atEnd, false);
});
