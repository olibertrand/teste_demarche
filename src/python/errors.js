// Erreurs Python, avec des messages en français pensés pour des élèves.

// Intitulé affiché à côté du nom Python de l'erreur (que l'élève retrouvera dans un vrai Python).
export const ERROR_TITLES = {
  SyntaxError: 'Erreur de syntaxe',
  IndentationError: "Erreur d'indentation",
  NameError: 'Nom inconnu',
  UnboundLocalError: 'Variable locale sans valeur',
  TypeError: 'Type incompatible',
  ValueError: 'Valeur incorrecte',
  IndexError: 'Indice hors de la liste',
  KeyError: 'Clé absente',
  ZeroDivisionError: 'Division par zéro',
  RecursionError: "Trop d'appels imbriqués",
  AssertionError: 'Assertion fausse',
  AttributeError: 'Méthode ou attribut inconnu',
  ImportError: 'Import impossible',
  EOFError: 'Entrée manquante',
  InternalError: 'Erreur interne',
  StepLimit: 'Programme arrêté',
  NotSupported: 'Pas encore pris en charge',
};

export class PyError extends Error {
  /**
   * @param {string} pyType  nom de l'erreur Python (NameError, IndexError…)
   * @param {string} message explication en français
   * @param {number|null} line ligne du programme (1 = première ligne)
   */
  constructor(pyType, message, line = null) {
    super(message);
    this.pyType = pyType;
    this.line = line;
  }

  get title() {
    return ERROR_TITLES[this.pyType] ?? this.pyType;
  }
}

export function syntaxError(message, line) {
  return new PyError('SyntaxError', message, line);
}
