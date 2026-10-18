# Polices

Les polices sont stockées avec l'application : la page ne fait aucune requête vers un service
extérieur et s'affiche de la même façon hors connexion. `npm run build` les intègre au fichier
autonome `dist/demarche.html`.

| Fichier | Police | Usage | Licence |
| --- | --- | --- | --- |
| `patrick-hand.woff2` | Patrick Hand (Patrick Wagesreiter) | écriture manuscrite des phrases de la démarche (par défaut) | SIL OFL 1.1, `OFL-patrickhand.txt` |
| `playpen-sans.woff2` | Playpen Sans (TypeTogether) | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-playpensans.txt` |
| `delius.woff2` | Delius (Natalia Raices) | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-delius.txt` |
| `comic-neue.woff2` | Comic Neue (Craig Rozynski) | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-comicneue.txt` |
| `klee-one.woff2` | Klee One (Fontworks) | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-kleeone.txt` |
| `gochi-hand.woff2` | Gochi Hand (Juan Pablo del Peral) | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-gochihand.txt` |
| `playwrite-fr-moderne.woff2` | Playwrite FR Moderne (TypeTogether), cursive scolaire | écriture proposée dans le menu « Écriture » | SIL OFL 1.1, `OFL-playwritefrmoderne.txt` |
| `atkinson-hyperlegible-next.woff2` | Atkinson Hyperlegible Next (Braille Institute), variable 200 à 800 | texte de l'interface ; écriture « lettres d'imprimerie » du menu | SIL OFL 1.1, `OFL-atkinsonhyperlegiblenext.txt` |
| `atkinson-hyperlegible-mono.woff2` | Atkinson Hyperlegible Mono (Braille Institute), variable 200 à 800 | code et valeurs | SIL OFL 1.1, `OFL-atkinsonhyperlegiblemono.txt` |

Les fichiers sont les sous-ensembles « latin » (lettres accentuées du français comprises)
distribués par Google Fonts ; Playwrite FR Moderne, qui n'est pas découpée, est le fichier complet.
Les caractères absents (flèches, symboles) s'affichent avec les polices du système.

Le menu « Écriture » est provisoire : il sert à comparer les écritures en situation. Quand l'une
d'elles sera retenue, il suffira de retirer les autres de `src/ui/handwriting.js`, de
`src/style.css` et de ce dossier (le fichier autonome redeviendra plus léger), puis d'ajuster les
marges de la phrase (`.phrase` dans `src/style.css`), prévues pour les grands jambages de la cursive.
