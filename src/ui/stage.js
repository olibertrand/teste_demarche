// La scène : dessine l'état du programme à une étape donnée de la trace.
import { h, prefersReducedMotion } from './dom.js';
import { narrate, phraseFor } from './narration.js';

// Bornes d'une zone de recherche (dichotomie) : les cases en dehors sont grisées.
const ZONE_PAIRS = [
  ['debut', 'fin'],
  ['deb', 'fin'],
  ['gauche', 'droite'],
  ['g', 'd'],
  ['bas', 'haut'],
  ['inf', 'sup'],
  ['lo', 'hi'],
];

// Erreurs propres au simulateur (pas des erreurs Python) : on n'affiche pas leur nom technique.
const SIMULATOR_ERRORS = new Set(['StepLimit', 'NotSupported', 'InternalError']);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pushTo(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function describeError(e) {
  const where = e.line ? ` · ligne ${e.line}` : '';
  const type = SIMULATOR_ERRORS.has(e.type) ? '' : ` · ${e.type}`;
  return [h('p', { class: 'error-title' }, h('strong', {}, e.title), `${type}${where}`), h('p', {}, capitalize(e.message))];
}

export class Stage {
  constructor(els) {
    this.els = els;
    this.run = null;
    this.moveDuration = 450;
  }

  load(run, source) {
    this.run = run;
    this.lines = source.split('\n');
    this.exclusive = new Map();
    // Ces zones gardent la même hauteur pendant toute l'exécution : rien ne saute d'une étape à l'autre.
    this.hasPhrases = [...run.comments.values()].some((c) => c.text);
    this.hasCalls = run.steps.some((s) => s.kind === 'call');
  }

  render(k, { animate = true } = {}) {
    const step = this.run.steps[k];
    const prev = k > 0 ? this.run.steps[k - 1] : null;
    this.renderPhrase(step);
    this.renderStructures(step);
    this.renderVariables(step);
    this.renderStack(step);
    this.renderNarration(step);
    this.renderError(step);
    this.renderOutput(step, prev);
    if (animate && !prefersReducedMotion()) this.animateMoves(step);
  }

  // ---------------------------------------------------------------- phrase de la démarche

  renderPhrase(step) {
    this.els.phrase.hidden = !this.hasPhrases;
    this.els.phraseText.textContent = phraseFor(step.line, this.run.comments) ?? '';
  }

  // ---------------------------------------------------------------- listes

  collectLists(step) {
    const frames = step.frames;
    const top = frames[frames.length - 1];
    const mod = frames[0];
    const lists = new Map();
    const entry = (ref) => {
      if (!lists.has(ref)) lists.set(ref, { ref, names: [], globals: [], anon: null });
      return lists.get(ref);
    };
    for (const [name, v] of top.vars) if (v.t === 'list') entry(v.ref).names.push(name);
    if (top !== mod) for (const [name, v] of mod.vars) if (v.t === 'list') entry(v.ref).globals.push(name);
    for (const frame of top === mod ? [top] : [top, mod]) {
      for (const loop of frame.loops) {
        const items = step.heap[loop.ref]?.items ?? [];
        // une liste parcourue sans nom (for x in [3, 1, 2]) ; on évite les listes de tuples (enumerate…)
        if (!lists.has(loop.ref) && items.every((it) => it.t !== 'tuple' && it.t !== 'list')) {
          entry(loop.ref).anon = loop.label;
        }
      }
    }
    return [...lists.values()];
  }

  renderStructures(step) {
    const box = this.els.structures;
    box.textContent = '';
    const lists = this.collectLists(step);
    if (lists.length === 0) {
      box.append(h('p', { class: 'empty' }, 'Les listes du programme apparaîtront ici.'));
      return;
    }
    for (const info of lists) box.append(this.renderList(info, step));
  }

  cellText(snap, heap, depth = 0) {
    if (snap.t !== 'list') return snap.r;
    const entry = heap[snap.ref];
    if (!entry || depth > 2) return '[…]';
    const text = '[' + entry.items.map((x) => this.cellText(x, heap, depth + 1)).join(', ') + ']';
    return text.length > 40 ? text.slice(0, 39) + '…]' : text;
  }

  renderList(info, step) {
    const items = step.heap[info.ref]?.items ?? [];
    const len = items.length;
    const frames = step.frames;
    const top = frames[frames.length - 1];
    const owner = info.names.length || info.anon ? top : frames[0];
    const { marks, whole } = this.cellMarks(info.ref, step, owner);
    const pointers = this.pointers(info.ref, owner, len);
    const cursors = new Map();
    for (const loop of owner.loops) if (loop.ref === info.ref && loop.index >= 0) pushTo(cursors, loop.index, loop.var);
    const zone = this.zone(info.ref, owner, len);
    const label = info.names[0] ?? info.globals[0] ?? info.anon;

    // case fantôme là où le programme a voulu lire au-delà de la fin (IndexError)
    const missing = new Set(
      step.events.filter((e) => e.type === 'outOfRange' && e.ref === info.ref && e.index >= len && e.index <= len + 6).map((e) => e.index),
    );
    const first = pointers.has(-1) ? -1 : 0;
    const last = Math.max(pointers.has(len) ? len : len - 1, ...missing);
    const track = h('div', { class: 'track' });
    for (let i = first; i <= last; i++) {
      const ghost = i < 0 || i >= len;
      const isMissing = missing.has(i);
      const classes = ['cell', ...(marks.get(i) ?? [])];
      if (isMissing) classes.push('is-missing');
      if (!ghost && zone && (i < zone[0] || i > zone[1])) classes.push('is-dim');
      const value = isMissing ? '?' : ghost ? '' : this.cellText(items[i], step.heap);
      const title = isMissing ? `${label}[${i}] n’existe pas` : ghost ? 'hors de la liste' : `${label}[${i}] = ${value}`;
      const cell = h('div', { class: classes.join(' '), 'data-index': i, title }, h('span', { class: 'val' }, value));
      const tags = [
        ...(cursors.get(i) ?? []).map((v) => h('span', { class: 'cursor', title: `${v} parcourt la liste : il vaut cet élément` }, v)),
        ...(pointers.get(i) ?? []).map((p) => h('span', { class: 'ptr', title: `${p} = ${i}` }, p)),
      ];
      track.append(
        h(
          'div',
          { class: ghost ? 'slot is-ghost' : 'slot' },
          cell,
          h('span', { class: 'idx' }, ghost && !isMissing ? '' : String(i)),
          h('div', { class: 'tags' }, tags),
        ),
      );
    }
    if (len === 0) track.append(h('span', { class: 'empty-list' }, 'liste vide'));

    const caption = h('figcaption', {}, h('span', { class: 'aname' }, info.names.length ? info.names.join(' = ') : label));
    const aliases = info.globals.filter((g) => !info.names.includes(g));
    if (info.names.length && aliases.length) caption.append(h('span', { class: 'alias' }, `même liste que ${aliases.join(', ')}`));
    else if (!info.names.length && info.globals.length) caption.append(h('span', { class: 'alias' }, 'variable globale'));
    else if (info.anon) caption.append(h('span', { class: 'alias' }, 'liste parcourue'));
    caption.append(h('span', { class: 'alen' }, len === 1 ? '1 élément' : `${len} éléments`));
    return h('figure', { class: whole ? 'array is-changed' : 'array', 'data-ref': info.ref }, caption, track);
  }

  cellMarks(ref, step, owner) {
    const marks = new Map();
    let whole = false;
    const add = (i, c) => pushTo(marks, i, c);
    for (const e of step.events) {
      switch (e.type) {
        case 'read':
          if (e.ref === ref) add(e.index, 'is-read');
          break;
        case 'compare':
          for (const o of e.operands) {
            if (o?.cell?.ref === ref) add(o.cell.index, 'is-compared');
            else if (o?.name) {
              // x comparé alors que x parcourt la liste : on montre aussi la case correspondante
              const loop = owner.loops.find((l) => l.ref === ref && l.var === o.name);
              if (loop) add(loop.index, 'is-compared');
            }
          }
          break;
        case 'write':
          if (e.ref === ref) add(e.index, 'is-written');
          break;
        case 'swap':
          if (e.ref === ref) {
            add(e.i, 'is-swapped');
            add(e.j, 'is-swapped');
          }
          break;
        case 'mutate':
          if (e.ref !== ref) break;
          if (e.method === 'append' || e.method === 'insert') add(e.index, 'is-written');
          else if (e.method !== 'pop' && e.method !== 'remove' && e.method !== 'del') whole = true;
          break;
        case 'slice':
          if (e.ref === ref) e.indices.forEach((i) => add(i, 'is-sliced'));
          break;
      }
    }
    return { marks, whole };
  }

  pointers(ref, frame, len) {
    const map = new Map();
    const vars = new Map(frame.vars);
    const names = [...(this.run.meta.indexNames?.[ref] ?? [])];
    if (names.length) {
      for (const [a, b] of ZONE_PAIRS) if (vars.get(a)?.t === 'int' && vars.get(b)?.t === 'int') names.push(a, b);
    }
    for (const name of new Set(names)) {
      const v = vars.get(name);
      if (v?.t !== 'int') continue;
      const i = Number(v.r);
      if (i >= -1 && i <= len) pushTo(map, i, name);
    }
    return map;
  }

  zone(ref, frame, len) {
    if (!this.run.meta.indexNames?.[ref]) return null;
    const vars = new Map(frame.vars);
    for (const [a, b] of ZONE_PAIRS) {
      const lo = vars.get(a);
      const hi = vars.get(b);
      if (lo?.t !== 'int' || hi?.t !== 'int') continue;
      return [Number(lo.r), Number(hi.r) - (this.isExclusive(ref, b) ? 1 : 0)];
    }
    return null;
  }

  /** La borne haute est-elle exclue (fin = len(L)) ? On le devine sur l'ensemble de la trace. */
  isExclusive(ref, hiName) {
    const key = `${ref}:${hiName}`;
    if (!this.exclusive.has(key)) {
      const found = this.run.steps.some((s) => {
        const entry = s.heap[ref];
        if (!entry) return false;
        return s.frames.some((f) => {
          const v = f.vars.find(([n]) => n === hiName)?.[1];
          return v?.t === 'int' && Number(v.r) === entry.items.length;
        });
      });
      this.exclusive.set(key, found);
    }
    return this.exclusive.get(key);
  }

  // ---------------------------------------------------------------- variables, appels, narration

  renderVariables(step) {
    const box = this.els.variables;
    box.textContent = '';
    const frames = step.frames;
    const top = frames[frames.length - 1];
    const mod = frames[0];
    const assigned = new Set(step.events.filter((e) => e.type === 'assign').map((e) => e.name));
    const compared = new Set(
      step.events.filter((e) => e.type === 'compare').flatMap((e) => e.operands.filter((o) => o?.name).map((o) => o.name)),
    );
    const groups = top === mod ? [[top, null]] : [[top, `dans ${top.name}()`], [mod, 'variables globales']];
    let shown = 0;
    for (const [frame, title] of groups) {
      const scalars = frame.vars.filter(([, v]) => v.t !== 'list');
      if (!scalars.length) continue;
      const isTop = frame === top;
      const owns = (name) => isTop || !top.vars.some(([n]) => n === name);
      const chips = scalars.map(([name, v]) => {
        const classes = ['var'];
        if (assigned.has(name) && owns(name)) classes.push('is-changed');
        if (compared.has(name) && owns(name)) classes.push('is-compared');
        return h(
          'div',
          { class: classes.join(' '), title: `${name} = ${v.r} (${v.t})` },
          h('span', { class: 'vname' }, name),
          h('span', { class: 'veq' }, '='),
          h('span', { class: 'vval' }, v.r),
        );
      });
      shown += chips.length;
      box.append(h('div', { class: isTop ? 'var-group' : 'var-group is-outer' }, title ? h('span', { class: 'group-title' }, title) : null, chips));
    }
    if (!shown) box.append(h('p', { class: 'empty' }, 'Aucune variable (hors listes) pour l’instant.'));
  }

  renderStack(step) {
    const box = this.els.stack;
    const frames = step.frames;
    box.hidden = !this.hasCalls;
    if (box.hidden) return;
    box.textContent = '';
    box.append(
      h('span', { class: 'group-title' }, 'Appels en cours'),
      ...frames.map((f, i) => h('span', { class: i === frames.length - 1 ? 'frame is-top' : 'frame' }, i === 0 ? 'programme' : `${f.name}()`)),
    );
  }

  renderNarration(step) {
    const list = this.els.narration;
    list.textContent = '';
    for (const item of narrate(step, this.lines)) {
      const li = h('li', { class: item.tone ?? null });
      if (item.src === undefined) li.append(h('span', { class: 'ntext' }, item.text));
      else {
        // condition évaluée : « x > m ⟶ 12 > 4 : True », avec le booléen surligné
        // (les espaces entre les morceaux servent au copier-coller et aux lecteurs d'écran)
        li.append(h('span', { class: 'nsrc' }, item.src), ' ');
        if (item.values) li.append(h('span', { class: 'nvals' }, `⟶ ${item.values}`), ' ');
        li.append(
          h('span', { class: 'ncolon' }, ':'),
          ' ',
          h('mark', { class: item.bool ? 'bool is-true' : 'bool is-false' }, item.bool ? 'True' : 'False'),
        );
      }
      list.append(li);
    }
  }

  renderError(step) {
    const box = this.els.error;
    box.hidden = step.kind !== 'error';
    if (box.hidden) return;
    box.textContent = '';
    box.append(...describeError(step.error));
  }

  renderOutput(step, prev) {
    const pre = this.els.output;
    const all = this.run.output;
    const end = step.out;
    const start = prev ? Math.min(prev.out, end) : end;
    pre.textContent = '';
    if (end === 0) {
      pre.append(h('span', { class: 'muted' }, 'Rien n’a encore été affiché.'));
      return;
    }
    pre.append(all.slice(0, start));
    if (end > start) pre.append(h('mark', {}, all.slice(start, end)));
    pre.scrollTop = pre.scrollHeight;
  }

  // ---------------------------------------------------------------- mouvements

  animateMoves(step) {
    for (const e of step.events) {
      if (e.type === 'swap' && e.i !== e.j) {
        this.fly(e.ref, e.j, e.i, -1);
        this.fly(e.ref, e.i, e.j, 1);
      } else if (e.type === 'write' && e.from !== null && e.from !== e.index) {
        this.fly(e.ref, e.from, e.index, -1);
      } else if (e.type === 'mutate' && (e.method === 'append' || e.method === 'insert')) {
        this.cell(e.ref, e.index)
          ?.querySelector('.val')
          ?.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
            duration: this.moveDuration,
            easing: 'cubic-bezier(.2,.8,.2,1.2)',
          });
      }
    }
  }

  cell(ref, index) {
    return this.els.structures.querySelector(`.array[data-ref="${ref}"] .cell[data-index="${index}"]`);
  }

  /** La valeur arrivée dans la case `to` part visuellement de la case `from`. */
  fly(ref, from, to, direction) {
    const a = this.cell(ref, from);
    const b = this.cell(ref, to);
    const val = b?.querySelector('.val');
    if (!a || !val || !val.animate) return;
    const dx = a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    val.animate(
      [
        { transform: `translate(${dx}px, 0)` },
        { transform: `translate(${dx / 2}px, ${direction * 12}px)`, offset: 0.5 },
        { transform: 'translate(0, 0)' },
      ],
      { duration: this.moveDuration, easing: 'ease-in-out' },
    );
  }
}
