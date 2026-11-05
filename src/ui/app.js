// Point d'entrée de l'application : relie l'écriture (démarche en français ou Python),
// la traduction, l'interpréteur, la scène et le lecteur pas à pas.
import { run } from '../python/interpreter.js';
import { assemble } from '../translate/assemble.js';
import {
  PERMANENT_ERRORS, askClaude, errorMessage, getSample, rememberAnswer, rememberedAnswer,
} from '../translate/claude.js';
import { MAX_DEMARCHE_LINES } from '../translate/prompt.js';
import { applyAnswer, translatePseudo } from '../translate/pseudo.js';
import { h } from './dom.js';
import { CodeView, Editor, plainLines } from './editor.js';
import { DEFAULT_DEMARCHE, DEFAULT_EXAMPLE, DEMARCHE_EXAMPLES, EXAMPLES } from './examples.js';
import { datedName, saveText } from './files.js';
import { HAND_FONTS, applyHandFont } from './handwriting.js';
import { Player } from './player.js';
import { Stage, describeError } from './stage.js';

const $ = (id) => document.getElementById(id);

// Le fichier autonome sait s'enregistrer lui-même, avec le choix d'exemples du professeur : sa copie
// est prise avant que la page ne change. Ailleurs (page de développement, claude.ai) : null.
const SELF_COPY =
  typeof document !== 'undefined' && document.currentScript?.hasAttribute('data-autonome')
    ? `<!doctype html>\n${document.documentElement.outerHTML}`
    : null;

// la version pour les élèves n'affiche pas le lien du mode professeur : le professeur l'ouvre avec
// #professeur à la fin de l'adresse
const TEACHER_HASH = 'professeur';

/** Réglages enregistrés dans la page par le professeur (<script id="config">). */
function readConfig() {
  try {
    return JSON.parse(document.getElementById('config')?.textContent || '{}');
  } catch {
    return {};
  }
}

// Stockage du navigateur ; il peut être indisponible (navigation privée…) : rien d'essentiel n'est perdu.
function storage(kind) {
  return {
    get(key) {
      try {
        return window[kind].getItem(`demarche:${key}`);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window[kind].setItem(`demarche:${key}`, value);
      } catch {
        // stockage indisponible : tant pis
      }
    },
  };
}

