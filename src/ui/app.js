// Point d'entrée de l'application : relie l'éditeur, l'interpréteur, la scène et le lecteur.
import { run } from '../python/interpreter.js';
import { h } from './dom.js';
import { CodeView, Editor } from './editor.js';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples.js';
import { Player } from './player.js';
import { Stage, describeError } from './stage.js';

const $ = (id) => document.getElementById(id);

// Brouillon de chaque visiteur : le stockage peut être indisponible.
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
  const editor = new Editor($('editor'), {
    onChange: onEdit,
    onRun: () => {
      execute();
      focusStep();
    },
  });

  const player = new Player({
    onShow(k) {
      const step = current.steps[k];
      stage.render(k);
      codeView.setCurrent(step.line, step.kind);
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

  function chooseExample(id) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    loadCode(ex.code, ex.id);
    store.set('code', ex.code);
    try {
      history.replaceState(null, '', `#${ex.id}`);
    } catch {
      // l'adresse ne peut pas être modifiée ici : sans conséquence
    }
    execute();
  }

  // après « Exécuter » ou le choix d'un exemple, Espace et Entrée font avancer d'un pas
  const focusStep = () => {
    if (mode === 'run') $('step').focus({ preventScroll: true });
  };

  select.addEventListener('change', () => {
    if (!select.value) return;
    chooseExample(select.value);
    focusStep();
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

  function execute() {
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
    player.load(result.steps.length);
  }

  $('run').addEventListener('click', () => {
    execute();
    focusStep();
  });
  $('edit').addEventListener('click', () => {
    setMode('edit');
    editor.textarea.focus();
  });
  $('code-view').addEventListener('dblclick', (e) => {
    const line = Number(e.target.closest('.ln')?.dataset.line);
    setMode('edit');
    if (line) editor.focusLine(line);
  });

  // ---------------------------------------------------------------- pas à pas

  function updateControls() {
    const ready = Boolean(current) && $('stale').hidden;
    const button = $('step');
    button.disabled = !ready || player.atEnd;
    button.title = player.atEnd && ready ? 'Fin du programme : clique sur Exécuter pour recommencer' : 'Exécuter la ligne suivante (→ ou Espace)';
  }

  $('step').addEventListener('click', () => player.next());

  document.addEventListener('keydown', (e) => {
    if (mode !== 'run' || !current || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('textarea, input, select')) return;
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return; // le bouton fait déjà son travail
    if (e.key !== 'ArrowRight' && e.key !== ' ') return;
    e.preventDefault();
    if ($('stale').hidden) player.next();
  });

  // ---------------------------------------------------------------- ouverture

  const fromHash = EXAMPLES.find((e) => e.id === decodeURIComponent(location.hash.slice(1)));
  const saved = store.get('code');
  if (fromHash) loadCode(fromHash.code, fromHash.id);
  else if (saved && saved.trim()) loadCode(saved, EXAMPLES.find((e) => e.code === saved)?.id ?? '');
  else loadCode(EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE).code, DEFAULT_EXAMPLE);
  execute();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
