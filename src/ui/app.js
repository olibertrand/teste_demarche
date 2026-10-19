// Point d'entrée de l'application : relie l'écriture (démarche en français ou Python),
// la traduction, l'interpréteur, la scène et le lecteur pas à pas.
import { run } from '../python/interpreter.js';
import { assemble } from '../translate/assemble.js';
import {
  PERMANENT_ERRORS, askClaude, errorMessage, getSample, rememberAnswer, rememberedAnswer,
} from '../translate/claude.js';
import { MAX_DEMARCHE_LINES } from '../translate/prompt.js';
import { h } from './dom.js';
import { CodeView, Editor, plainLines } from './editor.js';
import { DEFAULT_DEMARCHE, DEFAULT_EXAMPLE, DEMARCHE_EXAMPLES, EXAMPLES } from './examples.js';
import { HAND_FONTS, applyHandFont } from './handwriting.js';
import { Player } from './player.js';
import { Stage, describeError } from './stage.js';

const $ = (id) => document.getElementById(id);

// Brouillons et onglet de chaque visiteur : le stockage peut être indisponible.
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

const TEXTS = {
  demarche: {
    run: 'Traduire et exécuter',
    custom: 'Ma démarche',
    stale: 'La démarche a changé : clique sur « Traduire et exécuter » pour mettre l’animation à jour.',
    empty: 'Écris ta démarche, puis clique sur « Traduire et exécuter » : l’animation apparaîtra ici.',
  },
  python: {
    run: 'Exécuter',
    custom: 'Mon programme',
    stale: 'Le programme a changé : clique sur « Exécuter » pour mettre l’animation à jour.',
    empty: 'L’animation apparaîtra dès que le programme pourra s’exécuter.',
  },
};

/** Sélectionne une ligne d'une zone de texte et la fait apparaître. */
function selectLine(textarea, line) {
  const lines = textarea.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 24;
  textarea.scrollTop = Math.max(0, (line - 3) * lineHeight);
}

