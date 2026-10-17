// Traduit les événements d'une étape en phrases courtes, en français.
// Notation « x ← 12 » : celle de l'affectation dans les algorithmes en français.

const isSimpleName = (text) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(text);

function testText(e) {
  if (e.kind === 'while') {
    return e.result ? 'Condition vraie : on fait un tour de boucle' : 'Condition fausse : la boucle while s’arrête';
  }
  const where = e.kind === 'elif' ? 'du elif' : 'du if';
  if (e.result) return `Condition vraie : on exécute le bloc ${where}`;
  if (e.next === 'else') return 'Condition fausse : on passe au bloc else';
  if (e.next === 'elif') return 'Condition fausse : on teste le elif suivant';
  return `Condition fausse : on saute le bloc ${where}`;
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
 * @returns {{text: string, result?: boolean, tone?: 'flow'|'note'|'error'}[]}
 */
export function narrate(step, sourceLines) {
  if (step.kind === 'start') return [{ text: 'Prêt. Lance l’animation avec ▶ ou la touche Espace.', tone: 'flow' }];
  const out = [];
  const iterVars = new Set(step.events.filter((e) => e.type === 'iter').map((e) => e.var));
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
        if (!iterVars.has(e.name)) out.push({ text: `${e.name} ← ${e.value}` });
        break;
      case 'compare': {
        const values = `${e.left} ${e.op} ${e.right}`;
        out.push({ text: values === e.src ? e.src : `${e.src}   ⟶   ${values}`, result: e.result });
        break;
      }
      case 'test':
        out.push({ text: testText(e), tone: 'flow' });
        break;
      case 'write':
        out.push({
          text:
            e.from !== null
              ? `${e.name}[${e.index}] ← ${e.name}[${e.from}] = ${e.value}`
              : `${e.name}[${e.index}] ← ${e.value}`,
        });
        break;
      case 'swap':
        out.push({
          text:
            e.i === e.j
              ? `${e.name}[${e.i}] est échangé avec lui-même : il reste à sa place`
              : `Échange de ${e.name}[${e.i}] et ${e.name}[${e.j}]`,
        });
        break;
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
        out.push({ text: `Vérification : ${e.src}`, result: true });
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
  if (step.kind === 'end') out.push({ text: 'Fin du programme.', tone: 'flow' });
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
