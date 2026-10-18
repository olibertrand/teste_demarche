// Éditeur du programme (zone de texte avec numéros de ligne) et vue du code pendant l'animation.
import { KEYWORDS } from '../python/tokenizer.js';

const INDENT = '    ';

const BUILTIN_NAMES = new Set([
  'print', 'len', 'range', 'int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'abs', 'min', 'max',
  'sum', 'round', 'sorted', 'reversed', 'enumerate', 'zip', 'input', 'type', 'isinstance', 'map', 'filter',
  'any', 'all', 'chr', 'ord', 'bin', 'hex', 'oct', 'divmod', 'pow', 'format', 'repr',
]);

const TOKEN =
  /("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rRfFuU]{0,2}"(?:\\.|[^"\\\n])*"?|[rRfFuU]{0,2}'(?:\\.|[^'\\\n])*'?|#[^\n]*|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+|[\p{L}_][\p{L}\p{N}_]*|\n|[^\S\n]+|.)/gu;

export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Coloration syntaxique : renvoie le HTML de chaque ligne. */
export function highlight(source) {
  const lines = [''];
  let previousWord = '';
  for (const [token] of source.matchAll(TOKEN)) {
    if (token === '\n') {
      lines.push('');
      continue;
    }
    let cls = null;
    const c = token[0];
    if (c === '#') cls = 'tk-cm';
    else if (/^[rRfFuU]{0,2}["']/.test(token)) cls = 'tk-str';
    else if (/^[\d.]/.test(token) && /\d/.test(token)) cls = 'tk-num';
    else if (/^[\p{L}_]/u.test(token)) {
      if (KEYWORDS.has(token)) cls = 'tk-kw';
      else if (previousWord === 'def') cls = 'tk-def';
      else if (BUILTIN_NAMES.has(token)) cls = 'tk-fn';
    }
    if (!/^\s+$/.test(token)) previousWord = token;
    const parts = token.split('\n');
    parts.forEach((part, k) => {
      if (k > 0) lines.push('');
      const html = escapeHtml(part);
      lines[lines.length - 1] += cls && part ? `<span class="${cls}">${html}</span>` : html;
    });
  }
  return lines;
}

export class Editor {
  constructor(root, { onChange, onRun }) {
    this.root = root;
    this.textarea = root.querySelector('textarea');
    this.gutter = root.querySelector('.gutter');
    this.onChange = onChange;
    this.onRun = onRun;
    this.textarea.addEventListener('input', () => {
      this.updateGutter();
      this.onChange(this.value);
    });
    this.textarea.addEventListener('scroll', () => {
      this.gutter.scrollTop = this.textarea.scrollTop;
    });
    this.textarea.addEventListener('keydown', (e) => this.onKey(e));
  }

  get value() {
    return this.textarea.value;
  }

  set value(text) {
    this.textarea.value = text;
    this.updateGutter();
  }

  updateGutter() {
    const count = this.textarea.value.split('\n').length;
    if (this.lineCount === count) return;
    this.lineCount = count;
    this.gutter.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
  }

  focusLine(line) {
    const lines = this.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    this.textarea.focus({ preventScroll: true });
    this.textarea.setSelectionRange(start, end);
    const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 24;
    this.textarea.scrollTop = Math.max(0, (line - 3) * lineHeight);
  }

  /** Insère du texte en conservant l'historique d'annulation quand c'est possible. */
  insert(text, start = this.textarea.selectionStart, end = this.textarea.selectionEnd) {
    const ta = this.textarea;
    ta.setSelectionRange(start, end);
    if (!(document.execCommand && document.execCommand('insertText', false, text))) {
      ta.setRangeText(text, start, end, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }

  onKey(e) {
    const ta = this.textarea;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.onRun();
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = ta;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    if (e.key === 'Tab') {
      e.preventDefault();
      const blockEnd = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
      const block = value.slice(lineStart, blockEnd === -1 ? value.length : blockEnd);
      if (start === end && !e.shiftKey) {
        this.insert(INDENT.slice((start - lineStart) % 4));
        return;
      }
      const lines = block.split('\n');
      const changed = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,4}/, '') : INDENT + l)).join('\n');
      this.insert(changed, lineStart, lineStart + block.length);
      ta.setSelectionRange(lineStart, lineStart + changed.length);
      return;
    }
    if (e.key === 'Enter' && start === end) {
      e.preventDefault();
      const line = value.slice(lineStart, start);
      let indent = /^ */.exec(line)[0];
      const code = line.replace(/#.*$/, '').trimEnd();
      if (code.endsWith(':')) indent += INDENT;
      else if (/^\s*(return|pass|break|continue)\b/.test(line)) indent = indent.slice(4);
      this.insert('\n' + indent);
      return;
    }
    if (e.key === 'Backspace' && start === end && start > lineStart) {
      const before = value.slice(lineStart, start);
      if (/^ +$/.test(before)) {
        e.preventDefault();
        const remove = before.length % 4 || 4;
        this.insert('', start - remove, start);
      }
    }
  }
}

/** Démarche en français : pas de coloration, chaque ligne telle qu'elle est écrite. */
export const plainLines = (text) => text.split('\n').map(escapeHtml);

export class CodeView {
  /** @param {{format?: (source: string) => string[]}} [options] HTML de chaque ligne (Python coloré par défaut) */
  constructor(root, { format = highlight } = {}) {
    this.root = root;
    this.format = format;
    this.lines = [];
  }

  render(source) {
    this.root.textContent = '';
    const lines = this.format(source);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // dernière ligne vide
    this.lines = lines.map((html, i) => {
      const row = document.createElement('div');
      row.className = 'ln';
      row.dataset.line = String(i + 1);
      row.innerHTML = `<span class="no">${i + 1}</span><span class="src">${html || ' '}</span>`;
      this.root.append(row);
      return row;
    });
    this.current = null;
  }

  setCurrent(line, kind) {
    if (this.current) this.current.classList.remove('is-current', 'is-error', 'is-call');
    const row = line ? this.lines[line - 1] : null;
    this.current = row;
    if (!row) return;
    row.classList.add(kind === 'error' ? 'is-error' : 'is-current');
    if (kind === 'call') row.classList.add('is-call');
    // fait défiler la vue du code seulement (pas la page) ; .code-view est en position: relative
    const top = row.offsetTop;
    const view = this.root;
    if (top < view.scrollTop + 8 || top + row.offsetHeight > view.scrollTop + view.clientHeight - 8) {
      view.scrollTop = Math.max(0, top - view.clientHeight / 3);
    }
  }
}