function start() {
  document.documentElement.lang = 'fr';
  const select = $('example');
  const demarcheInput = $('demarche');
  const inputs = $('inputs');

  // Deux espaces de travail indépendants, chacun avec sa dernière exécution et son étape.
  const spaces = {
    demarche: { result: null, source: '', index: 0, mode: 'edit', stale: false, exampleId: null, translation: null, text: '' },
    python: { result: null, source: '', index: 0, mode: 'edit', stale: false, exampleId: null },
  };
  let tab = 'python';
  const space = () => spaces[tab];
  let sampleAvailable = null; // inconnu tant que claude.ai n'a pas répondu
  let translating = null; // AbortController de la traduction en cours
  let translatingTimer = null;
  let failedText = null; // démarche dont la dernière traduction était inutilisable

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
  const translationView = new CodeView($('translation-view'));
  const demarcheView = new CodeView($('demarche-view'), { format: plainLines });
  const editor = new Editor($('editor'), {
    onChange: onPythonEdit,
    onRun: () => {
      executePython();
      focusNext();
    },
  });

  const player = new Player({
    onShow(k) {
      const sp = space();
      sp.index = k;
      const step = sp.result.steps[k];
      stage.render(k);
      if (tab === 'python') codeView.setCurrent(step.line, step.kind);
      else {
        translationView.setCurrent(step.line, step.kind);
        demarcheView.setCurrent(step.line ? (sp.translation.map[step.line - 1] ?? null) : null, step.kind);
      }
      $('counter').textContent = `Étape ${k + 1} / ${sp.result.steps.length}` + (step.line ? ` · ligne ${step.line}` : '');
    },
    onState: updateControls,
  });

  // ---------------------------------------------------------------- exemples

  const custom = h('option', { value: '' }, TEXTS.python.custom);
  select.append(custom);
  const demarcheGroup = h('optgroup', { label: 'Démarches en français' });
  for (const ex of DEMARCHE_EXAMPLES) demarcheGroup.append(h('option', { value: ex.id }, ex.title));
  select.append(demarcheGroup);
  const groups = new Map();
  for (const ex of EXAMPLES) {
    if (!groups.has(ex.group)) {
      const group = h('optgroup', { label: `Python · ${ex.group}` });
      groups.set(ex.group, group);
      select.append(group);
    }
    groups.get(ex.group).append(h('option', { value: ex.id }, ex.title));
  }

  function chooseExample(id) {
    const demarche = DEMARCHE_EXAMPLES.find((e) => e.id === id);
    const program = demarche ? null : EXAMPLES.find((e) => e.id === id);
    if (!demarche && !program) return;
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      // l'adresse ne peut pas être modifiée ici : sans conséquence
    }
    if (demarche) {
      demarcheInput.value = demarche.text;
      store.set('demarche', demarche.text);
      Object.assign(spaces.demarche, { result: null, translation: null, mode: 'edit', stale: false, exampleId: id });
      hideTranslateError();
      openTab('demarche');
      // une démarche déjà traduite s'affiche tout de suite ; sinon on attend « Traduire et exécuter »
      if (rememberedAnswer(cleanText(demarche.text))) translateAndRun();
    } else {
      editor.value = program.code;
      store.set('code', program.code);
      spaces.python.exampleId = id;
      updateInputsBox();
      tab = 'python';
      executePython();
    }
  }

  select.addEventListener('change', () => {
    if (!select.value) return;
    chooseExample(select.value);
    focusNext();
  });
  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== select.value) chooseExample(id);
  });

  // ---------------------------------------------------------------- onglets et affichage

  function openTab(name) {
    tab = name;
    store.set('onglet', name);
    showSpace();
  }

  /** Affiche l'onglet actif : sa zone d'écriture, et sa dernière exécution sur la scène. */
  function showSpace() {
    const sp = space();
    for (const name of ['demarche', 'python']) {
      $(`${name}-pane`).hidden = name !== tab;
      const button = $(`tab-${name}`);
      button.setAttribute('aria-selected', String(name === tab));
      button.tabIndex = name === tab ? 0 : -1;
    }
    $('run-label').textContent = TEXTS[tab].run;
    $('run').title = `${TEXTS[tab].run} (Ctrl + Entrée)`;
    custom.textContent = TEXTS[tab].custom;
    select.value = sp.exampleId ?? '';
    applyMode();
    $('stale').textContent = TEXTS[tab].stale;
    $('stale').hidden = !sp.stale;
    document.body.toggleAttribute('data-stale', sp.stale);
    if (sp.result) {
      stage.load(sp.result, sp.source, tab === 'demarche' ? { phraseOf: demarchePhrases(sp) } : {});
      player.load(sp.result.steps.length, sp.index);
    } else {
      stage.clear(TEXTS[tab].empty);
      $('counter').textContent = '';
      player.reset();
    }
    updateControls();
  }

  function applyMode() {
    const sp = space();
    const running = sp.mode === 'run';
    if (tab === 'python') {
      $('editor').hidden = running;
      $('code-view').hidden = !running;
    } else {
      demarcheInput.hidden = running;
      $('demarche-view').hidden = !running;
      $('translation').hidden = !running || !sp.translation;
    }
    $('edit').hidden = !running;
    document.body.dataset.mode = sp.mode;
  }

  function setMode(m) {
    space().mode = m;
    applyMode();
  }

  function markStale(sp) {
    if (!sp.result || sp.stale) return;
    sp.stale = true;
    if (sp === space()) {
      $('stale').hidden = false;
      document.body.toggleAttribute('data-stale', true);
      updateControls();
    }
  }

  // la phrase de la démarche traduite par une ligne du programme
  function demarchePhrases(sp) {
    const lines = sp.text.split('\n');
    return (line) => {
      const n = line ? sp.translation.map[line - 1] : null;
      return n ? lines[n - 1].trim() : null;
    };
  }

  function focusNext() {
    (space().mode === 'run' ? $('step') : $('run')).focus({ preventScroll: true });
  }

  $('tab-demarche').addEventListener('click', () => openTab('demarche'));
  $('tab-python').addEventListener('click', () => openTab('python'));
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const other = tab === 'demarche' ? 'python' : 'demarche';
    openTab(other);
    $(`tab-${other}`).focus();
  });

  // ---------------------------------------------------------------- Python

  function updateInputsBox() {
    $('inputs-box').hidden = !/\binput\s*\(/.test(editor.value);
  }

  function inputLines() {
    const lines = inputs.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  function onPythonEdit(value) {
    store.set('code', value);
    const ex = EXAMPLES.find((e) => e.id === spaces.python.exampleId);
    if (ex && ex.code !== value) {
      spaces.python.exampleId = null;
      select.value = '';
    }
    updateInputsBox();
    $('syntax-error').hidden = true;
    markStale(spaces.python);
  }

  function executePython() {
    const sp = spaces.python;
    const source = editor.value;
    const result = run(source, { inputs: inputLines() });
    const box = $('syntax-error');
    box.hidden = true;
    if (result.phase === 'syntax') {
      sp.mode = 'edit';
      if (sp.result) sp.stale = true;
      if (tab === 'python') showSpace();
      box.replaceChildren(...describeError(result.error));
      box.hidden = false;
      if (tab === 'python' && result.error.line) editor.focusLine(result.error.line);
      return;
    }
    Object.assign(sp, { result, source, index: 0, mode: 'run', stale: false });
    codeView.render(source);
    if (tab === 'python') showSpace();
  }

  $('code-view').addEventListener('dblclick', (e) => {
    const line = Number(e.target.closest('.ln')?.dataset.line);
    setMode('edit');
    if (line) editor.focusLine(line);
  });

  // ---------------------------------------------------------------- démarche et traduction

  const cleanText = (text) => text.replace(/\s+$/, '');

  demarcheInput.addEventListener('input', () => {
    const value = demarcheInput.value;
    store.set('demarche', value);
    const ex = DEMARCHE_EXAMPLES.find((e) => e.id === spaces.demarche.exampleId);
    if (ex && ex.text !== value) {
      spaces.demarche.exampleId = null;
      select.value = '';
    }
    hideTranslateError();
    markStale(spaces.demarche);
  });
  demarcheInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      translateAndRun();
    }
  });

  function showTranslateError(message, { retry = false } = {}) {
    const box = $('translate-error');
    box.replaceChildren(h('p', {}, message));
    if (retry) {
      box.append(
        h('p', { class: 'retry' }, h('button', { class: 'btn small', type: 'button', onclick: () => translateAndRun({ refresh: true }) }, 'Réessayer')),
      );
    }
    box.hidden = false;
  }

  function hideTranslateError() {
    $('translate-error').hidden = true;
  }

  function markUnavailable(message) {
    sampleAvailable = false;
    const notice = $('translate-unavailable');
    if (message) notice.textContent = message;
    notice.hidden = false;
    updateControls();
  }

  function setTranslating(on) {
    $('translating').hidden = !on;
    demarcheInput.readOnly = on;
    clearInterval(translatingTimer);
    if (on) {
      const t0 = Date.now();
      const tick = () => {
        const seconds = Math.round((Date.now() - t0) / 1000);
        $('translating-text').textContent = seconds < 2 ? 'Traduction en cours…' : `Traduction en cours… ${seconds} s`;
      };
      tick();
      translatingTimer = setInterval(tick, 1000);
    }
    updateControls();
  }

  async function translateAndRun({ refresh = false } = {}) {
    if (translating) return;
    const text = cleanText(demarcheInput.value);
    hideTranslateError();
    if (!text.trim()) {
      showTranslateError('Écris d’abord ta démarche, une instruction par ligne.');
      return;
    }
    if (text.split('\n').length > MAX_DEMARCHE_LINES) {
      showTranslateError(`La démarche est trop longue : ${MAX_DEMARCHE_LINES} lignes au plus.`);
      return;
    }
    // une traduction inutilisable ne doit pas être resservie par la mémoire de claude.ai
    const fresh = refresh || failedText === text;
    let answer = fresh ? null : rememberedAnswer(text);
    let translation = answer && assemble(answer, text);
    if (!answer) {
      const sample = await getSample();
      if (!sample) {
        markUnavailable();
        return;
      }
      translating = new AbortController();
      setTranslating(true);
      try {
        answer = await askClaude(sample, text, { signal: translating.signal, refresh: fresh });
        translation = assemble(answer, text);
        // défaut de traduction connu : on la redemande une fois, en expliquant le défaut à Claude
        if (translation.feedback) {
          answer = await askClaude(sample, text, { signal: translating.signal, refresh: true, feedback: translation.feedback });
          translation = assemble(answer, text);
        }
      } catch (error) {
        if (PERMANENT_ERRORS.has(error?.code)) markUnavailable(errorMessage(error));
        else showTranslateError(errorMessage(error), { retry: error?.code !== 'cancelled' });
        return;
      } finally {
        translating = null;
        setTranslating(false);
      }
    }
    if (!translation.ok) {
      failedText = text;
      showTranslateError(`${translation.message} Tu peux demander une nouvelle traduction, ou reformuler la démarche.`, { retry: true });
      return;
    }
    failedText = null;
    rememberAnswer(text, answer);
    const sp = spaces.demarche;
    const result = run(translation.python, { inputs: inputLines() });
    Object.assign(sp, { result, source: translation.python, index: 0, mode: 'run', stale: false, translation, text });
    renderTranslation(sp);
    if (tab === 'demarche') {
      showSpace();
      $('step').focus({ preventScroll: true });
    }
  }

  function renderTranslation(sp) {
    const t = sp.translation;
    const lines = sp.text.split('\n');
    demarcheView.render(sp.text);
    translationView.render(t.python);
    const fill = (boxId, listId, items, quote) => {
      $(boxId).hidden = items.length === 0;
      $(listId).replaceChildren(
        ...items.map((item) =>
          h(
            'li',
            {},
            item.line ? h('span', { class: 'note-line' }, `ligne ${item.line}`) : null,
            quote && item.line ? h('q', {}, lines[item.line - 1].trim()) : null,
            h('span', {}, item.text),
          ),
        ),
      );
    };
    fill('hypotheses-box', 'hypotheses', t.hypotheses, false);
    fill('incompris-box', 'incompris', t.incompris, true);
  }

  $('stop').addEventListener('click', () => translating?.abort());
  $('retranslate').addEventListener('click', () => {
    setMode('edit');
    translateAndRun({ refresh: true });
  });
  $('to-python').addEventListener('click', () => {
    const t = spaces.demarche.translation;
    if (!t) return;
    editor.value = t.python;
    store.set('code', t.python);
    spaces.python.exampleId = null;
    updateInputsBox();
    tab = 'python';
    store.set('onglet', tab);
    executePython();
    focusNext();
  });
  $('demarche-view').addEventListener('dblclick', (e) => {
    const line = Number(e.target.closest('.ln')?.dataset.line);
    setMode('edit');
    if (line) selectLine(demarcheInput, line);
  });

  // ---------------------------------------------------------------- exécuter, modifier, pas à pas

  $('run').addEventListener('click', () => {
    if (tab === 'python') {
      executePython();
      focusNext();
    } else translateAndRun();
  });
  $('edit').addEventListener('click', () => {
    setMode('edit');
    (tab === 'python' ? editor.textarea : demarcheInput).focus();
  });

  function updateControls() {
    const sp = space();
    const ready = Boolean(sp.result) && !sp.stale;
    $('prev').disabled = !ready || player.index === 0;
    const step = $('step');
    step.disabled = !ready || player.atEnd;
    step.title =
      ready && player.atEnd
        ? `Fin du programme : clique sur « ${TEXTS[tab].run} » pour recommencer`
        : 'Exécuter la ligne suivante (→ ou Espace)';
    $('run').disabled = Boolean(translating) || (tab === 'demarche' && sampleAvailable === false);
  }

  $('prev').addEventListener('click', () => player.prev());
  $('step').addEventListener('click', () => player.next());

  document.addEventListener('keydown', (e) => {
    if (space().mode !== 'run' || !space().result || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('textarea, input, select, [role="tablist"]')) return;
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return; // le bouton fait déjà son travail
    const move = { ArrowRight: 1, ' ': 1, ArrowLeft: -1 }[e.key];
    if (!move) return;
    e.preventDefault();
    if (space().stale) return;
    if (move > 0) player.next();
    else player.prev();
  });

  // ---------------------------------------------------------------- écriture (choix provisoire)

  const handFont = $('hand-font');
  handFont.append(...HAND_FONTS.map((f) => h('option', { value: f.id, style: `font-family: "${f.family}"` }, f.label)));
  handFont.value = applyHandFont(store.get('ecriture'));
  handFont.addEventListener('change', () => {
    store.set('ecriture', applyHandFont(handFont.value));
    stage.fitPhrase();
  });
  // la taille de la phrase dépend de l'écriture (une fois sa police chargée) et de la largeur de la page
  document.fonts?.addEventListener('loadingdone', () => stage.fitPhrase());
  window.addEventListener('resize', () => stage.fitPhrase());

  // ---------------------------------------------------------------- ouverture

  const savedCode = store.get('code');
  editor.value = savedCode?.trim() ? savedCode : EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE).code;
  spaces.python.exampleId = EXAMPLES.find((e) => e.code === editor.value)?.id ?? null;
  updateInputsBox();
  const savedDemarche = store.get('demarche');
  demarcheInput.value = savedDemarche?.trim() ? savedDemarche : DEMARCHE_EXAMPLES.find((e) => e.id === DEFAULT_DEMARCHE).text;
  spaces.demarche.exampleId = DEMARCHE_EXAMPLES.find((e) => e.text === demarcheInput.value)?.id ?? null;

  // dans claude.ai, on commence par la démarche ; ailleurs, la traduction n'existe pas
  const inClaude = typeof window.claude?.use === 'function';
  const savedTab = store.get('onglet');
  tab = savedTab === 'python' || savedTab === 'demarche' ? savedTab : inClaude ? 'demarche' : 'python';
  executePython();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if ([...EXAMPLES, ...DEMARCHE_EXAMPLES].some((e) => e.id === fromHash)) chooseExample(fromHash);
  else {
    showSpace();
    if (tab === 'demarche' && rememberedAnswer(cleanText(demarcheInput.value))) translateAndRun();
  }

  getSample().then((sample) => {
    sampleAvailable = Boolean(sample);
    if (!sample) markUnavailable();
    updateControls();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
