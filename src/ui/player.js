// Avancée dans la trace, une étape à la fois : pas de lecture automatique,
// c'est l'élève qui décide quand exécuter la ligne suivante (ou revenir en arrière).
export class Player {
  constructor({ onShow, onState }) {
    this.onShow = onShow; // (index) → affiche l'étape
    this.onState = onState; // () → met à jour les boutons
    this.count = 0;
    this.index = 0;
  }

  load(count, start = 0) {
    this.count = count;
    this.show(start);
  }

  /** Plus rien à lire (avant la première exécution). */
  reset() {
    this.count = 0;
    this.index = 0;
    this.onState();
  }

  show(k) {
    if (this.count === 0) return;
    this.index = Math.min(Math.max(k, 0), this.count - 1);
    this.onShow(this.index);
    this.onState();
  }

  get atEnd() {
    return this.index >= this.count - 1;
  }

  next() {
    if (!this.atEnd) this.show(this.index + 1);
  }

  prev() {
    if (this.index > 0) this.show(this.index - 1);
  }
}
