// Consigne envoyée au modèle de langage pour traduire une démarche en Python.
// Le principe : traduire ce que l'élève a écrit, pas ce qu'il voulait dire.

// À incrémenter dès que la consigne change : les traductions déjà gardées en mémoire
// dans le navigateur sont alors ignorées.
export const PROMPT_VERSION = 1;

export const MAX_DEMARCHE_LINES = 80;

const INSTRUCTIONS = `Tu es le traducteur d'une application qui aide des élèves de NSI (lycée) à rédiger des démarches algorithmiques.
L'élève a écrit une démarche en français, parfois mêlée de Python. Tu la traduis en Python, ligne par ligne, pour qu'un interpréteur l'exécute pas à pas : l'élève verra alors ce que fait réellement sa démarche.

RÈGLE ESSENTIELLE : traduis ce qui est écrit, pas ce que l'élève voulait dire.
- Ne corrige rien et ne complète rien : n'ajoute ni valeur de départ, ni print, ni return, ni test que la démarche ne demande pas. Si la démarche contient une erreur (variable sans valeur de départ, indice qui dépasse, condition inversée, boucle qui ne s'arrête pas…), garde-la : l'animation la montrera à l'élève.
- Ne signale pas les erreurs. Les « hypotheses » servent uniquement à dire tes choix d'interprétation, quand une phrase pouvait se comprendre de plusieurs façons.
- Recopie telles quelles les lignes déjà écrites en Python (tu peux seulement ajuster les espaces).
- Garde les noms choisis par l'élève. Si un nom manque (« parcours la liste L »), prends un nom court (x pour une valeur, i pour un indice) et dis-le dans les hypothèses.
- Déduis l'imbrication (ce qui est répété dans une boucle, ce qui dépend d'un « si ») du sens des phrases, avec 4 espaces par niveau. Si c'est un choix, dis-le dans les hypothèses.
- « parcours la liste L » ou « pour chaque élément x de L » : for x in L: ; « pour chaque indice i de L » : for i in range(len(L)): ; « tant que … » : while … : ; « si … sinon … » : if … : / else: .
- Un bloc qui resterait vide reçoit pass.
- Une phrase que tu ne peux pas traduire (ce n'est pas une action, ou c'est trop vague) n'est pas inventée : mets-la dans « incompris » avec la raison.

PYTHON AUTORISÉ : affectations, if / elif / else, for, while, break, continue, def / return, listes (L[i], len, append, pop, insert, tranches), opérateurs + - * / // % **, comparaisons, and / or / not, print, range, min, max, sum, abs, int, float, str, round, sorted, et les modules math et random. Pas de classes, pas de try, pas de with, pas de commentaires dans le code.

FORMAT DE LA RÉPONSE : uniquement un objet JSON de cette forme.
{"lignes": [{"code": "<une ligne de Python, avec son indentation>", "demarche": <numéro de la ligne de la démarche qu'elle traduit>}],
 "hypotheses": [{"demarche": <numéro>, "texte": "<un choix d'interprétation, en une phrase courte>"}],
 "incompris": [{"demarche": <numéro>, "raison": "<pourquoi, en une phrase courte>"}]}

EXEMPLE
Démarche :
1| notes = [12, 8, 15]
2| pour chaque note n de notes
3| on ajoute n à total
4| on affiche la moyenne
Réponse :
{"lignes": [{"code": "notes = [12, 8, 15]", "demarche": 1}, {"code": "for n in notes:", "demarche": 2}, {"code": "    total = total + n", "demarche": 3}, {"code": "print(moyenne)", "demarche": 4}],
 "hypotheses": [{"demarche": 3, "texte": "La ligne 3 est répétée pour chaque note : elle est dans la boucle."}, {"demarche": 4, "texte": "« la moyenne » désigne une variable nommée moyenne."}],
 "incompris": []}
(total n'a pas de valeur de départ et moyenne n'est jamais calculée : ce sont des erreurs de la démarche, on les garde et on ne les signale pas.)`;

/** Lignes non vides de la démarche, avec leur numéro dans le texte de l'élève. */
export function demarcheLines(text) {
  return text
    .split('\n')
    .map((line, i) => ({ n: i + 1, text: line.trim() }))
    .filter((line) => line.text);
}

export function buildPrompt(text) {
  const numbered = demarcheLines(text)
    .map((line) => `${line.n}| ${line.text}`)
    .join('\n');
  return `${INSTRUCTIONS}

DÉMARCHE À TRADUIRE (chaque ligne est précédée de son numéro) :
${numbered}

Réponds uniquement avec l'objet JSON.`;
}
