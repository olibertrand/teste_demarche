// Point d'entrée de l'application : relie l'éditeur, l'interpréteur, la scène et le lecteur.
import { run } from '../python/interpreter.js';
import { h, prefersReducedMotion } from './dom.js';
import { CodeView, Editor } from './editor.js';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples.js';
import { Player } from './player.js';
import { Stage, describeError } from './stage.js';

const $ = (id) => document.getElementById(id);

// Préférences de chaque visiteur (brouillon, vitesse) : le stockage peut être indisponible.
const store = {
  get(key) {
    try {
      return localStorage.getItem(`demarche:${key}`);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`demarche:${key}`, value);
    } catch {
      // stockage indisponible (navigation privée…) : tant pis, rien d'essentiel n'est perdu
    }
  },
};

// Curseur de vitesse 0…100 → de 0,5 à 12 étapes par seconde (échelle logarithmique).
const stepsPerSecond = (v) => 0.5 * 24 ** (v / 100);

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
};

/** Étape « parlante » pour l'ouverture : la première où un élément de liste est visité ou comparé. */
function firstInterestingStep(result) {
  const k = result.steps.findIndex((s) => s.events.some((e) => e.type === 'iter' || e.type === 'compare'));
  return k > 0 ? k : 0;
}

function start() {
  document.documentElement.lang = 'fr';
  const select = $('example');
  const inputs = $('inputs');
  let current = null;
  let mode = 'edit';

  const stage = new Stage({
    phrase: $('phrase'),
    phraseText: $('phrase').querySelector('.phrase'),
    structures: $('structures'),
    variables: $('variables'),
    stack: $('stack'),
    narration: $('narration'),
    error: $('error'),
    output: $('output'),
  });
  const codeView = new CodeView($('code-view'));
  const editor = new Editor($('editor'), { onChange: onEdit, onRun: () => execute() });

  const player = new Player({
    onShow(k) {
      const step = current.steps[k];
      stage.render(k);
      codeView.setCurrent(step.line, step.kind);
      $('scrub').value = String(k);
      $('counter').textContent = `Étape ${k + 1} / ${current.steps.length}` + (step.line ? ` · ligne ${step.line}` : '');
    },
    onState: updateControls,
  });

  // ---------------------------------------------------------------- exemples

  const custom = h('option', { value: '' }, 'Mon programme');
  select.append(custom);
  const groups = new Map();
  for (const ex of EXAMPLES) {
    if (!groups.has(ex.group)) {
      const group = h('optgroup', { label: ex.group });
      groups.set(ex.group, group);
      select.append(group);
    }
    groups.get(ex.group).append(h('option', { value: ex.id }, ex.title));
  }

  function loadCode(code, id) {
    editor.value = code;
    select.value = id ?? '';
    updateInputsBox();
  }

  function chooseExample(id, { autoplay = true } = {}) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    loadCode(ex.code, ex.id);
    store.set('code', ex.code);
    try {
      history.replaceState(null, '', `#${ex.id}`);
    } catch {
      // l'adresse ne peut pas être modifiée ici : sans conséquence
    }
    execute({ autoplay });
  }

  select.addEventListener('change', () => {
    if (select.value) chooseExample(select.value);
  });
  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== select.value) chooseExample(id);
  });

  // ---------------------------------------------------------------- édition et exécution

  function updateInputsBox() {
    $('inputs-box').hidden = !/\binput\s*\(/.test(editor.value);
  }

  function setMode(m) {
    mode = m;
    $('editor').hidden = m !== 'edit';
    $('code-view').hidden = m !== 'run';
    $('edit').hidden = m !== 'run';
    document.body.dataset.mode = m;
  }

  function setStale(stale) {
    $('stale').hidden = !stale;
    document.body.toggleAttribute('data-stale', stale);
    if (stale) player.pause();
    updateControls();
  }

  function onEdit(value) {
    store.set('code', value);
    const ex = EXAMPLES.find((e) => e.id === select.value);
    if (ex && ex.code !== value) select.value = '';
    updateInputsBox();
    $('syntax-error').hidden = true;
    if (current) setStale(true);
  }

  function execute({ autoplay = true, startAt = () => 0 } = {}) {
    const source = editor.value;
    const lines = inputs.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const result = run(source, { inputs: lines });
    const syntaxBox = $('syntax-error');
    syntaxBox.hidden = true;
    if (result.phase === 'syntax') {
      setMode('edit');
      syntaxBox.textContent = '';
      syntaxBox.append(...describeError(result.error));
      syntaxBox.hidden = false;
      if (result.error.line) editor.focusLine(result.error.line);
      if (current) setStale(true);
      else $('structures').replaceChildren(h('p', { class: 'empty' }, 'L’animation apparaîtra dès que le programme pourra s’exécuter.'));
      return;
    }
    current = result;
    stage.load(result, source);
    codeView.render(source);
    setMode('run');
    setStale(false);
    $('scrub').max = String(result.steps.length - 1);
    player.load(result.steps.length, startAt(result));
    if (autoplay && !prefersReducedMotion()) player.play();
  }

  $('run').addEventListener('click', () => execute());
  $('edit').addEventListener('click', () => {
    player.pause();
    setMode('edit');
    editor.textarea.focus();
  });
  $('code-view').addEventListener('dblclick', (e) => {
    const line = Number(e.target.closest('.ln')?.dataset.line);
    player.pause();
    setMode('edit');
    if (line) editor.focusLine(line);
  });

  // ---------------------------------------------------------------- lecteur

  function updateControls() {
    const ready = Boolean(current) && $('stale').hidden;
    const playButton = $('play');
    for (const id of ['first', 'prev', 'next', 'last', 'scrub']) $(id).disabled = !ready;
    playButton.disabled = !ready || player.count < 2;
    if (ready) {
      $('first').disabled = $('prev').disabled = player.index === 0;
      $('next').disabled = $('last').disabled = player.atEnd;
    }
    playButton.innerHTML = player.playing ? ICONS.pause : ICONS.play;
    const label = player.playing ? 'Pause' : 'Lecture';
    playButton.setAttribute('aria-label', label);
    playButton.title = `${label} (Espace)`;
    playButton.classList.toggle('is-playing', player.playing);
  }

  $('first').addEventListener('click', () => player.step(-Infinity));
  $('prev').addEventListener('click', () => player.step(-1));
  $('play').addEventListener('click', () => player.toggle());
  $('next').addEventListener('click', () => player.step(1));
  $('last').addEventListener('click', () => player.step(Infinity));
  $('scrub').addEventListener('input', (e) => {
    player.pause();
    player.show(Number(e.target.value));
  });

  const speed = $('speed');
  const applySpeed = () => {
    const delay = 1000 / stepsPerSecond(Number(speed.value));
    player.setDelay(delay);
    stage.moveDuration = Math.min(450, delay * 0.8);
    speed.setAttribute('aria-valuetext', `${stepsPerSecond(Number(speed.value)).toFixed(1).replace('.', ',')} étapes par seconde`);
  };
  speed.value = store.get('speed') ?? speed.value;
  applySpeed();
  speed.addEventListener('input', () => {
    applySpeed();
    store.set('speed', speed.value);
  });

  document.addEventListener('keydown', (e) => {
    if (mode !== 'run' || !current || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('textarea, input:not([type="range"]), select')) return;
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return; // le bouton fait déjà son travail
    const actions = {
      ' ': () => player.toggle(),
      ArrowRight: () => player.step(1),
      ArrowLeft: () => player.step(-1),
      Home: () => player.step(-Infinity),
      End: () => player.step(Infinity),
    };
    const action = actions[e.key];
    if (!action) return;
    if (e.target.type === 'range' && e.key !== ' ') return; // les flèches gardent leur rôle sur un curseur
    e.preventDefault();
    action();
  });

  // ---------------------------------------------------------------- ouverture

  const fromHash = EXAMPLES.find((e) => e.id === decodeURIComponent(location.hash.slice(1)));
  const saved = store.get('code');
  if (fromHash) loadCode(fromHash.code, fromHash.id);
  else if (saved && saved.trim()) loadCode(saved, EXAMPLES.find((e) => e.code === saved)?.id ?? '');
  else loadCode(EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE).code, DEFAULT_EXAMPLE);
  execute({ autoplay: false, startAt: firstInterestingStep });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
