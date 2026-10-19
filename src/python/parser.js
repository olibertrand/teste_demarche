// Analyse syntaxique d'un sous-ensemble de Python (descente récursive).
// Chaque nœud garde sa ligne et sa position dans le texte (start/end), ce qui permet
// de citer l'expression d'origine dans la narration (« L[j] > cle : 7 > 3 → Vrai »).
import { PyError, syntaxError } from './errors.js';
import { tokenize, unescapeFStringText } from './tokenizer.js';

const COMPARE_OPS = new Set(['<', '>', '==', '>=', '<=', '!=']);
const AUG_OPS = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=']);
const LIST_END = new Set(['=', ')', ']', '}', ':', ';', ...AUG_OPS]);

/**
 * @param {string} src
 * @returns {{type: 'Module', body: object[], comments: Map, source: string}}
 */
export function parse(src) {
  const { tokens, comments } = tokenize(src);
  const parser = new Parser(tokens, src);
  return { type: 'Module', body: parser.parseFile(), comments, source: src };
}

const notSupported = (what, line) => new PyError('NotSupported', `${what} n'est pas encore pris en charge`, line);

class Parser {
  constructor(tokens, src) {
    this.tokens = tokens;
    this.src = src;
    this.pos = 0;
    this.lastEnd = 0;
  }

  // ---------------------------------------------------------------- outils

