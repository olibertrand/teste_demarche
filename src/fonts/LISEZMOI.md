# Polices

Les polices sont stockées avec l'application : la page ne fait aucune requête vers un service
extérieur et s'affiche de la même façon hors connexion. `npm run build` les intègre au fichier
autonome `dist/demarche.html`.

| Fichier | Police | Usage | Licence |
| --- | --- | --- | --- |
| `patrick-hand.woff2` | Patrick Hand (Patrick Wagesreiter) | écriture manuscrite des phrases de la démarche | SIL OFL 1.1, `OFL-patrickhand.txt` |
| `atkinson-hyperlegible-next.woff2` | Atkinson Hyperlegible Next (Braille Institute), variable 200 à 800 | texte de l'interface | SIL OFL 1.1, `OFL-atkinsonhyperlegiblenext.txt` |
| `atkinson-hyperlegible-mono.woff2` | Atkinson Hyperlegible Mono (Braille Institute), variable 200 à 800 | code et valeurs | SIL OFL 1.1, `OFL-atkinsonhyperlegiblemono.txt` |

Les fichiers sont les sous-ensembles « latin » (lettres accentuées du français comprises)
distribués par Google Fonts. Les caractères absents (flèches, symboles) s'affichent avec les
polices du système.
