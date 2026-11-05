# Polices

Les polices sont stockées avec l'application : la page ne fait aucune requête vers un service
extérieur et s'affiche de la même façon hors connexion. `npm run build` les intègre au fichier
autonome `dist/demarche.html`.

| Fichier | Police | Usage | Licence |
| --- | --- | --- | --- |
| `playpen-sans.woff2` | Playpen Sans (TypeTogether) | écriture des phrases de la démarche (par défaut) | SIL OFL 1.1, `OFL-playpensans.txt` |
| `delius.woff2` | Delius (Natalia Raices) | écriture des phrases de la démarche, au choix | SIL OFL 1.1, `OFL-delius.txt` |
| `comic-neue.woff2` | Comic Neue (Craig Rozynski) | écriture des phrases de la démarche, au choix | SIL OFL 1.1, `OFL-comicneue.txt` |
| `atkinson-hyperlegible-next.woff2` | Atkinson Hyperlegible Next (Braille Institute), variable 200 à 800 | texte de l'interface | SIL OFL 1.1, `OFL-atkinsonhyperlegiblenext.txt` |
| `atkinson-hyperlegible-mono.woff2` | Atkinson Hyperlegible Mono (Braille Institute), variable 200 à 800 | code et valeurs | SIL OFL 1.1, `OFL-atkinsonhyperlegiblemono.txt` |

Les fichiers sont les sous-ensembles « latin » (lettres accentuées du français comprises)
distribués par Google Fonts. Les caractères absents (flèches, symboles) s'affichent avec les
polices du système.

Le menu « Écriture » de l'application choisit l'une des trois écritures (`src/ui/handwriting.js`) ;
dans `src/style.css`, `size-adjust` leur donne la même hauteur de minuscules.
