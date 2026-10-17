// Lecture de la trace : lecture / pause, pas à pas dans les deux sens, vitesse réglable.
export class Player {
  constructor({ onShow, onState }) {
    this.onShow = onShow; // (index) → affiche l'étape
    this.onState = onState; // () → met à jour les boutons
    this.count = 0;
    this.index = 0;
    this.playing = false;
    this.timer = null;
    this.delay = 600;
  }

  load(count, start = 0) {
    this.pause();
    this.count = count;
    this.show(start);
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

  play() {
    if (this.count < 2) return;
    if (this.atEnd) this.show(0);
    this.playing = true;
    this.onState();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      if (this.atEnd) {
        this.pause();
        return;
      }
      this.show(this.index + 1);
      if (this.atEnd) this.pause();
      else this.schedule();
    }, this.delay);
  }

  pause() {
    clearTimeout(this.timer);
    if (!this.playing) return;
    this.playing = false;
    this.onState();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  step(delta) {
    this.pause();
    this.show(this.index + delta);
  }

  setDelay(ms) {
    this.delay = ms;
    if (this.playing) this.schedule();
  }
}
