// Traduit les événements d'une étape en phrases courtes, en français.
// Notation « x ← 12 » : celle de l'affectation dans les algorithmes en français.

const isSimpleName = (text) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(text);

// Une condition entourée de parenthèses est la même que sans : (x > m) et x > m.
const bare = (src) => src.trim().replace(/^\((.*)\)$/s, '$1').trim();

/** Ce que l'on fait ensuite, d'après la valeur de la condition. */
function consequence(e) {
  if (e.kind === 'while') return e.result ? 'donc on fait un tour de boucle' : 'donc la boucle while s’arrête';
  const where = e.kind === 'elif' ? 'du elif' : 'du if';
  if (e.result) return `donc on exécute le bloc ${where}`;
  if (e.next === 'else') return 'donc on passe au bloc else';
  if (e.next === 'elif') return 'donc on teste le elif suivant';
  return `donc on saute le bloc ${where}`;
}

function mutateText(e) {
  const t = e.target ?? 'la liste';
  switch (e.method) {
    case 'append':
      return `${e.value} est ajouté à la fin de ${t}`;
    case 'insert':
      return `${e.value} est inséré dans ${t} à l’indice ${e.index}`;
    case 'pop':
      return `${e.value} est retiré de ${t} (indice ${e.index})`;
    case 'remove':
      return `${e.value} est retiré de ${t}`;
    case 'del':
      return `L’élément d’indice ${e.index} est supprimé de ${t}`;
    case 'sort':
      return `${t} est triée`;
    case 'reverse':
      return `${t} est inversée`;
    case 'extend':
      return `${t} est prolongée`;
    case 'clear':
      return `${t} est vidée`;
    case 'shuffle':
      return `${t} est mélangée`;
    case 'slice':
      return `Une tranche de ${t} est remplacée`;
  }
  return `${t} est modifiée`;
}

/**
 * Chaque élément est soit une phrase { text, tone }, soit l'évaluation d'une condition
 * { src, values, bool } : « x > m ⟶ 12 > 4 : True », le booléen étant surligné.
 * @returns {{text?: string, src?: string, values?: string|null, bool?: boolean, tone?: 'flow'|'note'|'error'}[]}
 */
export function narrate(step, sourceLines) {
  if (step.kind === 'start') {
    return [{ text: 'Prêt. Clique sur « Pas à pas » (ou appuie sur →) pour exécuter la première ligne.', tone: 'flow' }];
  }
  const out = [];
  const iterVars = new Set(step.events.filter((e) => e.type === 'iter').map((e) => e.var));
  const compared = new Set(step.events.filter((e) => e.type === 'compare').map((e) => bare(e.src)));
  for (const e of step.events) {
    switch (e.type) {
      case 'iter':
        if ((e.kind === 'list' || e.kind === 'tuple') && isSimpleName(e.iter)) {
          out.push({ text: `${e.var} ← ${e.iter}[${e.index}] = ${e.value}` });
        } else {
          out.push({ text: `${e.var} ← ${e.value}` });
        }
        break;
      case 'loopEnd':
        out.push({
          text: e.kind === 'range' ? `Fin de la boucle for : ${e.var} a pris toutes ses valeurs` : `Fin du parcours de ${e.iter}`,
          tone: 'flow',
        });
        break;
      case 'assign':
        if (iterVars.has(e.name)) break;
        out.push({ text: e.fromText || e.fromVar ? `${e.name} ← ${e.fromText ?? e.fromVar} = ${e.value}` : `${e.name} ← ${e.value}` });
        break;
      case 'compare': {
        const values = `${e.left} ${e.op} ${e.right}`;
        out.push({ src: e.src, values: values === e.src ? null : values, bool: e.result });
        break;
      }
      case 'test':
        // la condition entière, sauf si c'est exactement la comparaison qui vient d'être affichée
        if (!compared.has(bare(e.src))) out.push({ src: e.src, values: null, bool: e.result });
        out.push({ text: consequence(e), tone: 'flow' });
        break;
      case 'write': {
        // d'où vient la valeur : une case de la même liste, d'une autre liste, ou une variable
        const source = e.from !== null ? `${e.name}[${e.from}]` : (e.fromText ?? e.fromVar);
        out.push({ text: `${e.name}[${e.index}] ← ${source ? `${source} = ` : ''}${e.value}` });
        break;
      }
      case 'mutate':
        out.push({ text: mutateText(e) });
        break;
      case 'call':
        out.push({ text: `Appel de ${e.name}(${e.args.map(([p, v]) => `${p} = ${v}`).join(', ')})`, tone: 'flow' });
        break;
      case 'return':
        out.push({
          text: e.implicit ? `${e.name}() se termine sans return : elle renvoie None` : `${e.name}() renvoie ${e.value}`,
          tone: 'flow',
        });
        break;
      case 'print':
        out.push({ text: `Affiche : ${e.text.replace(/\n$/, '')}` });
        break;
      case 'input':
        out.push({ text: `Lit l’entrée : ${e.value}` });
        break;
      case 'def':
        out.push({ text: `Définition de la fonction ${e.name}(${e.params.join(', ')})`, tone: 'flow' });
        break;
      case 'import':
        out.push({
          text: e.module ? `Import de ${e.names.join(', ')} depuis ${e.module}` : `Import du module ${e.names.join(', ')}`,
          tone: 'flow',
        });
        break;
      case 'assert':
        if (!compared.has(bare(e.src))) out.push({ src: e.src, values: null, bool: true });
        out.push({ text: 'donc la vérification (assert) réussit', tone: 'flow' });
        break;
      case 'note':
        out.push({ text: e.text, tone: 'note' });
        break;
      case 'break':
        out.push({ text: 'break : on sort immédiatement de la boucle', tone: 'flow' });
        break;
      case 'continue':
        out.push({ text: 'continue : on passe directement au tour suivant', tone: 'flow' });
        break;
      case 'dictSet':
        out.push({ text: `${e.name}[${e.key}] ← ${e.value}` });
        break;
      case 'delete':
        out.push({ text: `La variable ${e.name} est supprimée` });
        break;
    }
  }
  if (step.kind === 'end') out.push({ text: 'Fin du programme. Clique sur Exécuter pour recommencer.', tone: 'flow' });
  if (step.kind === 'error') {
    const where = step.error.line ? ` à la ligne ${step.error.line}` : '';
    out.push({ text: `Arrêt${where} : ${step.error.title.toLowerCase()}`, tone: 'error' });
  }
  if (out.length === 0 && step.line) {
    const code = sourceLines[step.line - 1]?.trim() ?? '';
    out.push({ text: code.startsWith('pass') ? 'pass : il n’y a rien à faire' : 'Rien de visible à cette étape', tone: 'flow' });
  }
  return out;
}

/** Phrase de la démarche associée à une ligne : son commentaire, ou les commentaires juste au-dessus. */
export function phraseFor(line, comments) {
  if (!line || !comments) return null;
  const own = comments.get(line);
  if (own && !own.alone && own.text) return own.text;
  const parts = [];
  for (let k = line - 1; comments.get(k)?.alone; k--) parts.unshift(comments.get(k).text);
  const text = parts.filter(Boolean).join(' ');
  return text || null;
}
