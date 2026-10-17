// Avancée dans la trace, une étape à la fois : pas de lecture automatique,
// c'est l'élève qui décide quand exécuter la ligne suivante.
export class Player {
  constructor({ onShow, onState }) {
    this.onShow = onShow; // (index) → affiche l'étape
    this.onState = onState; // () → met à jour le bouton « Pas à pas »
    this.count = 0;
    this.index = 0;
  }

  load(count) {
    this.count = count;
    this.show(0);
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
}