// Le travail en cours (textes, onglet) survit au rechargement de la page, pas à une nouvelle
// ouverture : sur un ordinateur partagé, chacun repart des exemples, et une nouvelle version aussi.
// Pour garder une démarche, on l'enregistre dans un fichier. L'écriture choisie, elle, est gardée.
const store = storage('sessionStorage');
const prefs = storage('localStorage');

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
    demarche: { result: null, source: '', index: 0, mode: 'edit', stale: false, exampleId: null, translation: null, text: '', dismissed: new Set() },
    python: { result: null, source: '', index: 0, mode: 'edit', stale: false, exampleId: null },
  };
  let tab = 'python';
  const space = () => spaces[tab];
  let sampleAvailable = null; // Claude, en secours : seulement dans la version en ligne sur claude.ai
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

  // Réglages du professeur : exemples cachés, leur ordre, ce qui s'affiche à l'ouverture. Une version
  // pour les élèves garde les siens dans la page ; sinon, ceux choisis la dernière fois dans ce
  // navigateur ; sinon, ceux marqués hidden sont cachés, dans l'ordre de examples.js.
  const embedded = readConfig();
  const inFile = Object.keys(embedded).length > 0;
  const config = inFile ? embedded : readSettings();
  const hiddenExamples = new Set(
    Array.isArray(config.hidden) ? config.hidden : [...DEMARCHE_EXAMPLES, ...EXAMPLES].filter((e) => e.hidden).map((e) => e.id),
  );
  let exampleOrder = Array.isArray(config.order) ? config.order : [];
  // ce qui s'affiche à l'ouverture : un exemple, ou '' pour un cahier (ou un éditeur) vide
  const opening = {
    demarche: typeof config.opening?.demarche === 'string' ? config.opening.demarche : DEFAULT_DEMARCHE,
    python: typeof config.opening?.python === 'string' ? config.opening.python : DEFAULT_EXAMPLE,
  };
  const custom = h('option', { value: '' }, TEXTS.python.custom);

  function readSettings() {
    try {
      const saved = JSON.parse(prefs.get('reglages') ?? '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  const settings = () => ({ hidden: [...hiddenExamples], order: exampleOrder, opening });

  // le professeur retrouve ses réglages en rouvrant la page ; une version pour les élèves garde
  // les siens : pour les changer, on l'enregistre de nouveau
  function saveSettings() {
    if (!inFile) prefs.set('reglages', JSON.stringify(settings()));
  }

  /** Les exemples par groupe, dans l'ordre choisi par le professeur (un exemple nouveau vient à la fin de son groupe). */
  function exampleGroups() {
    const rank = (ex, k) => {
      const i = exampleOrder.indexOf(ex.id);
      return i >= 0 ? i : exampleOrder.length + k;
    };
    const sorted = (list) => list.map((ex, k) => [rank(ex, k), ex]).sort((a, b) => a[0] - b[0]).map(([, ex]) => ex);
    const groups = [['Démarches en français', sorted(DEMARCHE_EXAMPLES)]];
    for (const ex of EXAMPLES) {
      const label = `Python · ${ex.group}`;
      if (!groups.some(([l]) => l === label)) groups.push([label, sorted(EXAMPLES.filter((e) => e.group === ex.group))]);
    }
    return groups;
  }

  /** Déplace un exemple d'un cran dans son groupe (delta = -1 : vers le haut). */
  function moveExample(id, delta) {
    const groups = exampleGroups();
    const list = groups.find(([, l]) => l.some((ex) => ex.id === id))[1];
    const k = list.findIndex((ex) => ex.id === id);
    if (k + delta < 0 || k + delta >= list.length) return;
    [list[k], list[k + delta]] = [list[k + delta], list[k]];
    exampleOrder = groups.flatMap(([, l]) => l.map((ex) => ex.id));
  }

  /** Le menu des exemples : seulement ceux que le professeur montre aux élèves. */
  function fillExamples() {
    select.replaceChildren(
      custom,
      ...exampleGroups()
        .map(([label, list]) => [label, list.filter((e) => !hiddenExamples.has(e.id))])
        .filter(([, list]) => list.length)
        .map(([label, list]) => h('optgroup', { label }, list.map((e) => h('option', { value: e.id }, e.title)))),
    );
    showExampleChoice();
  }

  // l'exemple en cours dans le menu, ou « Ma démarche » s'il n'y est pas (modifié, ou caché)
  function showExampleChoice() {
    const id = spaces[tab].exampleId;
    select.value = id && [...select.options].some((o) => o.value === id) ? id : '';
  }

  fillExamples();

  /** @param {{atStartup?: boolean}} [options] à l'ouverture de la page, l'onglet Python garde son programme */
  function chooseExample(id, { atStartup = false } = {}) {
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
      spaces.demarche.dismissed.clear();
      hideTranslateError();
      hideQuestion();
      openTab('demarche');
      // à l'ouverture de la page, une éventuelle question attend « Traduire et exécuter »
      translateAndRun({ toPython: !atStartup, silent: atStartup });
    } else {
      editor.value = program.code;
      store.set('code', program.code);
      spaces.python.exampleId = id;
      updateInputsBox();
      tab = 'python';
      executePython();
    }
  }

  // le texte n'est plus celui de l'exemple : l'adresse ne doit plus le rouvrir au rechargement
  function forgetExampleInAddress() {
    try {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // l'adresse ne peut pas être modifiée ici : sans conséquence
    }
  }

  select.addEventListener('change', () => {
    if (!select.value) return;
    chooseExample(select.value);
    focusNext();
  });
  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === TEACHER_HASH) openTeacher();
    else if (id && id !== select.value) chooseExample(id);
  });

  // ---------------------------------------------------------------- onglets et affichage

  function openTab(name) {
    // les deux onglets montrent la même exécution (la traduction de la démarche) : même étape
    const shared = spaces.demarche.result && spaces.demarche.result === spaces.python.result;
    if (shared && name !== tab) spaces[name].index = spaces[tab].index;
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
    showExampleChoice();
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
    // une question attend sa réponse : le clavier va à la première réponse proposée
    const answer = $('question').hidden ? null : $('question').querySelector('button, input');
    (answer ?? (space().mode === 'run' ? $('step') : $('run'))).focus({ preventScroll: true });
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
      forgetExampleInAddress();
    }
    updateInputsBox();
    $('syntax-error').hidden = true;
    markStale(spaces.python);
  }

  function executePython() {
    const sp = spaces.python;
    const source = editor.value;
    const box = $('syntax-error');
    box.hidden = true;
    // un éditeur vide (choisi à l'ouverture, ou effacé) : rien à animer
    if (!source.trim()) {
      Object.assign(sp, { result: null, source: '', index: 0, mode: 'edit', stale: false });
      if (tab === 'python') showSpace();
      return;
    }
    const result = run(source, { inputs: inputLines() });
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
      forgetExampleInAddress();
    }
    hideTranslateError();
    // une question posée sur l'ancien texte n'a plus de sens
    hideQuestion();
    spaces.demarche.dismissed.clear();
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
        h('p', { class: 'retry' }, h('button', { class: 'btn small', type: 'button', onclick: () => translateWithClaude({ refresh: true }) }, 'Réessayer')),
      );
    }
    box.hidden = false;
  }

  function hideTranslateError() {
    $('translate-error').hidden = true;
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

  /**
   * Traduit la démarche (sans IA), puis l'anime. S'il manque une information, une question
   * s'affiche ; une phrase non comprise est signalée.
   * @param {{toPython?: boolean, silent?: boolean}} [options] toPython : l'onglet Python reçoit la
   *   traduction (pas à l'ouverture de la page, où il garde ce que l'élève y avait laissé) ;
   *   silent : à l'ouverture de la page, ni question ni message
   */
  function translateAndRun({ toPython = true, silent = false } = {}) {
    if (translating) return;
    const text = cleanText(demarcheInput.value);
    hideTranslateError();
    hideQuestion();
    if (!text.trim()) {
      if (!silent) showTranslateError('Écris d’abord ta démarche, une instruction par ligne.');
      return;
    }
    if (text.split('\n').length > MAX_DEMARCHE_LINES) {
      if (!silent) showTranslateError(`La démarche est trop longue : ${MAX_DEMARCHE_LINES} lignes au plus.`);
      return;
    }
    const translation = translatePseudo(text, { dismissed: spaces.demarche.dismissed });
    if (!translation.ok) {
      if (silent) return;
      setMode('edit');
      if (translation.question) showQuestion(translation.question, text);
      else showNotUnderstood(translation);
      return;
    }
    showTranslation({ ...translation, source: 'regles' }, text, { toPython });
  }

  /** Exécute la traduction et l'anime ; l'onglet Python la reçoit aussi. */
  function showTranslation(translation, text, { toPython = true } = {}) {
    const sp = spaces.demarche;
    const result = run(translation.python, { inputs: inputLines() });
    Object.assign(sp, { result, source: translation.python, index: 0, mode: 'run', stale: false, translation, text });
    if (toPython || editor.value === translation.python) translationToPython();
    renderTranslation(sp);
    if (tab === 'demarche') {
      showSpace();
      $('step').focus({ preventScroll: true });
    }
  }

  // une phrase non comprise : elle est sélectionnée dans la démarche ; dans claude.ai, Claude peut prendre le relais
  function showNotUnderstood(translation) {
    showTranslateError(translation.message);
    if (sampleAvailable) {
      $('translate-error').append(
        h('p', { class: 'retry' }, h('button', { class: 'btn small', type: 'button', onclick: () => translateWithClaude() }, 'Demander à Claude')),
      );
    }
    const line = translation.incompris[0]?.line;
    if (line) selectLine(demarcheInput, line);
  }

  /** Secours, dans la version en ligne sur claude.ai : Claude traduit la démarche. */
  async function translateWithClaude({ refresh = false } = {}) {
    if (translating) return;
    const text = cleanText(demarcheInput.value);
    hideTranslateError();
    hideQuestion();
    if (!text.trim()) return;
    // une traduction inutilisable ne doit pas être resservie par la mémoire de claude.ai
    const fresh = refresh || failedText === text;
    let answer = fresh ? null : rememberedAnswer(text);
    let translation = answer && assemble(answer, text);
    if (!answer) {
      const sample = await getSample();
      if (!sample) {
        showTranslateError('Claude n’est disponible que dans la version en ligne de l’application, sur claude.ai.');
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
        const permanent = PERMANENT_ERRORS.has(error?.code);
        if (permanent) sampleAvailable = false;
        showTranslateError(errorMessage(error), { retry: !permanent && error?.code !== 'cancelled' });
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
    showTranslation({ ...translation, source: 'claude' }, text);
  }

  // ---------------------------------------------------------------- questions

  /** Une information manque : la question, avec des réponses à cliquer ou à écrire. */
  function showQuestion(q, text) {
    $('question-text').textContent = q.text;
    $('question-error').hidden = true;
    $('question-choices').replaceChildren(
      ...(q.choices ?? []).map((c) => h('button', { class: 'btn small', type: 'button', onclick: () => answerQuestion(q, text, null, c) }, c.label)),
      ...(q.suggestions ?? []).map((s) =>
        h('button', { class: 'btn small suggestion', type: 'button', onclick: () => answerQuestion(q, text, s) }, s),
      ),
    );
    const form = $('question-form');
    const input = $('question-input');
    form.hidden = !q.input;
    input.value = '';
    input.placeholder = q.input === 'name' ? 'ou un autre nom' : 'ou d’autres valeurs';
    form.onsubmit = (e) => {
      e.preventDefault();
      answerQuestion(q, text, input.value);
    };
    $('question').hidden = false;
    $('question-choices').querySelector('button')?.focus({ preventScroll: true });
    $('question').scrollIntoView({ block: 'nearest' });
  }

  function hideQuestion() {
    $('question').hidden = true;
  }

  // la réponse complète la démarche (le texte de l'élève), puis on traduit de nouveau
  function answerQuestion(q, text, value, choice = null) {
    if (choice?.dismiss) {
      spaces.demarche.dismissed.add(q.id);
      translateAndRun();
      return;
    }
    const answer = applyAnswer(text, q, value, choice);
    if (answer.error) {
      $('question-error').textContent = answer.error;
      $('question-error').hidden = false;
      return;
    }
    demarcheInput.value = answer.text;
    store.set('demarche', answer.text);
    const ex = DEMARCHE_EXAMPLES.find((e) => e.id === spaces.demarche.exampleId);
    if (ex && ex.text !== answer.text) {
      spaces.demarche.exampleId = null;
      select.value = '';
      forgetExampleInAddress();
    }
    // le texte complété se signale brièvement
    demarcheInput.classList.remove('is-completed');
    void demarcheInput.offsetWidth;
    demarcheInput.classList.add('is-completed');
    translateAndRun();
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
    $('retranslate').hidden = t.source !== 'claude';
  }

  $('stop').addEventListener('click', () => translating?.abort());
  $('retranslate').addEventListener('click', () => {
    setMode('edit');
    translateWithClaude({ refresh: true });
  });
  /** L'onglet Python reçoit la traduction de la démarche, avec la même exécution, à la même étape. */
  function translationToPython() {
    const sp = spaces.demarche;
    if (spaces.python.exampleId) forgetExampleInAddress();
    editor.value = sp.translation.python;
    store.set('code', sp.translation.python);
    updateInputsBox();
    $('syntax-error').hidden = true;
    Object.assign(spaces.python, { result: sp.result, source: sp.source, index: sp.index, mode: 'run', stale: false, exampleId: null });
    codeView.render(sp.source);
  }

  $('to-python').addEventListener('click', () => {
    if (!spaces.demarche.translation) return;
    translationToPython();
    openTab('python');
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
    $('run').disabled = Boolean(translating);
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

  // ---------------------------------------------------------------- écriture des phrases

  const handFont = $('hand-font');
  handFont.append(...HAND_FONTS.map((f) => h('option', { value: f.id, style: `font-family: "${f.family}"` }, f.label)));
  handFont.value = applyHandFont(prefs.get('ecriture'));
  handFont.addEventListener('change', () => {
    prefs.set('ecriture', applyHandFont(handFont.value));
    stage.fitPhrase();
  });
  // la taille de la phrase dépend de l'écriture (une fois sa police chargée) et de la largeur de la page
  document.fonts?.addEventListener('loadingdone', () => stage.fitPhrase());
  window.addEventListener('resize', () => stage.fitPhrase());

  // ---------------------------------------------------------------- fichiers

  // l'élève enregistre sa démarche (ou son programme) dans un fichier, et la rouvre plus tard
  async function saveCurrent() {
    const python = tab === 'python';
    const text = python ? editor.value : demarcheInput.value;
    const status = $(`${tab}-file-status`);
    status.classList.remove('is-error');
    if (!text.trim()) {
      status.textContent = python ? 'Le programme est vide.' : 'La démarche est vide.';
      return;
    }
    try {
      const saved = await saveText(datedName(python ? 'programme' : 'demarche', python ? 'py' : 'txt'), text.replace(/\s*$/, '\n'));
      status.textContent = saved.status === 'saved' ? `Enregistré : ${saved.filename}` : '';
    } catch (e) {
      status.textContent = e.message;
      status.classList.add('is-error');
    }
  }

  let openTarget = 'demarche';
  for (const name of ['demarche', 'python']) {
    $(`save-${name}`).addEventListener('click', saveCurrent);
    $(`open-${name}`).addEventListener('click', () => {
      openTarget = name;
      $('open-file').value = '';
      $('open-file').click();
    });
  }
  $('open-file').addEventListener('change', async () => {
    const file = $('open-file').files[0];
    if (!file) return;
    const status = $(`${openTarget}-file-status`);
    status.classList.toggle('is-error', file.size > 200_000);
    if (file.size > 200_000) {
      status.textContent = 'Ce fichier est trop gros pour une démarche ou un programme.';
      return;
    }
    const text = (await file.text()).replace(/\r\n?/g, '\n');
    status.textContent = `Ouvert : ${file.name}`;
    spaces[openTarget].exampleId = null;
    forgetExampleInAddress();
    if (openTarget === 'demarche') {
      demarcheInput.value = text;
      store.set('demarche', text);
      spaces.demarche.dismissed.clear();
      markStale(spaces.demarche);
      showExampleChoice();
      setMode('edit');
      translateAndRun();
    } else {
      editor.value = text;
      store.set('code', text);
      updateInputsBox();
      executePython();
      showExampleChoice();
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrent();
    }
  });

  // ---------------------------------------------------------------- mode professeur

  // les exemples montrés aux élèves ; le choix est gardé dans ce navigateur, et dans la version enregistrée pour eux
  function renderTeacherList() {
    // les flèches déplacent l'exemple dans son groupe ; le clavier reste sur la flèche utilisée
    const move = (ex, delta) => {
      moveExample(ex.id, delta);
      saveSettings();
      renderTeacherList();
      fillExamples();
      const buttons = $('teacher-list').querySelectorAll(`[data-id="${ex.id}"] button`);
      const button = buttons[delta < 0 ? 0 : 1];
      (button.disabled ? buttons[delta < 0 ? 1 : 0] : button).focus();
    };
    renderOpening();
    $('teacher-list').replaceChildren(
      ...exampleGroups().map(([label, list]) =>
        h(
          'fieldset',
          { class: 'teacher-group' },
          h('legend', {}, label),
          list.map((ex, k) =>
            h(
              'div',
              { class: 'teacher-row', 'data-id': ex.id },
              h(
                'label',
                { class: 'teacher-item' },
                h('input', {
                  type: 'checkbox',
                  checked: !hiddenExamples.has(ex.id),
                  onchange: (e) => {
                    if (e.target.checked) hiddenExamples.delete(ex.id);
                    else hiddenExamples.add(ex.id);
                    fillExamples();
                    renderOpening();
                    saveSettings();
                  },
                }),
                ex.title,
              ),
              h(
                'span',
                { class: 'teacher-move' },
                h('button', { class: 'btn small', type: 'button', title: 'Monter', 'aria-label': `Monter « ${ex.title} »`, disabled: k === 0, onclick: () => move(ex, -1) }, '↑'),
                h('button', { class: 'btn small', type: 'button', title: 'Descendre', 'aria-label': `Descendre « ${ex.title} »`, disabled: k === list.length - 1, onclick: () => move(ex, 1) }, '↓'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // « À l'ouverture » : un des exemples montrés (ou celui déjà choisi, même caché), ou rien
  function renderOpening() {
    const groups = exampleGroups();
    const fill = (selectEl, kind, empty, lists) => {
      const current = opening[kind];
      selectEl.replaceChildren(
        h('option', { value: '' }, empty),
        ...lists
          .map(([label, list]) => [label, list.filter((ex) => !hiddenExamples.has(ex.id) || ex.id === current)])
          .filter(([, list]) => list.length)
          .map(([label, list]) =>
            h('optgroup', { label }, list.map((ex) => h('option', { value: ex.id }, hiddenExamples.has(ex.id) ? `${ex.title} (caché du menu)` : ex.title))),
          ),
      );
      selectEl.value = current;
    };
    fill($('teacher-open-demarche'), 'demarche', 'Cahier vide : l’élève écrit sa démarche', groups.slice(0, 1));
    fill($('teacher-open-python'), 'python', 'Éditeur vide : l’élève écrit son programme', groups.slice(1));
  }
  $('teacher-open-demarche').addEventListener('change', (e) => {
    opening.demarche = e.target.value;
    saveSettings();
  });
  $('teacher-open-python').addEventListener('change', (e) => {
    opening.python = e.target.value;
    saveSettings();
  });

  // pas de lien vers le mode professeur dans la version pour les élèves, sauf ouverte avec #professeur
  $('teacher-open').hidden = inFile && location.hash !== `#${TEACHER_HASH}`;
  function openTeacher() {
    $('teacher-open').hidden = false;
    renderTeacherList();
    // seul le fichier autonome sait s'enregistrer lui-même
    $('teacher-save').hidden = !SELF_COPY;
    $('teacher-save-help').textContent = inFile
      ? `Cette version pour les élèves garde le choix enregistré avec elle. Pour le changer, modifie-le ici, puis enregistre de nouveau la version pour les élèves. Le lien du mode professeur n’apparaît pas dans cette version : pour revenir ici, ajoute #${TEACHER_HASH} à la fin de l’adresse.`
      : SELF_COPY
        ? `Ton choix est gardé dans ce navigateur. Pour le donner aux élèves, enregistre une version pour eux : c’est ce fichier qu’il faut leur donner. Le lien du mode professeur n’y apparaît pas : pour l’ouvrir, ajoute #${TEACHER_HASH} à la fin de l’adresse.`
        : 'Ton choix est gardé dans ce navigateur. Pour préparer une version pour les élèves, ouvre le fichier autonome demarche.html et refais-y ce choix.';
    $('teacher-status').textContent = '';
    if (!$('teacher').open) $('teacher').showModal();
  }
  $('teacher-open').addEventListener('click', openTeacher);
  $('teacher-all').addEventListener('click', () => {
    hiddenExamples.clear();
    saveSettings();
    renderTeacherList();
    fillExamples();
  });
  $('teacher-order').addEventListener('click', () => {
    exampleOrder = [];
    saveSettings();
    renderTeacherList();
    fillExamples();
  });
  $('teacher-save').addEventListener('click', async () => {
    const json = JSON.stringify(settings()).replace(/</g, '\\u003c');
    const page = SELF_COPY.replace(/(<script type="application\/json" id="config">)[\s\S]*?(<\/script>)/, (_, open, close) => open + json + close);
    const status = $('teacher-status');
    status.classList.remove('is-error');
    try {
      const saved = await saveText('demarche-eleves.html', page);
      status.textContent = saved.status === 'saved' ? `Version pour les élèves enregistrée : ${saved.filename}` : '';
    } catch (e) {
      status.textContent = e.message;
      status.classList.add('is-error');
    }
  });

  // ---------------------------------------------------------------- ouverture

  // les versions précédentes gardaient les brouillons d'une ouverture à l'autre : on les efface
  try {
    for (const key of ['code', 'demarche', 'onglet']) localStorage.removeItem(`demarche:${key}`);
  } catch {
    // stockage indisponible : rien à effacer
  }
  // le choix du professeur pour l'ouverture ; un exemple retiré depuis : celui par défaut
  const openingText = (id, list, fallback, field) => (id === '' ? '' : (list.find((e) => e.id === id) ?? list.find((e) => e.id === fallback))[field]);
  const savedCode = store.get('code');
  editor.value = savedCode?.trim() ? savedCode : openingText(opening.python, EXAMPLES, DEFAULT_EXAMPLE, 'code');
  spaces.python.exampleId = EXAMPLES.find((e) => e.code === editor.value)?.id ?? null;
  updateInputsBox();
  const savedDemarche = store.get('demarche');
  demarcheInput.value = savedDemarche?.trim() ? savedDemarche : openingText(opening.demarche, DEMARCHE_EXAMPLES, DEFAULT_DEMARCHE, 'text');
  spaces.demarche.exampleId = DEMARCHE_EXAMPLES.find((e) => e.text === demarcheInput.value)?.id ?? null;

  const savedTab = store.get('onglet');
  tab = savedTab === 'python' ? 'python' : 'demarche';
  executePython();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if ([...EXAMPLES, ...DEMARCHE_EXAMPLES].some((e) => e.id === fromHash)) chooseExample(fromHash, { atStartup: true });
  else {
    showSpace();
    if (tab === 'demarche') translateAndRun({ toPython: false, silent: true });
  }
  if (fromHash === TEACHER_HASH) openTeacher();

  getSample().then((sample) => {
    sampleAvailable = Boolean(sample);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