  get tok() {
    return this.tokens[this.pos];
  }
  peek(k = 1) {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)];
  }
  next() {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    this.lastEnd = t.end;
    return t;
  }
  isOp(v, t = this.tok) {
    return t.type === 'OP' && t.value === v;
  }
  isKw(v, t = this.tok) {
    return t.type === 'KEYWORD' && t.value === v;
  }
  acceptOp(v) {
    return this.isOp(v) ? this.next() : null;
  }
  acceptKw(v) {
    return this.isKw(v) ? this.next() : null;
  }
  expectOp(v, message) {
    if (this.isOp(v)) return this.next();
    throw this.error(message ?? `« ${v} » attendu à la place de ${this.describe(this.tok)}`);
  }
  expectName(message) {
    if (this.tok.type === 'NAME') return this.next();
    if (this.tok.type === 'KEYWORD') {
      throw this.error(`« ${this.tok.value} » est un mot réservé de Python : il ne peut pas servir de nom`);
    }
    throw this.error(message);
  }
  error(message, tok = this.tok) {
    return syntaxError(message, tok.line);
  }
  describe(t) {
    switch (t.type) {
      case 'NEWLINE':
        return 'la fin de la ligne';
      case 'EOF':
        return 'la fin du programme';
      case 'INDENT':
        return 'une indentation';
      case 'DEDENT':
        return 'la fin du bloc';
      case 'STRING':
      case 'FSTRING':
        return 'une chaîne de caractères';
      case 'NUMBER':
        return `le nombre ${this.src.slice(t.start, t.end)}`;
      default:
        return `« ${t.value} »`;
    }
  }
  node(type, startTok, props) {
    return { type, line: startTok.line, start: startTok.start, end: this.lastEnd, ...props };
  }

  // ---------------------------------------------------------------- instructions

  parseFile() {
    const body = [];
    while (this.tok.type !== 'EOF') {
      if (this.tok.type === 'NEWLINE') {
        this.next();
        continue;
      }
      if (this.tok.type === 'INDENT') throw this.unexpectedIndent();
      body.push(...this.parseStatement());
    }
    return body;
  }

  unexpectedIndent() {
    return new PyError(
      'IndentationError',
      'indentation inattendue : cette ligne est décalée vers la droite alors qu’aucun bloc ne commence (pas de « : » avant)',
      this.tok.line,
    );
  }

  parseStatement() {
    const t = this.tok;
    if (t.type === 'KEYWORD') {
      switch (t.value) {
        case 'if':
          return [this.parseIf()];
        case 'while':
          return [this.parseWhile()];
        case 'for':
          return [this.parseFor()];
        case 'def':
          return [this.parseDef()];
        case 'elif':
        case 'else':
          throw this.error(`« ${t.value} » sans « if » juste avant, au même niveau d'indentation`);
        case 'class':
          throw notSupported('La définition de classes (class)', t.line);
        case 'try':
        case 'except':
        case 'finally':
          throw notSupported('La gestion des exceptions (try / except)', t.line);
        case 'with':
          throw notSupported('L’instruction with', t.line);
        case 'async':
        case 'await':
          throw notSupported('La programmation asynchrone', t.line);
      }
    }
    return this.parseSimpleStatements();
  }

  parseSimpleStatements() {
    const statements = [this.parseSmallStatement()];
    while (this.acceptOp(';')) {
      if (this.tok.type === 'NEWLINE' || this.tok.type === 'EOF') break;
      statements.push(this.parseSmallStatement());
    }
    if (this.tok.type !== 'NEWLINE' && this.tok.type !== 'EOF') {
      const first = statements[0];
      const isPrint = first.type === 'ExprStmt' && first.value.type === 'Name' && first.value.id === 'print';
      if (isPrint) throw this.error('il manque les parenthèses : écris print(…)');
      throw this.error(
        `${this.describe(this.tok)} inattendu : il manque peut-être un opérateur, une virgule ou une parenthèse`,
      );
    }
    if (this.tok.type === 'NEWLINE') this.next();
    return statements;
  }

  atStatementEnd() {
    const t = this.tok;
    return t.type === 'NEWLINE' || t.type === 'EOF' || this.isOp(';');
  }

  parseSmallStatement() {
    const t = this.tok;
    if (t.type === 'KEYWORD') {
      switch (t.value) {
        case 'pass':
        case 'break':
        case 'continue':
          this.next();
          return this.node(t.value[0].toUpperCase() + t.value.slice(1), t, {});
        case 'return': {
          this.next();
          const value = this.atStatementEnd() ? null : this.parseExprList();
          return this.node('Return', t, { value });
        }
        case 'import':
          return this.parseImport();
        case 'from':
          return this.parseFromImport();
        case 'assert': {
          this.next();
          const test = this.parseExpr();
          const msg = this.acceptOp(',') ? this.parseExpr() : null;
          return this.node('Assert', t, { test, msg });
        }
        case 'global': {
          this.next();
          const names = [this.expectName('nom de variable attendu après global').value];
          while (this.acceptOp(',')) names.push(this.expectName('nom de variable attendu').value);
          return this.node('Global', t, { names });
        }
        case 'del': {
          this.next();
          const target = this.parseExprList();
          const targets = target.type === 'Tuple' ? target.elts : [target];
          for (const tg of targets) {
            if (tg.type !== 'Name' && tg.type !== 'Subscript') throw this.error('on ne peut supprimer (del) qu’une variable ou un élément', t);
          }
          return this.node('Delete', t, { targets });
        }
        case 'nonlocal':
          throw notSupported('L’instruction nonlocal', t.line);
        case 'raise':
          throw notSupported('L’instruction raise', t.line);
        case 'yield':
          throw notSupported('L’instruction yield (générateurs)', t.line);
      }
    }

    const first = this.parseExprList();
    if (this.isOp('=')) {
      const targets = [first];
      while (this.acceptOp('=')) targets.push(this.parseExprList());
      const value = targets.pop();
      for (const target of targets) this.checkTarget(target);
      return this.node('Assign', t, { targets, value });
    }
    if (this.tok.type === 'OP' && AUG_OPS.has(this.tok.value)) {
      const op = this.next().value.slice(0, -1);
      if (first.type !== 'Name' && first.type !== 'Subscript') {
        throw this.error(`à gauche de « ${op}= » il faut une variable ou un élément comme L[i]`, t);
      }
      const value = this.parseExprList();
      return this.node('AugAssign', t, { target: first, op, value });
    }
    if (this.isOp(':') && first.type === 'Name') {
      // annotation de type (x: int = 5) : l'annotation est ignorée
      this.next();
      this.parseExpr();
      const value = this.acceptOp('=') ? this.parseExprList() : null;
      return this.node('AnnAssign', t, { target: first, value });
    }
    // « x == 3 » seul sur sa ligne n'a aucun effet : c'est souvent une affectation mal écrite
    const suspiciousEquality = first.type === 'Compare' && first.ops.length === 1 && first.ops[0] === '==';
    return this.node('ExprStmt', t, { value: first, suspiciousEquality });
  }

  checkTarget(target) {
    switch (target.type) {
      case 'Name':
      case 'Subscript':
        return;
      case 'Tuple':
      case 'List':
        target.elts.forEach((e) => this.checkTarget(e));
        return;
      case 'Attribute':
        throw notSupported('L’affectation d’un attribut', target.line);
    }
    const text = this.src.slice(target.start, target.end);
    let message = `à gauche de « = » il faut une variable (ou un élément comme L[i]), pas « ${text} »`;
    if (target.type === 'Call') message = `on ne peut pas affecter une valeur à un appel de fonction (« ${text} »)`;
    if (target.type === 'Compare') message = 'pour tester une égalité, écris == ; un seul = sert à donner une valeur à une variable';
    throw syntaxError(message, target.line);
  }

  parseImport() {
    const t = this.next();
    const names = [];
    do {
      const name = this.parseDottedName();
      const asname = this.acceptKw('as') ? this.expectName('nom attendu après as').value : null;
      names.push({ name, asname });
    } while (this.acceptOp(','));
    return this.node('Import', t, { names });
  }

  parseFromImport() {
    const t = this.next();
    const module = this.parseDottedName();
    if (!this.acceptKw('import')) throw this.error('« import » attendu (from module import nom)');
    if (this.acceptOp('*')) return this.node('ImportFrom', t, { module, names: '*' });
    const paren = this.acceptOp('(');
    const names = [];
    do {
      if (paren && this.isOp(')')) break;
      const name = this.expectName('nom attendu après import').value;
      const asname = this.acceptKw('as') ? this.expectName('nom attendu après as').value : null;
      names.push({ name, asname });
    } while (this.acceptOp(','));
    if (paren) this.expectOp(')');
    return this.node('ImportFrom', t, { module, names });
  }

  parseDottedName() {
    let name = this.expectName('nom de module attendu').value;
    while (this.acceptOp('.')) name += '.' + this.expectName('nom attendu après « . »').value;
    return name;
  }

  expectColon(keyword) {
    if (this.isOp(':')) return this.next();
    if (this.isOp('=')) {
      throw this.error('pour tester une égalité, écris == ; un seul = sert à donner une valeur à une variable');
    }
    if (keyword === 'else' && this.isKw('if')) throw this.error('« sinon si » s’écrit elif en Python');
    const found = this.tok.type === 'NEWLINE' ? '' : ` (trouvé ${this.describe(this.tok)})`;
    throw this.error(`« : » attendu à la fin de la ligne du ${keyword}${found}`);
  }

  parseBlock(headerLine) {
    if (this.tok.type !== 'NEWLINE') return this.parseSimpleStatements(); // bloc sur une seule ligne
    this.next();
    if (this.tok.type !== 'INDENT') {
      throw new PyError(
        'IndentationError',
        `bloc indenté attendu après le « : » de la ligne ${headerLine} : décale vers la droite les lignes du bloc`,
        this.tok.line,
      );
    }
    this.next();
    const body = [];
    while (this.tok.type !== 'DEDENT' && this.tok.type !== 'EOF') {
      if (this.tok.type === 'INDENT') throw this.unexpectedIndent();
      body.push(...this.parseStatement());
    }
    if (this.tok.type === 'DEDENT') this.next();
    return body;
  }

  parseIf() {
    const t = this.next(); // if ou elif
    const test = this.parseExpr();
    this.expectColon(t.value);
    const header = { line: t.line, start: t.start, end: this.lastEnd };
    const body = this.parseBlock(t.line);
    let orelse = [];
    let elseLine = null;
    if (this.isKw('elif')) {
      orelse = [this.parseIf()];
    } else if (this.isKw('else')) {
      const e = this.next();
      elseLine = e.line;
      this.expectColon('else');
      orelse = this.parseBlock(e.line);
    }
    return { type: 'If', ...header, test, body, orelse, elseLine, isElif: t.value === 'elif' };
  }

  parseWhile() {
    const t = this.next();
    const test = this.parseExpr();
    this.expectColon('while');
    const header = { line: t.line, start: t.start, end: this.lastEnd };
    const body = this.parseBlock(t.line);
    let orelse = [];
    let elseLine = null;
    if (this.isKw('else')) {
      const e = this.next();
      elseLine = e.line;
      this.expectColon('else');
      orelse = this.parseBlock(e.line);
    }
    return { type: 'While', ...header, test, body, orelse, elseLine };
  }

  parseFor() {
    const t = this.next();
    const target = this.parseTargetList();
    if (!this.acceptKw('in')) throw this.error('« in » attendu : une boucle for s’écrit for x in L:');
    const iter = this.parseExprList();
    this.expectColon('for');
    const header = { line: t.line, start: t.start, end: this.lastEnd };
    const body = this.parseBlock(t.line);
    let orelse = [];
    let elseLine = null;
    if (this.isKw('else')) {
      const e = this.next();
      elseLine = e.line;
      this.expectColon('else');
      orelse = this.parseBlock(e.line);
    }
    return { type: 'For', ...header, target, iter, body, orelse, elseLine };
  }

  parseTargetList() {
    const first = this.parseBitOr();
    let target = first;
    if (this.isOp(',')) {
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isKw('in') || this.isOp('=')) break;
        elts.push(this.parseBitOr());
      }
      target = { type: 'Tuple', elts, line: first.line, start: first.start, end: this.lastEnd };
    }
    this.checkTarget(target);
    return target;
  }

  parseParams(closing) {
    const params = [];
    while (!this.isOp(closing)) {
      if (this.isOp('*') || this.isOp('**')) throw notSupported('Les paramètres *args et **kwargs', this.tok.line);
      const name = this.expectName('nom de paramètre attendu').value;
      if (params.some((p) => p.name === name)) throw this.error(`le paramètre « ${name} » apparaît deux fois`);
      if (closing === ')' && this.acceptOp(':')) this.parseExpr(); // annotation ignorée
      const defaultValue = this.acceptOp('=') ? this.parseExpr() : null;
      if (!defaultValue && params.some((p) => p.default)) {
        throw this.error('un paramètre sans valeur par défaut ne peut pas suivre un paramètre qui en a une');
      }
      params.push({ name, default: defaultValue });
      if (!this.acceptOp(',')) break;
    }
    return params;
  }

  parseDef() {
    const t = this.next();
    const name = this.expectName('nom de fonction attendu après def').value;
    this.expectOp('(', '« ( » attendu après le nom de la fonction');
    const params = this.parseParams(')');
    this.expectOp(')', '« ) » attendu à la fin des paramètres');
    if (this.acceptOp('->')) this.parseExpr(); // annotation du résultat, ignorée
    this.expectColon('def');
    const header = { line: t.line, start: t.start, end: this.lastEnd };
    const body = this.parseBlock(t.line);
    const first = body[0];
    const doc = first?.type === 'ExprStmt' && first.value.type === 'Constant' && typeof first.value.value === 'string';
    return { type: 'FunctionDef', ...header, name, params, body, docstring: doc ? first.value.value : null };
  }

  // ---------------------------------------------------------------- expressions

  /** Liste d'expressions séparées par des virgules : un tuple s'il y en a plusieurs. */
  parseExprList() {
    const first = this.parseExpr();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.acceptOp(',')) {
      const t = this.tok;
      if (t.type === 'NEWLINE' || t.type === 'EOF' || (t.type === 'OP' && LIST_END.has(t.value))) break;
      elts.push(this.parseExpr());
    }
    return { type: 'Tuple', elts, line: first.line, start: first.start, end: this.lastEnd };
  }

  parseExpr() {
    if (this.isKw('lambda')) return this.parseLambda();
    const body = this.parseOrTest();
    if (!this.isKw('if')) return body;
    this.next();
    const test = this.parseOrTest();
    if (!this.acceptKw('else')) throw this.error('« else » attendu : une expression conditionnelle s’écrit a if condition else b');
    const orelse = this.parseExpr();
    return { type: 'IfExp', test, body, orelse, line: body.line, start: body.start, end: this.lastEnd };
  }

  parseLambda() {
    const t = this.next();
    const params = this.parseParams(':');
    this.expectOp(':', '« : » attendu après les paramètres de lambda');
    const body = this.parseExpr();
    return this.node('Lambda', t, { params, body });
  }

  parseOrTest() {
    return this.parseBoolOp('or', () => this.parseAndTest());
  }
  parseAndTest() {
    return this.parseBoolOp('and', () => this.parseNotTest());
  }
  parseBoolOp(op, sub) {
    const first = sub();
    if (!this.isKw(op)) return first;
    const values = [first];
    while (this.acceptKw(op)) values.push(sub());
    return { type: 'BoolOp', op, values, line: first.line, start: first.start, end: this.lastEnd };
  }

  parseNotTest() {
    if (this.isKw('not')) {
      const t = this.next();
      const operand = this.parseNotTest();
      return this.node('UnaryOp', t, { op: 'not', operand });
    }
    return this.parseComparison();
  }

  parseComparison() {
    const left = this.parseBitOr();
    const ops = [];
    const comparators = [];
    for (;;) {
      let op;
      if (this.tok.type === 'OP' && COMPARE_OPS.has(this.tok.value)) op = this.next().value;
      else if (this.isKw('in')) {
        this.next();
        op = 'in';
      } else if (this.isKw('not') && this.isKw('in', this.peek())) {
        this.next();
        this.next();
        op = 'not in';
      } else if (this.isKw('is')) {
        this.next();
        op = this.acceptKw('not') ? 'is not' : 'is';
      } else break;
      ops.push(op);
      comparators.push(this.parseBitOr());
    }
    if (ops.length === 0) return left;
    return { type: 'Compare', left, ops, comparators, line: left.line, start: left.start, end: this.lastEnd };
  }

  binaryLevel(ops, sub) {
    let left = sub();
    while (this.tok.type === 'OP' && ops.includes(this.tok.value)) {
      const op = this.next().value;
      const right = sub();
      left = { type: 'BinOp', op, left, right, line: left.line, start: left.start, end: this.lastEnd };
    }
    return left;
  }
  parseBitOr() {
    return this.binaryLevel(['|'], () => this.parseBitXor());
  }
  parseBitXor() {
    return this.binaryLevel(['^'], () => this.parseBitAnd());
  }
  parseBitAnd() {
    return this.binaryLevel(['&'], () => this.parseShift());
  }
  parseShift() {
    return this.binaryLevel(['<<', '>>'], () => this.parseArith());
  }
  parseArith() {
    return this.binaryLevel(['+', '-'], () => this.parseTerm());
  }
  parseTerm() {
    return this.binaryLevel(['*', '/', '//', '%', '@'], () => this.parseFactor());
  }

  parseFactor() {
    const t = this.tok;
    if (t.type === 'OP' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      this.next();
      const operand = this.parseFactor();
      return this.node('UnaryOp', t, { op: t.value, operand });
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (!this.acceptOp('**')) return base;
    const exponent = this.parseFactor();
    return { type: 'BinOp', op: '**', left: base, right: exponent, line: base.line, start: base.start, end: this.lastEnd };
  }

  parsePrimary() {
    let e = this.parseAtom();
    for (;;) {
      if (this.isOp('(')) e = this.parseCall(e);
      else if (this.isOp('[')) e = this.parseSubscript(e);
      else if (this.isOp('.')) {
        this.next();
        const attr = this.expectName('nom de méthode attendu après « . »').value;
        e = { type: 'Attribute', value: e, attr, line: e.line, start: e.start, end: this.lastEnd };
      } else return e;
    }
  }

  parseCall(func) {
    const open = this.next();
    const args = [];
    const keywords = [];
    while (!this.isOp(')')) {
      if (this.isOp('*') || this.isOp('**')) throw notSupported('Le dépaquetage d’arguments (*args)', this.tok.line);
      if (this.tok.type === 'NAME' && this.isOp('=', this.peek())) {
        const arg = this.next().value;
        this.next();
        keywords.push({ arg, value: this.parseExpr() });
      } else {
        if (keywords.length) throw this.error('un argument sans nom ne peut pas suivre un argument nommé (nom=valeur)');
        let e = this.parseExpr();
        if (this.isKw('for')) e = this.parseComprehension(e, 'GeneratorExp', open);
        args.push(e);
      }
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')', `« ) » attendu à la place de ${this.describe(this.tok)} : il manque une parenthèse fermante ou une virgule`);
    return { type: 'Call', func, args, keywords, line: func.line, start: func.start, end: this.lastEnd };
  }

  parseSubscript(value) {
    this.next();
    let slice;
    if (this.isOp(':')) slice = this.parseSliceRest(null);
    else {
      const index = this.parseExprList();
      slice = this.isOp(':') ? this.parseSliceRest(index) : index;
    }
    this.expectOp(']', `« ] » attendu à la place de ${this.describe(this.tok)}`);
    return { type: 'Subscript', value, slice, line: value.line, start: value.start, end: this.lastEnd };
  }

  parseSliceRest(lower) {
    const colon = this.next();
    const upper = this.isOp(']') || this.isOp(':') ? null : this.parseExpr();
    let step = null;
    if (this.acceptOp(':') && !this.isOp(']')) step = this.parseExpr();
    return { type: 'Slice', lower, upper, step, line: colon.line, start: lower?.start ?? colon.start, end: this.lastEnd };
  }

  parseComprehension(elt, type, open) {
    const generators = [];
    while (this.acceptKw('for')) {
      const target = this.parseTargetList();
      if (!this.acceptKw('in')) throw this.error('« in » attendu dans la compréhension (… for x in L)');
      const iter = this.parseOrTest();
      const ifs = [];
      while (this.acceptKw('if')) ifs.push(this.parseOrTest());
      generators.push({ target, iter, ifs });
    }
    return { type, elt, generators, line: open.line, start: open.start, end: this.lastEnd };
  }

  parseAtom() {
    const t = this.tok;
    switch (t.type) {
      case 'NAME':
        this.next();
        return this.node('Name', t, { id: t.value });
      case 'NUMBER':
        this.next();
        return this.node('Constant', t, { value: t.value });
      case 'STRING':
      case 'FSTRING':
        return this.parseStrings();
      case 'KEYWORD': {
        const constants = { True: true, False: false, None: null };
        if (t.value in constants) {
          this.next();
          return this.node('Constant', t, { value: constants[t.value] });
        }
        if (t.value === 'lambda') return this.parseLambda();
        throw this.error(`le mot-clé « ${t.value} » n'a rien à faire ici`);
      }
      case 'OP':
        if (t.value === '(') return this.parseParen();
        if (t.value === '[') return this.parseListDisplay();
        if (t.value === '{') return this.parseBraceDisplay();
        break;
    }
    if (t.type === 'NEWLINE' || t.type === 'EOF') throw this.error('expression incomplète : il manque quelque chose en fin de ligne');
    if (t.type === 'INDENT' || t.type === 'DEDENT') throw this.error('expression incomplète');
    throw this.error(`expression attendue à la place de ${this.describe(t)}`);
  }

  parseParen() {
    const open = this.next();
    if (this.acceptOp(')')) return this.node('Tuple', open, { elts: [] });
    const first = this.parseExpr();
    if (this.isKw('for')) {
      const gen = this.parseComprehension(first, 'GeneratorExp', open);
      this.expectOp(')');
      gen.end = this.lastEnd;
      return gen;
    }
    if (this.isOp(',')) {
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isOp(')')) break;
        elts.push(this.parseExpr());
      }
      this.expectOp(')', `« ) » attendu à la place de ${this.describe(this.tok)}`);
      return this.node('Tuple', open, { elts });
    }
    this.expectOp(')', `« ) » attendu à la place de ${this.describe(this.tok)}`);
    // l'expression entre parenthèses garde ses parenthèses dans son étendue
    return { ...first, start: open.start, end: this.lastEnd };
  }

  parseListDisplay() {
    const open = this.next();
    const elts = [];
    if (!this.isOp(']')) {
      const first = this.parseExpr();
      if (this.isKw('for')) {
        const comp = this.parseComprehension(first, 'ListComp', open);
        this.expectOp(']', `« ] » attendu à la place de ${this.describe(this.tok)}`);
        comp.end = this.lastEnd;
        return comp;
      }
      elts.push(first);
      while (this.acceptOp(',')) {
        if (this.isOp(']')) break;
        elts.push(this.parseExpr());
      }
    }
    this.expectOp(']', `« ] » attendu à la place de ${this.describe(this.tok)} : il manque un crochet fermant ou une virgule`);
    return this.node('List', open, { elts });
  }

  parseBraceDisplay() {
    const open = this.next();
    const keys = [];
    const values = [];
    if (!this.isOp('}')) {
      const firstKey = this.parseExpr();
      if (!this.isOp(':')) throw notSupported('Les ensembles (set)', open.line);
      this.next();
      const firstValue = this.parseExpr();
      if (this.isKw('for')) throw notSupported('Les dictionnaires en compréhension', open.line);
      keys.push(firstKey);
      values.push(firstValue);
      while (this.acceptOp(',')) {
        if (this.isOp('}')) break;
        keys.push(this.parseExpr());
        this.expectOp(':', '« : » attendu entre la clé et la valeur');
        values.push(this.parseExpr());
      }
    }
    this.expectOp('}', `« } » attendu à la place de ${this.describe(this.tok)}`);
    return this.node('Dict', open, { keys, values });
  }

  parseStrings() {
    const first = this.tok;
    const parts = [];
    let isF = false;
    while (this.tok.type === 'STRING' || this.tok.type === 'FSTRING') {
      const t = this.next();
      if (t.type === 'STRING') parts.push({ kind: 'text', value: t.value });
      else {
        isF = true;
        parts.push(...this.parseFStringParts(t));
      }
    }
    if (!isF) return this.node('Constant', first, { value: parts.map((p) => p.value).join('') });
    return this.node('FString', first, { parts });
  }

  parseFStringParts(tok) {
    const { raw, rawStart, isRaw } = tok;
    const parts = [];
    let text = '';
    const flush = () => {
      if (text) parts.push({ kind: 'text', value: isRaw ? text : unescapeFStringText(text, tok.line) });
      text = '';
    };
    let k = 0;
    while (k < raw.length) {
      const ch = raw[k];
      if (ch === '{' && raw[k + 1] === '{') {
        text += '{';
        k += 2;
      } else if (ch === '}' && raw[k + 1] === '}') {
        text += '}';
        k += 2;
      } else if (ch === '}') {
        throw syntaxError('accolade « } » isolée dans la f-string : écris }} pour afficher une accolade', tok.line);
      } else if (ch === '{') {
        flush();
        k = this.parseFStringField(tok, raw, rawStart, k, parts);
      } else if (ch === '\\' && !isRaw && k + 1 < raw.length) {
        text += ch + raw[k + 1];
        k += 2;
      } else {
        text += ch;
        k++;
      }
    }
    flush();
    return parts;
  }

  /** Lit le champ {expression!conversion:format} qui commence en raw[k] ; renvoie la position suivante. */
  parseFStringField(tok, raw, rawStart, k, parts) {
    let depth = 0;
    let quote = null;
    let conv = -1;
    let spec = -1;
    let j = k + 1;
    for (; j < raw.length; j++) {
      const c = raw[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"') quote = c;
      else if ('([{'.includes(c)) depth++;
      else if (depth > 0 && ')]}'.includes(c)) depth--;
      else if (depth === 0 && c === '}') break;
      else if (depth === 0 && c === '!' && raw[j + 1] !== '=' && conv < 0) conv = j;
      else if (depth === 0 && c === ':' && spec < 0) {
        spec = j;
        j = raw.indexOf('}', j);
        if (j < 0) j = raw.length;
        break;
      }
    }
    if (j >= raw.length) throw syntaxError('accolade « { » non refermée dans la f-string', tok.line);
    const exprEnd = Math.min(...[conv, spec, j].filter((x) => x >= 0));
    let exprText = raw.slice(k + 1, exprEnd);
    let debug = null;
    const trimmed = exprText.trimEnd();
    if (trimmed.endsWith('=') && !/[=!<>]=$/.test(trimmed)) {
      debug = exprText;
      exprText = trimmed.slice(0, -1);
    }
    if (!exprText.trim()) throw syntaxError('expression vide entre accolades dans la f-string', tok.line);
    const conversion = conv >= 0 ? raw.slice(conv + 1, spec >= 0 ? spec : j).trim() : null;
    if (conversion !== null && !['r', 's', 'a'].includes(conversion)) {
      throw syntaxError(`conversion « !${conversion} » inconnue dans la f-string`, tok.line);
    }
    const formatSpec = spec >= 0 ? raw.slice(spec + 1, j) : '';
    if (formatSpec.includes('{')) throw notSupported('Un format imbriqué dans une f-string', tok.line);
    const lead = exprText.length - exprText.trimStart().length;
    const expr = parseSubExpression(exprText.trim(), rawStart + k + 1 + lead, tok.line);
    parts.push({ kind: 'expr', expr, conversion, formatSpec, debug });
    return j + 1;
  }
}

/** Analyse une expression isolée (contenu d'une f-string) et la recale dans le texte complet. */
function parseSubExpression(text, offset, line) {
  const { tokens } = tokenize(text);
  const parser = new Parser(tokens, text);
  const expr = parser.parseExprList();
  if (parser.tok.type !== 'NEWLINE' && parser.tok.type !== 'EOF') {
    throw syntaxError(`expression mal écrite dans la f-string : ${text}`, line);
  }
  shift(expr, offset, line);
  return expr;
}

function shift(node, offset, line) {
  if (Array.isArray(node)) {
    node.forEach((n) => shift(n, offset, line));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (typeof node.start === 'number' && typeof node.type === 'string') {
    node.start += offset;
    node.end += offset;
    node.line = line;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') shift(value, offset, line);
  }
}
